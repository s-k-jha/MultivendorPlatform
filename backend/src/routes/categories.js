const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { generalValidation } = require('../middleware/validation');
const { uploadProduct, handleUploadError, uploadSingleProduct } = require('../middleware/upload');

// Public routes
router.get('/', categoryController.getCategories);
router.get('/:id', categoryController.getCategory);

// Admin only routes
router.use(authenticate, requireAdmin);
router.post('/',  uploadSingleProduct, handleUploadError,categoryController.createCategory);
router.put('/:id', generalValidation.idParam, uploadSingleProduct, handleUploadError,categoryController.updateCategory);
router.delete('/:id', generalValidation.idParam, categoryController.deleteCategory);

module.exports = router;