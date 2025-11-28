const express = require('express');
const router = express.Router();
const returnController = require('../controllers/returnController');
const { uploadProduct, handleUploadError } = require('../middleware/upload');
// const {authenticate} = require('../middleware/auth');
const { authenticate, requireSeller, optionalAuth, requireBuyer } = require('../middleware/auth');

// Protected routes
router.use(authenticate);
router.post(
    '/',
    requireBuyer,
    uploadProduct, 
    handleUploadError,
    returnController.createReturnRequest
);

// GET /api/returns - Get all return requests for the logged-in user
router.get('/', requireBuyer, returnController.getUserReturnRequests);
router.put('/:id', requireSeller, returnController.updateReturnStatus);

module.exports = router;