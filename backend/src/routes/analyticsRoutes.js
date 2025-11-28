const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { optionalAuth } = require('../middleware/auth'); 

// POST /api/analytics/track
router.post('/track', optionalAuth, analyticsController.trackAction);

module.exports = router;
