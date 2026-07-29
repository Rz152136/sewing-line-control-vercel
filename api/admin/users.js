const { requireUser, requireRole } = require('../../lib/auth');
const { getServiceClient } = require('../../lib/supabaseClient');

const ALLOWED_ROLES = ['supervisor', 'ie', 'tamu'];
const PHOTO_BUCKET = 'supervisor-photos';
const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2MB -- frontend sudah resize sebelum kirim

// Upload foto (data URI base64) ke Supabase Storage, kembalikan public URL.
// Dilempar sebagai error {status, message} kalau gagal, supaya gampang
// ditangkap di handler POST/PATCH tanpa mengulang boilerplate try/catch.
async function uploadPhotoIfProvided(supabase, userId, photoBase64) {
  if (!photoBase64) return undefined; // undefined = tidak ada perubahan foto
  const match = /^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i.exec(photoBase64);
  if (!match) {
    throw { status: 400, message: 'Format foto tidak didukung (gunakan PNG/JPG/WEBP).' };
  }
  const mime = match[1].toLowerCase();
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_PHOTO_BYTES) {
    throw { status: 400, message: 'Ukuran foto maksimal 2MB.' };
  }

  const path = `${userId}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, buffer, { contentType: mime, upsert: true });
  if (uploadError) {
    throw { status: 500, message: 'Gagal upload foto: ' + uploadError.message };
  }

  const { data: pub } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return pub.publicUrl;
}

module.exports = async (req, res) => {
  let user;
  try {
    user = await requireUser(req);
    requireRole(user, ['ie']); // seluruh endpoint ini khusus superadmin (IE)
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const supabase = getServiceClient();

  // ---------- GET: daftar semua user ----------
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, line, photo_url, created_at')
      .order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // ---------- POST: buat user baru ----------
  if (req.method === 'POST') {
    const { email, password, fullName, role, line, photoBase64 } = req.body || {};

    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Email, password, dan role wajib diisi.' });
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Role tidak valid.' });
    }
    if (role === 'supervisor' && !line) {
      return res.status(400).json({ error: 'Line wajib diisi untuk role Supervisor.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password minimal 6 karakter.' });
    }

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // langsung aktif, tidak perlu konfirmasi email
    });

    if (createError) {
      return res.status(400).json({ error: createError.message });
    }

    // Upload foto dulu (kalau ada) sebelum insert profil, supaya photo_url
    // bisa langsung ikut ditulis dalam satu insert (bukan dua roundtrip DB).
    let photoUrl = null;
    try {
      const uploaded = await uploadPhotoIfProvided(supabase, created.user.id, photoBase64);
      if (uploaded) photoUrl = uploaded;
    } catch (err) {
      // Rollback auth user kalau foto gagal diupload, supaya tidak ada akun setengah jadi.
      await supabase.auth.admin.deleteUser(created.user.id).catch(() => {});
      return res.status(err.status || 500).json({ error: err.message });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: created.user.id,
        email,
        full_name: fullName || '',
        role,
        line: role === 'supervisor' ? String(line).trim() : null,
        photo_url: photoUrl,
      })
      .select()
      .single();

    if (profileError) {
      // rollback: hapus auth user kalau gagal simpan profil, supaya tidak jadi akun "yatim"
      await supabase.auth.admin.deleteUser(created.user.id).catch(() => {});
      return res.status(500).json({ error: profileError.message });
    }

    return res.status(200).json(profile);
  }

  // ---------- PATCH: ubah role / nama / line / foto user ----------
  if (req.method === 'PATCH') {
    const { id, role, fullName, line, photoBase64 } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id wajib diisi.' });
    if (id === user.id && role && role !== 'ie') {
      return res.status(400).json({ error: 'Tidak bisa menurunkan role akun sendiri.' });
    }

    const updates = {};
    if (role !== undefined) {
      if (!ALLOWED_ROLES.includes(role)) {
        return res.status(400).json({ error: 'Role tidak valid.' });
      }
      updates.role = role;
    }
    if (fullName !== undefined) updates.full_name = fullName;
    if (line !== undefined) updates.line = line ? String(line).trim() : null;

    if (photoBase64 !== undefined) {
      try {
        const uploaded = await uploadPhotoIfProvided(supabase, id, photoBase64);
        if (uploaded !== undefined) updates.photo_url = uploaded;
      } catch (err) {
        return res.status(err.status || 500).json({ error: err.message });
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Tidak ada perubahan yang dikirim.' });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // ---------- DELETE: hapus user ----------
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id wajib diisi.' });
    if (id === user.id) {
      return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri.' });
    }

    const { error: delAuthError } = await supabase.auth.admin.deleteUser(id);
    if (delAuthError) return res.status(500).json({ error: delAuthError.message });

    await supabase.from('profiles').delete().eq('id', id); // jaga-jaga, seharusnya sudah cascade
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
};
