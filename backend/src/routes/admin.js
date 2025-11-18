const express = require('express');
const router = express.Router();

const { authenticate,requireAdmin } = require('../middleware/auth');
const { getAdminDashboardOverview } = require('../controllers/adminDashboardController');

router.get('/dashboard-overview', authenticate,requireAdmin, getAdminDashboardOverview);

module.exports = router;
