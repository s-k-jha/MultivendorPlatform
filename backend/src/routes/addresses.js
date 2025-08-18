const express = require('express');
const router = express.Router();
const addressController = require('../controllers/addressController');
const { authenticate } = require('../middleware/auth');
const { addressValidation, generalValidation } = require('../middleware/validation');

// All routes require authentication
router.use(authenticate);

router.get('/', addressController.getAddresses);
router.get('/:id', generalValidation.idParam, addressController.getAddress);
router.post('/', addressValidation.create, addressController.createAddress);
router.put('/:id', generalValidation.idParam, addressController.updateAddress);
router.delete('/:id', generalValidation.idParam, addressController.deleteAddress);
router.put('/:id/set-default', generalValidation.idParam, addressController.setDefaultAddress);

module.exports = router;