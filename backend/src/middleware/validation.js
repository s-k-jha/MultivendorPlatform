const { body, param, query, validationResult } = require('express-validator');
const { USER_ROLES, ORDER_STATUS, PRODUCT_STATUS } = require('../utils/constant');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => ({
        field: error.path,
        message: error.msg,
        value: error.value
      }))
    });
  }
  
  next();
};

// User validation rules
const userValidation = {
  register: [
    body('first_name')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('First name must be between 2 and 50 characters'),
    
    body('last_name')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Last name must be between 2 and 50 characters'),
    
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
    
    body('phone')
      .optional()
      .isMobilePhone('en-IN')
      .withMessage('Please provide a valid Indian phone number'),
    
    body('role')
      .optional()
      .isIn(Object.values(USER_ROLES))
      .withMessage(`Role must be one of: ${Object.values(USER_ROLES).join(', ')}`),
    
    body('company_name')
      .if(body('role').equals(USER_ROLES.SELLER))
      .notEmpty()
      .withMessage('Company name is required for sellers'),
    
    handleValidationErrors
  ],

  login: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    
    body('password')
      .notEmpty()
      .withMessage('Password is required'),
    
    handleValidationErrors
  ],

  updateProfile: [
    body('first_name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('First name must be between 2 and 50 characters'),
    
    body('last_name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Last name must be between 2 and 50 characters'),
    
    body('phone')
      .optional()
      .isMobilePhone('en-IN')
      .withMessage('Please provide a valid Indian phone number'),
    
    body('date_of_birth')
      .optional()
      .isISO8601()
      .withMessage('Please provide a valid date'),
    
    body('gender')
      .optional()
      .isIn(['male', 'female', 'other'])
      .withMessage('Gender must be male, female, or other'),
    
    handleValidationErrors
  ]
};

// Product validation rules
const productValidation = {
  create: [
    body('name')
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Product name must be between 3 and 200 characters'),
    
    body('description')
      .trim()
      .isLength({ min: 10, max: 2000 })
      .withMessage('Description must be between 10 and 2000 characters'),
    
    body('brand')
      .trim()
      .notEmpty()
      .withMessage('Brand is required'),
    
    body('price')
      .isFloat({ min: 0.01 })
      .withMessage('Price must be a positive number'),
    
    body('discount_price')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Discount price must be a positive number'),
    
    body('stock_quantity')
      .isInt({ min: 0 })
      .withMessage('Stock quantity must be a non-negative integer'),
    
    body('category_id')
      .isInt({ min: 1 })
      .withMessage('Valid category is required'),
    
    body('weight')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Weight must be a positive number'),
    
    body('status')
      .optional()
      .isIn(Object.values(PRODUCT_STATUS))
      .withMessage(`Status must be one of: ${Object.values(PRODUCT_STATUS).join(', ')}`),
    
    handleValidationErrors
  ],

  update: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Valid product ID is required'),
    
    body('name')
      .optional()
      .trim()
      .isLength({ min: 3, max: 200 })
      .withMessage('Product name must be between 3 and 200 characters'),
    
    body('description')
      .optional()
      .trim()
      .isLength({ min: 10, max: 2000 })
      .withMessage('Description must be between 10 and 2000 characters'),
    
    body('price')
      .optional()
      .isFloat({ min: 0.01 })
      .withMessage('Price must be a positive number'),
    
    body('stock_quantity')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Stock quantity must be a non-negative integer'),
    
    handleValidationErrors
  ]
};

// Order validation rules
const orderValidation = {
  create: [
    body('items')
      .isArray({ min: 1 })
      .withMessage('At least one item is required'),
    
    body('items.*.product_id')
      .isInt({ min: 1 })
      .withMessage('Valid product ID is required'),
    
    body('items.*.quantity')
      .isInt({ min: 1 })
      .withMessage('Quantity must be at least 1'),
    
    body('items.*.variant_id')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Valid variant ID is required'),
    
    body('shipping_address_id')
      .isInt({ min: 1 })
      .withMessage('Valid shipping address is required'),
    
    body('payment_method')
      .isIn(['card', 'upi', 'wallet', 'cod'])
      .withMessage('Invalid payment method'),
    
    handleValidationErrors
  ],

  updateStatus: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Valid order ID is required'),
    
    body('status')
      .isIn(Object.values(ORDER_STATUS))
      .withMessage(`Status must be one of: ${Object.values(ORDER_STATUS).join(', ')}`),
    
    body('tracking_number')
      .optional()
      .trim()
      .isLength({ min: 1 })
      .withMessage('Tracking number cannot be empty'),
    
    handleValidationErrors
  ]
};

// Address validation rules
const addressValidation = {
  create: [
    body('type')
      .optional()
      .isIn(['home', 'work', 'other'])
      .withMessage('Address type must be home, work, or other'),
    
    body('first_name')
      .trim()
      .notEmpty()
      .withMessage('First name is required'),
    
    body('last_name')
      .trim()
      .notEmpty()
      .withMessage('Last name is required'),
    
    body('phone')
      .isMobilePhone('en-IN')
      .withMessage('Please provide a valid Indian phone number'),
    
    body('address_line_1')
      .trim()
      .notEmpty()
      .withMessage('Address line 1 is required'),
    
    body('city')
      .trim()
      .notEmpty()
      .withMessage('City is required'),
    
    body('state')
      .trim()
      .notEmpty()
      .withMessage('State is required'),
    
    body('postal_code')
      .trim()
      .matches(/^[1-9][0-9]{5}$/)
      .withMessage('Please provide a valid Indian postal code'),
    
    handleValidationErrors
  ]
};

// General validation rules
const generalValidation = {
  idParam: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Valid ID is required'),
    handleValidationErrors
  ],

  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    
    handleValidationErrors
  ]
};

module.exports = {
  userValidation,
  productValidation,
  orderValidation,
  addressValidation,
  generalValidation,
  handleValidationErrors
};