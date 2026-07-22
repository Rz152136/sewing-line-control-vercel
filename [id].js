const { getSupabase } = require('../../lib/entries');

module.exports = async (req, res) => {
  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const { id } = req.query;

  if (req.method === 'DELETE') {
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
