const cors = require('cors');

const FALLBACK_ALLOWED_ORIGINS = [
  'https://www.winecellar.co.in',
  'https://winecellar.co.in',
  'http://localhost:3000',
  'http://localhost:4000',
  'http://localhost:5173',
  'http://localhost:5174',
];

const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'];
const ALLOWED_HEADERS = ['Content-Type', 'Authorization'];
const EXPOSED_HEADERS = ['Content-Length'];

function buildAllowedOrigins() {
  const raw = process.env.CORS_ALLOWED_ORIGINS;
  if (!raw) {
    return FALLBACK_ALLOWED_ORIGINS;
  }
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

const allowedOrigins = buildAllowedOrigins();

function originValidator(origin, callback) {
  if (!origin) {
    return callback(null, true);
  }

  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }

  return callback(new Error(`CORS blocked: ${origin}`));
}

const corsOptions = {
  origin: originValidator,
  credentials: true,
  methods: ALLOWED_METHODS,
  allowedHeaders: ALLOWED_HEADERS,
  exposedHeaders: EXPOSED_HEADERS,
  optionsSuccessStatus: 204,
};

const corsMiddleware = cors(corsOptions);

module.exports = {
  corsMiddleware,
  corsOptions,
};