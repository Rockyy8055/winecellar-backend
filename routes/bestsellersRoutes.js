const express = require('express');
const router = express.Router();
const {
  getAdminBestsellers,
  updateAdminBestsellers,
  getPublicBestsellers,
} = require('../controllers/bestsellersController');

/**
 * @swagger
 * components:
 *   schemas:
 *     BestsellersProduct:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         ProductId:
 *           type: string
 *         name:
 *           type: string
 *         price:
 *           type: number
 *         img:
 *           type: string
 *         imageUrl:
 *           type: string
 *         SKU:
 *           type: string
 *         stock:
 *           type: number
 *         category:
 *           type: array
 *           items:
 *             type: string
 *         description:
 *           type: string
 *         desc:
 *           type: string
 *     BestsellersAdminResponse:
 *       type: object
 *       properties:
 *         products:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/BestsellersProduct'
 *         productIds:
 *           type: array
 *           items:
 *             type: string
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         updatedBy:
 *           type: string
 *     BestsellersPublicResponse:
 *       type: object
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/BestsellersProduct'
 */

/**
 * @swagger
 * /api/admin/bestsellers:
 *   get:
 *     summary: Get current bestsellers selection (admin)
 *     tags: [Bestsellers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin bestsellers selection with product details and metadata
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BestsellersAdminResponse'
 *   post:
 *     summary: Update bestsellers selection (admin)
 *     tags: [Bestsellers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - products
 *             properties:
 *               products:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *                 maxItems: 6
 *                 uniqueItems: true
 *     responses:
 *       200:
 *         description: Bestsellers updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 products:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/BestsellersProduct'
 *                 productIds:
 *                   type: array
 *                   items:
 *                     type: string
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                 updatedBy:
 *                   type: string
 *       400:
 *         description: Validation error (duplicate IDs, >6 items, nonexistent products)
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden (admin required)
 */

/**
 * @swagger
 * /api/bestsellers:
 *   get:
 *     summary: Get public bestsellers list (up to 6 items)
 *     tags: [Bestsellers]
 *     responses:
 *       200:
 *         description: Public bestsellers list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BestsellersPublicResponse'
 */

// Admin endpoints (temporarily public to unblock admin UI; protect via requireAdmin once frontend auth is wired)
router.get('/api/admin/bestsellers', getAdminBestsellers);
router.post('/api/admin/bestsellers', updateAdminBestsellers);

// Public endpoint
router.get('/api/bestsellers', getPublicBestsellers);

module.exports = router;
