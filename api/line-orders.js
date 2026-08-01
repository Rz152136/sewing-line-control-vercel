const { getServiceClient } = require('../lib/supabaseClient');
const { requireUser, requireRole } = require('../lib/auth');

function genId() {
  return 'lo' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
    // Semua role boleh baca (dipakai untuk hitung BLC di halaman Detail Line).
    let query = supabase.from('line_orders').select('*').order('plan_start', { ascending: true });
    if (req.query.line) query = query.eq('line', req.query.line);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    // Normalnya baris riwayat di sini otomatis dibuat/diupdate oleh endpoint
    // /api/line-config setiap kali style/plan_start berubah. Endpoint ini
    // dibuka juga untuk IE supaya bisa membetulkan riwayat secara manual
    // kalau perlu (mis. salah input qty_order/plan_finish untuk order lama).
    try {
      requireRole(user, ['ie']);
    } catch (err) {
      return res.status(err.status).json({ error: err.message });
    }

    const b = req.body || {};
    const line = String(b.line || '').trim();
    const style = String(b.style || '').trim();
    const planStart = b.planStart ? String(b.planStart).trim() : '';
    if (!line || !style || !planStart) {
      return res.status(400).json({ error: 'Line, Style, dan Plan Start wajib diisi.' });
    }

    const row = {
      line,
      style,
      plan_start: planStart,
      plan_finish: b.planFinish || null,
      qty_order: Number(b.qtyOrder) || 0,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { data: existingRows, error: existingErr } = await supabase
      .from('line_orders')
      .select('id')
      .eq('line', line)
      .eq('style', style)
      .eq('plan_start', planStart)
      .limit(1);

    if (existingErr) return res.status(500).json({ error: existingErr.message });

    row.id = (existingRows && existingRows.length) ? existingRows[0].id : genId();

    const { data, error } = await supabase
      .from('line_orders')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
};
