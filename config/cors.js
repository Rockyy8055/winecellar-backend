const cors = require('cors');

const allowedOrigins = [
  'http://localhost:4000',
  'https://winecellar-frontend.vercel.app', // your Vercel site
  'https://winecellar.co.in',               // custom domain (root)
  'https://www.winecellar.co.in',           // custom domain (www)
  /\.vercel\.app$/                           // allow preview URLs
];

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // server-to-server / Postman
    const ok = allowedOrigins.some(o => (o instanceof RegExp ? o.test(origin) : o === origin));
    return ok ? cb(null, true) : cb(new Error(`CORS blocked for ${origin}`));
  },
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true,
  optionsSuccessStatus: 204
};

module.exports = cors(corsOptions);