/**
 * Tiola add / like rate limit: 5 requests per minute per IP + user id (ORTA-4).
 * Redis when REDIS_URL is set; otherwise in-memory.
 */
const { increment, backendName } = require('../lib/rate-limit-store');
const { logAbnormal, clientIp } = require('../lib/anti-bot-log');

const WINDOW_MS = Number(process.env.TIOLA_VOTE_RATE_WINDOW_MS) || 60 * 1000;
const MAX = Number(process.env.TIOLA_VOTE_RATE_LIMIT_MAX) || 5;

function voteKey(req) {
  const ip = String(clientIp(req) || '0.0.0.0').split(',')[0].trim();
  const userId = req.user?.id != null ? String(req.user.id) : 'anon';
  return `touristlio:tiola:vote:${ip}:${userId}`;
}

function tiolaVoteLimiter(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Giriş gerekli' });
  }

  const key = voteKey(req);
  increment(key, WINDOW_MS)
    .then((result) => {
      const remaining = Math.max(0, MAX - result.count);
      res.setHeader('X-RateLimit-Limit', String(MAX));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Window', String(WINDOW_MS));
      if (result.ttlMs != null) {
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.ttlMs / 1000)));
      }
      if (result.count > MAX) {
        logAbnormal({
          kind: 'rate_limit',
          req,
          userId,
          extra: {
            count: result.count,
            max: MAX,
            backend: result.backend || backendName(),
            windowMs: WINDOW_MS,
          },
        });
        return res.status(429).json({
          error: 'Çok fazla Tiola isteği. Dakikada en fazla 5 deneme yapabilirsiniz.',
        });
      }
      next();
    })
    .catch((err) => {
      logAbnormal({
        kind: 'store_error',
        req,
        userId,
        extra: { err: err.message },
      });
      next();
    });
}

module.exports = {
  tiolaVoteLimiter,
  voteKey,
  TIOLA_VOTE_MAX: MAX,
  TIOLA_VOTE_WINDOW_MS: WINDOW_MS,
};
