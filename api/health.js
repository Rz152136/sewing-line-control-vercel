const { getSupabase } = require('../lib/entries');

module.exports = async (req, res) => {
  try {
    const supabase = getSupabase();
    const { count, error } = await supabase
      .from('entries')
      .select('*', { count: 'exact', head: true });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, count: count ?? 0 });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
