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

  if (req.query.resource === 'manpower') {
    return handleManpower(req, res, supabase, user);
  }

  if (req.method === 'GET') {
    // Semua role boleh baca (dipakai untuk tampilan Detail Line & Skill Matrix).
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

    // Paste dari Excel = ganti total breakdown untuk line+style ini (No.
    // Proses/Nama Proses/SMV/Nama Mesin -- TANPA operator, operator dipasang
    // lewat panel Cocokkan Manpower / PATCH di bawah).
    //
    // PENTING: supaya paste ulang (mis. betulkan SMV yang salah ketik) tidak
    // menghapus manpower yang sudah dicocokkan sebelumnya, kita simpan dulu
    // assignment lama (nik + nama_operator) per nama_proses, lalu pasangkan
    // lagi ke baris baru yang nama prosesnya sama persis.
    const { data: oldRows, error: oldErr } = await supabase
      .from('line_processes')
      .select('nama_proses, nik, nama_operator')
      .eq('line', line)
      .eq('style', style);

    if (oldErr) return res.status(500).json({ error: oldErr.message });

    const prevAssignByProcess = {};
    (oldRows || []).forEach((r) => {
      if (r.nik) prevAssignByProcess[r.nama_proses] = { nik: r.nik, nama_operator: r.nama_operator };
    });

    const { error: delErr } = await supabase
      .from('line_processes')
      .delete()
      .eq('line', line)
      .eq('style', style);

    if (delErr) return res.status(500).json({ error: delErr.message });

    const now = new Date().toISOString();
    const toInsert = rows.map((r) => {
      const namaProses = String(r.namaProses || '').trim();
      const prev = prevAssignByProcess[namaProses];
      return {
        id: genId(),
        line,
        style,
        no_proses: Number(r.noProses) || 0,
        nama_proses: namaProses,
        smv: Number(r.smv) || 0,
        nama_mesin: String(r.namaMesin || '').trim(),
        nik: prev ? prev.nik : null,
        nama_operator: prev ? prev.nama_operator : '',
        updated_by: user.id,
        updated_at: now,
      };
    });

    const { data, error } = await supabase
      .from('line_processes')
      .insert(toInsert)
      .select();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'PATCH') {
    // Hanya IE. Pasang/lepas 1 manpower ke 1 baris proses (dipakai panel
    // "Cocokkan Manpower"). Kirim { id, nik } untuk pasang, atau { id, nik:
    // null } untuk lepas.
    try {
      requireRole(user, ['ie']);
    } catch (err) {
      return res.status(err.status).json({ error: err.message });
    }

    const b = req.body || {};
    const id = String(b.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id baris proses wajib diisi.' });

    let nik = b.nik ? String(b.nik).trim() : null;
    let namaOperator = '';

    if (nik) {
      const { data: mp, error: mpErr } = await supabase
        .from('manpower')
        .select('nik, nama')
        .eq('nik', nik)
        .maybeSingle();
      if (mpErr) return res.status(500).json({ error: mpErr.message });
      if (!mp) return res.status(404).json({ error: 'NIK tidak ditemukan di database manpower.' });
      namaOperator = mp.nama;
    } else {
      nik = null;
    }

    const { data, error } = await supabase
      .from('line_processes')
      .update({ nik, nama_operator: namaOperator, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

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

  res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
};

async function handleManpower(req, res, supabase, user) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('manpower').select('*').order('nama', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
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
}
