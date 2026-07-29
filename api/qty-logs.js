const { getServiceClient } = require('../lib/supabaseClient');
const { requireUser, requireRole, requireLineAccess } = require('../lib/auth');

const VALID_SLOTS = [
  '07:00-08:00', '08:00-09:00', '09:00-10:00', '10:00-11:00',
  '11:00-12:00', '12:00-13:00', '13:00-14:00', '14:00-15:00',
  '15:00-16:00', '16:00-17:00', '17:00-18:00', '18:00-19:00',
  '19:00-20:00', '20:00-21:00', '21:00-22:00', '22:00-23:00',
  '23:00-00:00', '00:00-01:00', '01:00-02:00', '02:00-03:00',
  '03:00-04:00', '04:00-05:00', '05:00-06:00', '06:00-07:00',
];

function genId() {
  return 'ql' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
    // Semua role boleh baca (dashboard perlu ini). Kalau tidak ada filter
    // line, tetap boleh baca semua (dipakai dashboard IE/Tamu).
    let query = supabase.from('qty_logs').select('*').order('date', { ascending: false });
    if (req.query.line) query = query.eq('line', req.query.line);
    if (req.query.date) query = query.eq('date', req.query.date);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    // Supervisor hanya boleh input untuk line miliknya sendiri. IE bebas.
    try {
      requireRole(user, ['supervisor', 'ie']);
    } catch (err) {
      return res.status(err.status).json({ error: err.message });
    }

    const b = req.body || {};
    if (!b.line || !b.date || !b.slot) {
      return res.status(400).json({ error: 'Line, tanggal, dan slot jam wajib diisi.' });
    }
    if (!VALID_SLOTS.includes(b.slot)) {
      return res.status(400).json({ error: 'Slot jam tidak valid.' });
    }

    try {
      requireLineAccess(user, String(b.line).trim());
    } catch (err) {
      return res.status(err.status).json({ error: err.message });
    }

    const row = {
      line: String(b.line).trim(),
      date: String(b.date).trim(),
      slot: b.slot,
      qty: Number(b.qty) || 0,
      input_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from('qty_logs')
      .select('id')
      .eq('line', row.line)
      .eq('date', row.date)
      .eq('slot', row.slot)
      .maybeSingle();

    row.id = existing ? existing.id : genId();

    const { data, error } = await supabase
      .from('qty_logs')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
};
