const { requireUser } = require('../lib/auth');

module.exports = async (req, res) => {
  try {
    const user = await requireUser(req);
    return res.status(200).json({
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    });
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }
};
