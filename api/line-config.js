const { getServiceClient } = require('../lib/supabaseClient');
const { requireUser, requireRole } = require('../lib/auth');

function genId() {
  return 'lc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
    // Semua role boleh baca (dipakai untuk hitung target di dashboard/summary).
    let query = supabase.from('line_config').select('*').order('date', { ascending: false });
    if (req.query.line) query = query.eq('line', req.query.line);
    if (req.query.date) query = query.eq('date', req.query.date);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    // Hanya IE yang boleh mengatur variabel per line.
    try {
      requireRole(user, ['ie']);
    } catch (err) {
      return res.status(err.status).json({ error: err.message });
    }

    const b = req.body || {};
    if (!b.line || !b.date) {
      return res.status(400).json({ error: 'Line dan tanggal wajib diisi.' });
    }

    const row = {
      line: String(b.line).trim(),
      date: String(b.date).trim(),
      style: String(b.style || '').trim(),
      qty_order: Number(b.qtyOrder) || 0,
      plan_start: b.planStart || null,
      plan_finish: b.planFinish || null,
      smv: Number(b.smv) || 0,
      mp: Number(b.mp) || 0,
      wh: Number(b.wh) || 0,
      target_output: Number(b.targetOutput) || 0,
      notes: String(b.notes || '').trim(),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    // upsert by (line, date)
    const { data: existing } = await supabase
      .from('line_config')
      .select('id')
      .eq('line', row.line)
      .eq('date', row.date)
      .maybeSingle();

    row.id = existing ? existing.id : genId();

    const { data, error } = await supabase
      .from('line_config')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
};
