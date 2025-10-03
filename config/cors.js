const cors = require('cors');

// CORS configuration for web and mobile app support
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:4000',
  'https://winecellar-frontend.vercel.app', // your Vercel site
  'https://winecellar.co.in',               // custom domain (root)
  'https://www.winecellar.co.in',           // custom domain (www)
  'https://winecellar-frontend-79dh3mlxwg-rockyy8055s-projects.vercel.app',
  'capacitor://localhost',                  // Mobile app (Capacitor)
  'ionic://localhost',                      // Mobile app (Ionic)
  'http://localhost',                       // Mobile app local
  'https://localhost',                      // Mobile app HTTPS
  /\.vercel\.app$/                          // allow preview URLs
];

const corsOptions = {
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return cb(null, true);
    
    // Allow all Capacitor and Ionic origins
    if (origin && (origin.startsWith('capacitor://') || origin.startsWith('ionic://'))) {
      return cb(null, true);
    }
    
    // Check if origin is in allowed list
    const ok = allowedOrigins.some(o => (o instanceof RegExp ? o.test(origin) : o === origin));
    
    // For development: allow all origins (remove in production if needed)
    // Comment out the line below for stricter production security
    if (!ok) return cb(null, true);
    
    return ok ? cb(null, true) : cb(new Error(`CORS blocked for ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  credentials: true,
  optionsSuccessStatus: 204,
  maxAge: 86400 // 24 hours - cache preflight requests
};

module.exports = cors(corsOptions);