const { getServiceClient } = require('../lib/supabaseClient');
const { requireUser, requireRole, requireLineAccess } = require('../lib/auth');

function genId() {
  return 'at' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
    let query = supabase.from('attendance').select('*').order('date', { ascending: false });
    if (req.query.line) query = query.eq('line', req.query.line);
    if (req.query.date) query = query.eq('date', req.query.date);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    try {
      requireRole(user, ['supervisor', 'ie']);
    } catch (err) {
      return res.status(err.status).json({ error: err.message });
    }

    const b = req.body || {};
    if (!b.line || !b.date) {
      return res.status(400).json({ error: 'Line dan tanggal wajib diisi.' });
    }

    try {
      requireLineAccess(user, String(b.line).trim());
    } catch (err) {
      return res.status(err.status).json({ error: err.message });
    }

    const row = {
      line: String(b.line).trim(),
      date: String(b.date).trim(),
      present_count: Number(b.presentCount) || 0,
      absent_count: Number(b.absentCount) || 0,
      input_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from('attendance')
      .select('id')
      .eq('line', row.line)
      .eq('date', row.date)
      .maybeSingle();

    row.id = existing ? existing.id : genId();

    const { data, error } = await supabase
      .from('attendance')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
};
