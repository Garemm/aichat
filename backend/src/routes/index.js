/**
 * src/routes/index.js
 *
 * Central route registry. All resource routes are mounted here.
 * Add new resource routes below as the app grows.
 *
 * Convention: /api/<resource>
 */

const { Router } = require('express');
const messageRoutes  = require('./messageRoutes');
const businessRoutes = require('./businessRoutes');

const router = Router();

router.use('/messages', messageRoutes);
router.use('/business', businessRoutes);

// ── Future routes ─────────────────────────────────────────────────
// router.use('/rooms',   roomRoutes);
// router.use('/users',   userRoutes);
// router.use('/ai',      aiRoutes);    ← OpenAI integration endpoint

module.exports = router;
