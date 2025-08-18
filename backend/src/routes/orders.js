const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticate, requireBuyer, requireSeller } = require('../middleware/auth');
const { orderValidation, generalValidation } = require('../middleware/validation');

// All routes require authentication
router.use(authenticate);

// Seller routes
router.get('/seller/orders', requireSeller, orderController.getSellerOrders);
router.put('/:id/status', requireSeller, orderValidation.updateStatus, orderController.updateOrderStatus);


// Buyer routes
router.post('/', requireBuyer, orderValidation.create, orderController.createOrder);
router.get('/my-orders', requireBuyer, orderController.getUserOrders);
router.put('/:id/cancel', requireBuyer, generalValidation.idParam, orderController.cancelOrder);

router.get('/:id', generalValidation.idParam, orderController.getOrder);
module.exports = router;