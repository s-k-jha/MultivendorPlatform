const express = require('express');
const router = express.Router();
const themeController = require('../controllers/themeController');
const { uploadProduct, handleUploadError } = require('../middleware/upload');


// GET all themes
router.get('/',themeController.getAllThemes );
router.post('/',uploadProduct,handleUploadError, themeController.createTheme);
router.delete('/:id',themeController.deleteTheme);
router.put('/activateTheme/:id', themeController.setActiveTheme);


module.exports = router;
