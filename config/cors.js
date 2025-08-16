const cors = require("cors");

const corsOptions = {
  origin: ["http://localhost:4000"],            // add your admin UI origin(s) here
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 204,
};

module.exports = cors(corsOptions);