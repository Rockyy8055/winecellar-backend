const express = require("express");
const router = express.Router();
const { addInventory } = require("../controllers/inventoryController");

/**
 * @swagger
 * /api/inventory/add:
 *   post:
 *     summary: Add a new inventory
 *     tags: [Inventory]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               product_id:
 *                 type: string
 *               available:
 *                 type: number
 *               price:
 *                 type: number
 *               SKU:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               size:
 *                 type: string
 *     responses:
 *       201:
 *         description: Inventory added successfully
 *       500:
 *         description: Error adding inventory
 */
router.post("/api/inventory/add", addInventory);

module.exports = router;
