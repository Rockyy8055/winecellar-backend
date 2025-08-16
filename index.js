require('dotenv').config();
const express = require("express");
const connectDB = require("./config/db");
const cors = require("./config/cors");
const userRoutes = require("./routes/userRoutes");
const productCategoryRoutes = require("./routes/productCategoryRoutes");
const { swaggerUi, specs } = require("./config/swaggerConfig");
const productRoutes = require("./routes/productRoutes");
const paymentRoutes = require('./routes/paymentRoutes');
const inventoryRoutes = require("./routes/inventoryRoutes");
const webUserRoutes = require('./routes/webUserRoutes');
const orderRoutes = require('./routes/orderRoutes');
const adminAuthRoutes = require('./routes/adminAuth');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(express.json());
app.use(cors);

connectDB();
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs)); // Serve Swagger docs

app.use(adminAuthRoutes);
app.use(userRoutes);
app.use(productCategoryRoutes);
app.use(productRoutes);
app.use(inventoryRoutes);
app.use(webUserRoutes);
app.use(paymentRoutes);
app.use(orderRoutes);
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
