// ── Auth middleware ───────────────────────────────────────────────────────────
// Reads businessId from the x-business-id header set by the frontend after login.
// TODO: Replace with JWT verification when upgrading auth.
const requireAuth = (req, res, next) => {
  const businessId = parseInt(req.headers['x-business-id'], 10);
  if (!businessId || isNaN(businessId)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  req.businessId = businessId;
  next();
};

module.exports = requireAuth;
