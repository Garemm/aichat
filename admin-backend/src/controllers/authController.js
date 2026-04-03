// ── Auth Controller ──────────────────────────────────────────────────────────
const AdminModel = require('../models/adminModel');

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Usuario y contraseña requeridos' });
    }
    const admin = await AdminModel.findByCredentials(username, password);
    if (!admin) {
      return res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
    }
    res.json({ success: true, businessId: admin.business_id });
  } catch (err) { next(err); }
};

module.exports = { login };
