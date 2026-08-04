const { getServiceClient } = require('../lib/supabaseClient');
const { requireUser, requireRole } = require('../lib/auth');

module.exports = async (req, res) => {
  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const supabase = getServiceClient();

  if (req.method === 'GET') {
    // Semua role boleh baca (dipakai untuk pencarian di panel Cocokkan Manpower).
    const { data, error } = await supabase.from('manpower').select('*').order('nama', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    // Hanya IE. Paste dari Excel = upsert per NIK (nambah yang baru, update
    // nama yang NIK-nya sudah ada) -- BEDA dengan line-processes, di sini
    // TIDAK menghapus semua data lama, karena database manpower makin lama
    // makin bertambah, bukan diganti total tiap paste.
    try {
      requireRole(user, ['ie']);
    } catch (err) {
      return res.status(err.status).json({ error: err.message });
    }

    const b = req.body || {};
    const rows = Array.isArray(b.rows) ? b.rows : [];
    if (!rows.length) {
      return res.status(400).json({ error: 'Tidak ada baris manpower untuk disimpan.' });
    }

    const now = new Date().toISOString();
    const toUpsert = rows
      .map((r) => ({
        nik: String(r.nik || '').trim(),
        nama: String(r.nama || '').trim(),
        updated_by: user.id,
        updated_at: now,
      }))
      .filter((r) => r.nik && r.nama);

    if (!toUpsert.length) {
      return res.status(400).json({ error: 'Baris yang dikirim tidak punya NIK/Nama yang valid.' });
    }

    const { data, error } = await supabase
      .from('manpower')
      .upsert(toUpsert, { onConflict: 'nik' })
      .select();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    // Hanya IE. Hapus 1 orang by NIK (buat betulin salah paste).
    try {
      requireRole(user, ['ie']);
    } catch (err) {
      return res.status(err.status).json({ error: err.message });
    }

    const nik = String(req.query.nik || '').trim();
    if (!nik) return res.status(400).json({ error: 'NIK wajib diisi.' });

    const { error } = await supabase.from('manpower').delete().eq('nik', nik);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
};
