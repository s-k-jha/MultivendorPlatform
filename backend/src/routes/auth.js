const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { userValidation } = require('../middleware/validation');

// Public routes
router.post('/register', userValidation.register, authController.register);
router.post('/login', userValidation.login, authController.login);
// OTP based auth
router.post('/send-otp', authController.sendOtp);
router.post('/verify-otp', authController.verifyOtp);

// Protected routes
router.use(authenticate);
router.get('/profile', authController.getProfile);
router.put('/profile', userValidation.updateProfile, authController.updateProfile);
router.post('/change-password', authController.changePassword);
router.post('/refresh-token', authController.refreshToken);


module.exports = router;