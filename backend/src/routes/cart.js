const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const { authenticate, requireBuyer } = require('../middleware/auth');
const { body } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validation');

// All routes require buyer authentication
router.use(authenticate, requireBuyer);

// Cart validation
const cartValidation = [
  body('product_id')
    .isInt({ min: 1 })
    .withMessage('Valid product ID is required'),
  
  body('variant_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Valid variant ID is required'),
  
  body('quantity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),
  
  handleValidationErrors
];

router.get('/', cartController.getCart);
router.post('/add', cartValidation, cartController.addToCart);
router.put('/items/:id', cartController.updateCartItem);
router.delete('/items/:id', cartController.removeFromCart);
router.delete('/clear', cartController.clearCart);

module.exports = router;