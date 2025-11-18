const express = require('express');
const router = express.Router();
// const carouselController = require('../controllers/carouselControlller');
const carouselController = require('../controllers/carouselController')
const { uploadCarousel, handleUploadError } = require('../middleware/upload');
const { authenticate, requireSeller } = require('../middleware/auth'); 

// GET /api/carousels - Public route to fetch all active carousel images
router.get('/', carouselController.getAllCarouselImages);

// POST /api/carousels - Admin-only route to upload a new carousel image
router.post(
    '/', 
    authenticate, // Ensures user is logged in
    requireSeller, // Ensures user is an admin
    uploadCarousel, // Multer middleware for single file upload
    handleUploadError, // Your custom multer error handler
    carouselController.createCarouselImage
);

// DELETE /api/carousels/:id - Admin-only route to delete a carousel image
router.delete(
    '/:id', 
    authenticate, 
    requireSeller, 
    carouselController.deleteCarouselImage
);

module.exports = router;
