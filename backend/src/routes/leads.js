const express = require('express');
const router = express.Router();
const { createLead, getLeads } = require('../controllers/leadController');

// Public route → customer submits contact form
router.post('/create', createLead);

// Admin-only route fetch all leads (optional)
router.get('/all', getLeads);

module.exports = router;
