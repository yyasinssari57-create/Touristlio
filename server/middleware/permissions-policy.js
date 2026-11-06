/**
 * V4 Adım 15. Helmet does not set Permissions-Policy.
 * Camera, microphone, and payment stay off. Geolocation stays on for
 * this origin only — the map "Konumum" button uses it.
 */
const PERMISSIONS_POLICY = 'camera=(), microphone=(), payment=(), geolocation=(self)';

function permissionsPolicyMiddleware() {
  return function permissionsPolicy(_req, res, next) {
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    next();
  };
}

module.exports = { permissionsPolicyMiddleware, PERMISSIONS_POLICY };
