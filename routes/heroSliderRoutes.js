const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../config/requireAdmin');
const { adminHeroSlideImageUpload } = require('../middleware/upload');
const {
  adminListHeroSlides,
  adminCreateHeroSlide,
  adminUpdateHeroSlide,
  adminDeleteHeroSlide,
  getPublicHeroSlides,
} = require('../controllers/heroSliderController');

/**
 * @swagger
 * tags:
 *   name: HeroSlider
 *   description: Homepage hero slider management
 */

/**
 * @swagger
 * /api/admin/slider:
 *   get:
 *     summary: Fetch current hero slider configuration (admin)
 *     tags: [HeroSlider]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Returns ordered hero slides
 *   post:
 *     summary: Replace hero slider configuration (admin)
 *     tags: [HeroSlider]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - slides
 *             properties:
 *               slides:
 *                 type: array
 *                 maxItems: 6
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     title:
 *                       type: string
 *                     subtitle:
 *                       type: string
 *                     imageUrl:
 *                       type: string
 *                     url:
 *                       type: string
 *     responses:
 *       200:
 *         description: Saved slide list
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.get('/api/admin/slider/slides', requireAdmin, adminListHeroSlides);
router.post('/api/admin/slider/slides', requireAdmin, adminHeroSlideImageUpload, adminCreateHeroSlide);
router.patch('/api/admin/slider/slides/:id', requireAdmin, adminUpdateHeroSlide);
router.delete('/api/admin/slider/slides/:id', requireAdmin, adminDeleteHeroSlide);

/**
 * @swagger
 * /api/slider:
 *   get:
 *     summary: Public hero slider payload
 *     tags: [HeroSlider]
 *     responses:
 *       200:
 *         description: Array of hero slides ordered for display
 */
router.get('/api/slider', getPublicHeroSlides);

module.exports = router;
