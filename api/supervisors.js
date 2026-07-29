const { getServiceClient } = require('../lib/supabaseClient');
const { requireUser } = require('../lib/auth');

// Endpoint PUBLIK untuk semua role yang sudah login (IE / Supervisor / Tamu).
// Beda dengan /api/admin/users (khusus IE, isinya lengkap termasuk email),
// endpoint ini SENGAJA hanya mengembalikan { line, full_name, photo_url }
// supaya siapa pun yang klik kartu andon bisa lihat nama & foto Supervisor
// penanggung jawab line itu, tanpa membocorkan data akun lain (email, dst).
module.exports = async (req, res) => {
  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = getServiceClient();
  let query = supabase
    .from('profiles')
    .select('line, full_name, photo_url')
    .eq('role', 'supervisor');

  if (req.query.line) query = query.eq('line', req.query.line);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json(data);
};
