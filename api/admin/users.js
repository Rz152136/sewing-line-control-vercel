const { requireUser, requireRole } = require('../../lib/auth');
const { getServiceClient } = require('../../lib/supabaseClient');

const ALLOWED_ROLES = ['supervisor', 'ie', 'tamu'];

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
      .select('id, email, full_name, role, line, created_at')
      .order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // ---------- POST: buat user baru ----------
  if (req.method === 'POST') {
    const { email, password, fullName, role, line } = req.body || {};

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

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: created.user.id,
        email,
        full_name: fullName || '',
        role,
        line: role === 'supervisor' ? String(line).trim() : null,
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

  // ---------- PATCH: ubah role / nama / line user ----------
  if (req.method === 'PATCH') {
    const { id, role, fullName, line } = req.body || {};
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
        
