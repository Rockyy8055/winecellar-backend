const express = require("express");
const { saveUser, signInUser } = require("../controllers/userController");
const router = express.Router();

/**
 * @swagger
 * /api/user/login:
 *   post:
 *     summary: Create a new user
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               telephone:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Error creating user
 */
router.post("/api/user/login", saveUser);

/**
 * @swagger
 * /api/users/signin:
 *   post:
 *     summary: Sign in a user
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: akshatp@gmail.com
 *               password:
 *                 type: Pass2000
 *     responses:
 *       200:
 *         description: Sign-in successful
 *       400:
 *         description: Invalid email or password
 *       500:
 *         description: Error signing in user
 */
router.post("/api/users/signin", signInUser);

module.exports = router;
