/**
 * Express 4 does not forward rejected promises from async route handlers.
 * Without this, a SQL error becomes an unhandledRejection and start-prod.js
 * exits — every admin panel then shows the generic "Veri getirilemedi".
 */
function patchExpressAsyncErrors() {
  const Layer = require('express/lib/router/layer');
  if (Layer.prototype._touristlioAsyncPatched) return;
  Layer.prototype._touristlioAsyncPatched = true;
  Layer.prototype.handle_request = function handle(req, res, next) {
    const fn = this.handle;
    if (fn.length > 3) return next();
    try {
      const rv = fn(req, res, next);
      if (rv && typeof rv.then === 'function') rv.then(undefined, next);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { patchExpressAsyncErrors };
