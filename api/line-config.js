const { getServiceClient } = require('../lib/supabaseClient');
const { requireUser, requireRole } = require('../lib/auth');

const ALLOWED_LINE_TYPES = ['assembly', 'preparation'];

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
    // 'upto' dipertahankan untuk kompatibilitas lama, tapi sejak line_config
    // hanya 1 baris aktif per line (tidak ada histori per tanggal), filter ini
    // umumnya tidak perlu dipakai lagi -- ambil tanpa parameter untuk config
    // terkini semua line.
    if (req.query.upto) query = query.lte('date', req.query.upto);
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
      shift_start: b.shiftStart ? String(b.shiftStart).trim() : null,
      target_output: Number(b.targetOutput) || 0,
      mesin: Number(b.mesin) || 0,
      line_type: ALLOWED_LINE_TYPES.includes(b.lineType) ? b.lineType : 'assembly',
      notes: String(b.notes || '').trim(),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    // upsert by line SAJA (bukan line+date). Sesuai keputusan: 1 line = 1 baris
    // aktif, selalu di-overwrite -- tidak menyimpan histori per tanggal lagi.
    // Pakai order+limit(1) alih-alih maybeSingle() supaya kalau (karena data lama
    // sebelum migrasi) masih ada lebih dari satu baris untuk line yang sama,
    // sistem tetap konsisten meng-update baris yang paling baru, bukan diam-diam
    // membuat baris baru.
    const { data: existingRows, error: existingErr } = await supabase
      .from('line_config')
      .select('id')
      .eq('line', row.line)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (existingErr) return res.status(500).json({ error: existingErr.message });

    row.id = (existingRows && existingRows.length) ? existingRows[0].id : genId();

    const { data, error } = await supabase
      .from('line_config')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Catat/perbarui riwayat order ke line_orders, dipakai untuk hitung BLC
    // yang diakumulasi dari SEMUA order yang pernah jalan di line ini (bukan
    // cuma yang aktif sekarang). Cukup jalan kalau style & plan_start terisi;
    // gagal di bagian ini TIDAK menggagalkan simpan line_config utamanya --
    // cuma dicatat di response biar kelihatan di log kalau ada masalah.
    let orderHistoryWarning = null;
    if (row.style && row.plan_start) {
      try {
        const orderRow = {
          line: row.line,
          style: row.style,
          plan_start: row.plan_start,
          plan_finish: row.plan_finish,
          qty_order: row.qty_order,
          updated_by: user.id,
          updated_at: row.updated_at,
        };
        const { data: existingOrders, error: existingOrderErr } = await supabase
          .from('line_orders')
          .select('id')
          .eq('line', orderRow.line)
          .eq('style', orderRow.style)
          .eq('plan_start', orderRow.plan_start)
          .limit(1);
        if (existingOrderErr) throw existingOrderErr;
        orderRow.id = (existingOrders && existingOrders.length)
          ? existingOrders[0].id
          : ('lo' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
        const { error: upsertOrderErr } = await supabase
          .from('line_orders')
          .upsert(orderRow, { onConflict: 'id' });
        if (upsertOrderErr) throw upsertOrderErr;
      } catch (err) {
        orderHistoryWarning = err.message;
      }
    }

    return res.status(200).json(orderHistoryWarning ? { ...data, _orderHistoryWarning: orderHistoryWarning } : data);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
};
