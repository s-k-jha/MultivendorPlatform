const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authenticate, requireSeller, optionalAuth } = require('../middleware/auth');
const { productValidation, generalValidation } = require('../middleware/validation');
const { uploadProduct, handleUploadError } = require('../middleware/upload');

// Public routes
router.get('/', optionalAuth, generalValidation.pagination, productController.getProducts);
router.get('/:id', optionalAuth, productController.getProduct);

// Protected routes
router.use(authenticate);

// Seller routes
router.get('/seller/my-products', requireSeller, productController.getSellerProducts);
router.post('/', requireSeller, uploadProduct, handleUploadError, productValidation.create, productController.createProduct);
router.put('/:id', requireSeller, generalValidation.idParam, productValidation.update, productController.updateProduct);
router.delete('/:id', requireSeller, generalValidation.idParam, productController.deleteProduct);

module.exports = router;