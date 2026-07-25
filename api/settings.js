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
    // Semua role boleh baca (dipakai utk hitung KPI Contribution di dashboard semua role).
    const { data, error } = await supabase.from('app_settings').select('*');
    if (error) return res.status(500).json({ error: error.message });
    const map = {};
    (data || []).forEach(r => { map[r.key] = r.value; });
    return res.status(200).json(map);
  }

  if (req.method === 'POST') {
    // Hanya IE yang boleh mengubah pengaturan global.
    try {
      requireRole(user, ['ie']);
    } catch (err) {
      return res.status(err.status).json({ error: err.message });
    }

    const { key, value } = req.body || {};
    if (!key || value === undefined || value === null || isNaN(Number(value))) {
      return res.status(400).json({ error: 'key dan value (angka) wajib diisi.' });
    }

    const { data, error } = await supabase
      .from('app_settings')
      .upsert(
        { key: String(key).trim(), value: Number(value), updated_by: user.id, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
};
