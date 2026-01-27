const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:4000',
  'http://localhost:5173',
  'http://localhost:5174',
  'https://winecellar-frontend.vercel.app',
  'https://winecellar.co.in',
  'https://www.winecellar.co.in',
  'https://winecellar-frontend-79dh3mlxwg-rockyy8055s-projects.vercel.app',
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
  'https://localhost'
];

const allowedOriginPatterns = [/\.vercel\.app$/i];

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'];
const ALLOWED_HEADERS = ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'];
const EXPOSED_HEADERS = ['Content-Length', 'Content-Type'];

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }

  const normalized = origin.toLowerCase();
  const stringMatch = allowedOrigins.some((candidate) => candidate.toLowerCase() === normalized);
  const patternMatch = allowedOriginPatterns.some((pattern) => pattern.test(origin));
  return stringMatch || patternMatch;
}

function applyCorsHeaders(res, origin) {
  if (!origin) {
    return;
  }

  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', ALLOWED_METHODS.join(', '));
  res.header('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(', '));
  res.header('Access-Control-Expose-Headers', EXPOSED_HEADERS.join(', '));
  res.header('Vary', 'Origin');
}

module.exports = function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;

  if (isAllowedOrigin(origin)) {
    applyCorsHeaders(res, origin);
  }

  if (req.method === 'OPTIONS') {
    if (!isAllowedOrigin(origin)) {
      return res.status(403).json({ error: `CORS blocked for origin: ${origin}` });
    }

    applyCorsHeaders(res, origin);
    res.header('Access-Control-Max-Age', '86400');
    return res.sendStatus(204);
  }

  return next();
};