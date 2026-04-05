// ── Auth Controller ──────────────────────────────────────────────────────────
const authService     = require('../services/authService');
const emailService    = require('../services/emailService');
const BusinessModel   = require('../models/businessModel');

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Usuario y contraseña requeridos' });
    }
    const admin = await authService.login(username, password);
    res.json({ success: true, businessId: admin.business_id });
  } catch (err) {
    if (err.message === 'Credenciales incorrectas') {
      return res.status(401).json({ success: false, error: err.message });
    }
    next(err);
  }
};

/**
 * POST /admin/forgot-password  { email }
 * Always returns 200 to avoid user enumeration.
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'El correo es requerido' });
    }

    // Look up the business + admin by email (best-effort, no enumeration leak)
    const record = await BusinessModel.findAdminByBusinessEmail(email);
    if (record) {
      const rawToken = await authService.createResetToken(record.admin_id);
      await emailService.sendPasswordReset(email, rawToken, record.business_name);
    }

    // Always respond the same way
    res.json({
      success: true,
      message: 'Si el correo está registrado recibirás un enlace en los próximos minutos.',
    });
  } catch (err) { next(err); }
};

/**
 * POST /admin/reset-password  { token, password, confirmPassword }
 */
const resetPassword = async (req, res, next) => {
  try {
    const { token, password, confirmPassword } = req.body;
    if (!token || !password || !confirmPassword) {
      return res.status(400).json({ success: false, error: 'Todos los campos son requeridos' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, error: 'Las contraseñas no coinciden' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    await authService.resetPassword(token, password);
    res.json({ success: true, message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    if (err.message === 'El enlace es inválido o ha expirado') {
      return res.status(400).json({ success: false, error: err.message });
    }
    next(err);
  }
};

/**
 * PUT /admin/change-password  { currentPassword, newPassword, confirmPassword }
 * Requires auth (x-business-id).
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, error: 'Todos los campos son requeridos' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, error: 'Las contraseñas no coinciden' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    await authService.changePassword(req.businessId, currentPassword, newPassword);
    res.json({ success: true, message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    if (err.message === 'La contraseña actual es incorrecta') {
      return res.status(400).json({ success: false, error: err.message });
    }
    next(err);
  }
};

module.exports = { login, forgotPassword, resetPassword, changePassword };

