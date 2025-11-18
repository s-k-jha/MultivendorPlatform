const { CarouselImage } = require('../models');
const cloudinary = require('../utils/cloudinary'); 
const streamifier = require('streamifier');
const db = require('../models'); 

const createCarouselImage = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No image file uploaded.' });
        }

        const uploadResult = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: "uploads/carousels",
                    resource_type: "auto"
                },
                (error, result) => {
                    if (error) {
                        console.error("Cloudinary upload error:", error);
                        return reject(error);
                    }
                    resolve(result);
                }
            );
            streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
        });

        const { title, link_url, display_order, is_active } = req.body;

        const newCarouselImage = await CarouselImage.create({
            image_url: uploadResult.secure_url, // URL from the Cloudinary result
            public_id: uploadResult.public_id, // public_id from the Cloudinary result
            title,
            link_url,
            display_order,
            is_active
        });

        res.status(201).json({
            success: true,
            message: 'Carousel image created successfully!',
            data: { carouselImage: newCarouselImage }
        });

    } catch (error) {
        console.error('Create carousel error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create carousel image',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


// --- Controller to GET all active carousel images ---
const getAllCarouselImages = async (req, res, next) => {
    try {
        const images = await CarouselImage.findAll({
            where: { is_active: true },
            order: [['display_order', 'ASC']]
        });
        res.status(200).json({ success: true, data: images });
    } catch (error) {
        console.error("Error fetching carousel images:", error);
        next(error);
    }
};

// --- Controller to DELETE a carousel image ---
const deleteCarouselImage = async (req, res, next) => {
    try {
        const { id } = req.params;
        const imageToDelete = await CarouselImage.findByPk(id);
        
        if (!imageToDelete) {
            return res.status(404).json({ success: false, message: 'Carousel image not found.' });
        }
        
        await cloudinary.uploader.destroy(imageToDelete.public_id);
        
        await imageToDelete.destroy();

        res.status(200).json({ success: true, message: 'Carousel image deleted successfully.' });
    } catch (error) {
        console.error("Error deleting carousel image:", error);
        next(error);
    }
};

module.exports = {
    createCarouselImage,
    getAllCarouselImages,
    deleteCarouselImage,
};

