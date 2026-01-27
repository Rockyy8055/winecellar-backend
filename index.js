require('dotenv').config();
const express = require("express");
const path = require('path');
const connectDB = require("./config/db");
const cors = require('cors');
const { corsMiddleware, corsOptions } = require("./config/cors");
const cookieParser = require('cookie-parser');
const userRoutes = require("./routes/userRoutes");
const productCategoryRoutes = require("./routes/productCategoryRoutes");
const { swaggerUi, specs } = require("./config/swaggerConfig");
const productRoutes = require("./routes/productRoutes");
const paymentRoutes = require('./routes/paymentRoutes');
const inventoryRoutes = require("./routes/inventoryRoutes");
const webUserRoutes = require('./routes/webUserRoutes');
const orderRoutes = require('./routes/orderRoutes');
const adminAuthRoutes = require('./routes/adminAuth');
const upsRoutes = require('./routes/upsRoutes');
const cartRoutes = require('./routes/cartRoutes');

const app = express();
const PORT = process.env.PORT || 5001;

app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());
app.use(corsMiddleware);

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Handle preflight requests for all routes
app.options('*', cors(corsOptions));

connectDB();
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs)); // Serve Swagger docs

app.use(adminAuthRoutes);
// Cookie auth routes (signup/login/me/logout)
try {
  const { router: cookieAuthRouter } = require('./routes/userAuth');
  app.use(cookieAuthRouter);
} catch (_) {
  // fallback to legacy routes
}
app.use(userRoutes);
app.use(productCategoryRoutes);
app.use(productRoutes);
app.use(inventoryRoutes);
app.use(webUserRoutes);
app.use(paymentRoutes);
app.use(orderRoutes);
app.use(upsRoutes);
app.use(cartRoutes);
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
