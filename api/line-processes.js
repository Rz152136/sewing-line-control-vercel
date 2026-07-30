const { getServiceClient } = require('../lib/supabaseClient');
const { requireUser, requireRole } = require('../lib/auth');

function genId() {
  return 'lp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

module.exports = async (req, res) => {
  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const supabase = getServiceClient();

  if (req.method === 'GET') {
    // Semua role boleh baca (dipakai untuk tampilan Detail Line).
    let query = supabase
      .from('line_processes')
      .select('*')
      .order('no_proses', { ascending: true });
    if (req.query.line) query = query.eq('line', req.query.line);
    if (req.query.style) query = query.eq('style', req.query.style);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    // Hanya IE yang boleh mengisi breakdown proses.
    try {
      requireRole(user, ['ie']);
    } catch (err) {
      return res.status(err.status).json({ error: err.message });
    }

    const b = req.body || {};
    const line = String(b.line || '').trim();
    const style = String(b.style || '').trim();
    const rows = Array.isArray(b.rows) ? b.rows : [];

    if (!line || !style) {
      return res.status(400).json({ error: 'Line dan Style wajib diisi.' });
    }
    if (!rows.length) {
      return res.status(400).json({ error: 'Tidak ada baris proses untuk disimpan.' });
    }

    // Paste dari Excel = ganti total breakdown untuk line+style ini
    // (hapus semua baris lama, lalu masukkan baris baru), supaya paste ulang
    // tidak menumpuk data duplikat -- konsisten dengan perilaku overwrite
    // yang sudah dipakai di line_config.
    const { error: delErr } = await supabase
      .from('line_processes')
      .delete()
      .eq('line', line)
      .eq('style', style);

    if (delErr) return res.status(500).json({ error: delErr.message });

    const now = new Date().toISOString();
    const toInsert = rows.map((r) => ({
      id: genId(),
      line,
      style,
      no_proses: Number(r.noProses) || 0,
      nama_proses: String(r.namaProses || '').trim(),
      smv: Number(r.smv) || 0,
      nama_operator: String(r.namaOperator || '').trim(),
      updated_by: user.id,
      updated_at: now,
    }));

    const { data, error } = await supabase
      .from('line_processes')
      .insert(toInsert)
      .select();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    // Hanya IE. Hapus seluruh breakdown untuk 1 line+style sekaligus
    // (dipakai tombol "Hapus Semua" sebelum paste ulang, kalau perlu).
    try {
      requireRole(user, ['ie']);
    } catch (err) {
      return res.status(err.status).json({ error: err.message });
    }

    const line = String(req.query.line || '').trim();
    const style = String(req.query.style || '').trim();
    if (!line || !style) {
      return res.status(400).json({ error: 'Line dan Style wajib diisi.' });
    }

    const { error } = await supabase
      .from('line_processes')
      .delete()
      .eq('line', line)
      .eq('style', style);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
};
