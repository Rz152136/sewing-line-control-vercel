const { getServiceClient } = require('../lib/supabaseClient');
const { requireUser, requireRole } = require('../lib/auth');

function genId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------------------------------------------------------------------------
// resource=manpower -- digabung ke sini (bukan file /api terpisah) supaya
// tidak nambah 1 Serverless Function lagi (limit 12 di Vercel Hobby).
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// resource=assignments -- penugasan manpower ke proses. Sengaja terpisah
// dari tabel line_processes dan dikunci ke (line, style, nama_proses, nik)
// -- BUKAN ke id baris proses -- supaya:
//   1) satu proses bisa dipasangkan ke BANYAK operator (dan sebaliknya, satu
//      operator bisa dipasang ke banyak proses -- itu sudah otomatis bisa).
//   2) paste ulang breakdown (ganti SMV dsb) tidak menghapus assignment yang
//      sudah ada, selama nama_proses-nya sama persis -- karena breakdown
//      re-paste bikin id baris baru, tapi assignment tidak nempel ke id itu.
// SMV dihitung PENUH untuk tiap operator yang dipasang ke suatu proses (tidak
// dibagi), sesuai keputusan bisnis.
// ---------------------------------------------------------------------------
async function handleAssignments(req, res, supabase, user) {
  if (req.method === 'GET') {
    let query = supabase.from('line_process_assignments').select('*').order('nama_proses', { ascending: true });
    if (req.query.line) query = query.eq('line', req.query.line);
    if (req.query.style) query = query.eq('style', req.query.style);
    const { data, error } = await query;
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
    const line = String(b.line || '').trim();
    const style = String(b.style || '').trim();
    const namaProses = String(b.namaProses || '').trim();
    const nik = String(b.nik || '').trim();
    if (!line || !style || !namaProses || !nik) {
      return res.status(400).json({ error: 'Line, Style, Nama Proses, dan NIK wajib diisi.' });
    }

    const { data: mp, error: mpErr } = await supabase
      .from('manpower')
      .select('nik, nama')
      .eq('nik', nik)
      .maybeSingle();
    if (mpErr) return res.status(500).json({ error: mpErr.message });
    if (!mp) return res.status(404).json({ error: 'NIK tidak ditemukan di database manpower.' });

    const row = {
      line, style, nama_proses: namaProses, nik,
      nama: mp.nama,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { data: existing, error: existErr } = await supabase
      .from('line_process_assignments')
      .select('id')
      .eq('line', line).eq('style', style).eq('nama_proses', namaProses).eq('nik', nik)
      .limit(1);
    if (existErr) return res.status(500).json({ error: existErr.message });

    row.id = (existing && existing.length) ? existing[0].id : genId('lpa');

    const { data, error } = await supabase
      .from('line_process_assignments')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    try {
      requireRole(user, ['ie']);
    } catch (err) {
      return res.status(err.status).json({ error: err.message });
    }

    const id = String(req.query.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id assignment wajib diisi.' });

    const { error } = await supabase.from('line_process_assignments').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
}

module.exports = async (req, res) => {
  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const supabase = getServiceClient();

  if (req.query.resource === 'manpower') return handleManpower(req, res, supabase, user);
  if (req.query.resource === 'assignments') return handleAssignments(req, res, supabase, user);

  if (req.method === 'GET') {
    // Semua role boleh baca (dipakai untuk tampilan Detail Line & Skill Matrix).
    // Breakdown proses sekarang murni per Style (bukan lagi per Line+Style) --
    // style yang sama dipakai di line manapun otomatis pakai breakdown yang sama.
    let query = supabase
      .from('line_processes')
      .select('*')
      .order('no_proses', { ascending: true });
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
    const style = String(b.style || '').trim();
    const rows = Array.isArray(b.rows) ? b.rows : [];

    if (!style) {
      return res.status(400).json({ error: 'Style wajib diisi.' });
    }
    if (!rows.length) {
      return res.status(400).json({ error: 'Tidak ada baris proses untuk disimpan.' });
    }

    // Paste dari Excel = ganti total breakdown untuk style ini (No.
    // Proses/Nama Proses/SMV/Nama Mesin). Breakdown ini berlaku untuk style
    // itu di LINE MANAPUN dia dijalankan -- tidak perlu diulang per line lagi.
    // Operator TIDAK disimpan di sini -- lihat resource=assignments di atas,
    // yang dikunci ke (line, style, nama_proses) sehingga tetap per-line dan
    // aman walau breakdown ini di-paste ulang.
    const { error: delErr } = await supabase
      .from('line_processes')
      .delete()
      .eq('style', style);

    if (delErr) return res.status(500).json({ error: delErr.message });

    const now = new Date().toISOString();
    const toInsert = rows.map((r) => ({
      id: genId('lp'),
      style,
      no_proses: Number(r.noProses) || 0,
      nama_proses: String(r.namaProses || '').trim(),
      smv: Number(r.smv) || 0,
      nama_mesin: String(r.namaMesin || '').trim(),
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
    // (dipakai tombol "Hapus Semua" sebelum paste ulang, kalau perlu). Ikut
    // menghapus assignment-nya juga, supaya tidak jadi sampah data.
    try {
      requireRole(user, ['ie']);
    } catch (err) {
      return res.status(err.status).json({ error: err.message });
    }

    const style = String(req.query.style || '').trim();
    if (!style) {
      return res.status(400).json({ error: 'Style wajib diisi.' });
    }

    const { error } = await supabase
      .from('line_processes')
      .delete()
      .eq('style', style);
    if (error) return res.status(500).json({ error: error.message });

    // Breakdown proses style ini hilang di semua line -- ikut bersihkan
    // SEMUA assignment operator untuk style ini di line manapun, supaya
    // tidak jadi sampah data yang nunjuk ke proses yang sudah tidak ada.
    await supabase
      .from('line_process_assignments')
      .delete()
      .eq('style', style);
    // (kalau baris ini gagal, tidak dianggap fatal -- breakdown utamanya sudah kehapus)

    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
};
