const { getServiceClient } = require('../lib/supabaseClient');
const { requireUser, requireRole } = require('../lib/auth');

const ALLOWED_LINE_TYPES = ['assembly', 'preparation'];

function genId() {
  return 'lc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
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
    if (req.query.upto) query = query.lte('date', req.query.upto);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    // Hanya IE yang boleh mengatur Setup Line.
    try {
      requireRole(user, ['ie']);
    } catch (err) {
      return res.status(err.status).json({ error: err.message });
    }

    const b = req.body || {};
    if (!b.line) {
      return res.status(400).json({ error: 'Line wajib diisi.' });
    }

    // line_config sekarang KHUSUS Setup Line (data fisik/kapasitas): MP, jam
    // kerja, jam mulai shift, jumlah mesin, jenis line, catatan. Data
    // Style/Qty Order/SMV/Plan Start-Finish/Delivery Date sudah pindah ke
    // /api/line-orders (endpoint terpisah, punya riwayat -- tidak ditimpa).
    const row = {
      line: String(b.line).trim(),
      date: todayStr(), // kolom lama, dipertahankan cuma buat urutan "terbaru" -- tidak lagi berarti histori per tanggal
      mp: Number(b.mp) || 0,
      wh: Number(b.wh) || 0,
      shift_start: b.shiftStart ? String(b.shiftStart).trim() : null,
      mesin: Number(b.mesin) || 0,
      line_type: ALLOWED_LINE_TYPES.includes(b.lineType) ? b.lineType : 'assembly',
      notes: String(b.notes || '').trim(),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    // upsert by line SAJA (bukan line+date). 1 line = 1 baris aktif, selalu
    // di-overwrite -- ini memang perilaku yang diinginkan untuk Setup Line
    // (beda dengan Order/Style yang harus punya riwayat, lihat line-orders.js).
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
    return res.status(200).json(data);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
};
