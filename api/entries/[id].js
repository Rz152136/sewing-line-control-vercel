const { getSupabase } = require('../../lib/entries');
const { requireUser, requireRole } = require('../../lib/auth');

module.exports = async (req, res) => {
  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const { id } = req.query;

  if (req.method === 'DELETE') {
    // Hanya IE (superadmin) yang boleh menghapus data.
    try {
      requireRole(user, ['ie']);
    } catch (err) {
      return res.status(err.status).json({ error: err.message });
    }

    const { data, error } = await supabase
      .from('entries')
      .delete()
      .eq('id', id)
      .select();

    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Data tidak ditemukan.' });
    }
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', ['DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
};
