// src/routes/cashfreeRoutes.js
const express = require('express');
const router = express.Router();
const cashfreeController = require('../controllers/cashfreeController');

router.post('/create-payment-link', cashfreeController.createPaymentLink);
router.get('/link/:linkId', cashfreeController.getLinkDetails);

// webhook route (we'll configure raw body in app.js)
// client should not call this; Cashfree will POST here
router.post('/webhook', cashfreeController.webhookHandler);

module.exports = router;
