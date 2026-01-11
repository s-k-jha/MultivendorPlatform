const express = require('express');
const router = express.Router();
const { uploadProduct, handleUploadError } = require('../middleware/upload');
const { authenticate, requireSeller, optionalAuth } = require('../middleware/auth');

const { getSellerDashboardOverview } = require('../controllers/dashboardController');

router.get('/dashboard-overview', authenticate, getSellerDashboardOverview);

module.exports = router;
