const { Category, Product } = require('../models');
const { Op } = require('sequelize');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// Get all categories
const getCategories = async (req, res) => {
  try {
    const { include_products = false } = req.query;

    const includeOptions = include_products === 'true' ? [{
      model: Product,
      as: 'products',
      // where: { status: 'active' },
      required: false,
      attributes: ['id', 'name', 'price', 'average_rating'],
      limit: 5
    }] : [];

    const categories = await Category.findAll({
      // where: { is_active: true },
      include: includeOptions,
      order: [['sort_order', 'ASC'], ['name', 'ASC']]
    });

    res.json({
      success: true,
      data: { categories }
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories'
    });
  }
};

// Get single category
const getCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const where = isNaN(id) ? { slug: id } : { id: parseInt(id) };

    const category = await Category.findOne({
      where: { ...where, is_active: true }
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    res.json({
      success: true,
      data: { category }
    });
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category'
    });
  }
};

// Create category (Admin only)
const createCategory = async (req, res) => {
  try {
     console.log('=== CREATE CATEGORY DEBUG ===');
    console.log('req.body:', req.body);
    console.log('req.file:', req.file);
    console.log('===========================');
    // Validate required fields
    if (!req.body.name) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required'
      });
    }
    // const categoryData = {
    //   ...req.body
    // };
      const categoryData = {
      name: req.body.name,
      slug: req.body.slug,
      description: req.body.description || null,
      is_active: req.body.is_active === 'true' || req.body.is_active === true,
      sort_order: req.body.sort_order ? parseInt(req.body.sort_order) : 0
    };

    const category = await Category.create(categoryData);

    // Handle image upload if file is provided
    if (req.file) {
      console.log('entered inside req.file >> ')
      try {
        const uploadResult = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: `uploads/categories`,
              public_id: `category-${category.id}-${Date.now()}`,
              resource_type: "auto"
            },
            (error, result) => {
              if (error) {
                console.error('Cloudinary upload error:', error);
                return reject(error);
              }
              resolve(result);
            }
          );
          streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
        });

        // Update category with Cloudinary image URL
        console.log('reach till update the final image field of db');
        await category.update({
          image: uploadResult.secure_url
        });
      } catch (uploadError) {
        console.error('Image upload failed:', uploadError);
        // Category is already created, so we just log the error
        // You can choose to delete the category if image upload is mandatory
      }
    }

    // Fetch updated category
    const createdCategory = await Category.findByPk(category.id);

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: { category: createdCategory }
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create category',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update category (Admin only)
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    
    const category = await Category.findByPk(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Handle image upload if new file is provided
    if (req.file) {
      try {
        // Extract public_id from old image URL to delete from Cloudinary
        if (category.image && category.image.includes('cloudinary.com')) {
          try {
            // Extract public_id from Cloudinary URL
            const urlParts = category.image.split('/');
            const fileWithExt = urlParts[urlParts.length - 1];
            const publicId = `uploads/categories/${fileWithExt.split('.')[0]}`;
            await cloudinary.uploader.destroy(publicId);
          } catch (deleteError) {
            console.error('Failed to delete old image:', deleteError);
          }
        }

        // Upload new image
        const uploadResult = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: `uploads/categories`,
              public_id: `category-${category.id}-${Date.now()}`,
              resource_type: "auto"
            },
            (error, result) => {
              if (error) {
                console.error('Cloudinary upload error:', error);
                return reject(error);
              }
              resolve(result);
            }
          );
          streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
        });

        // Update category data with new image
        await category.update({
          ...req.body,
          image: uploadResult.secure_url
        });
      } catch (uploadError) {
        console.error('Image upload failed:', uploadError);
        // Update other fields even if image upload fails
        await category.update(req.body);
      }
    } else {
      // Update without image
      await category.update(req.body);
    }

    res.json({
      success: true,
      message: 'Category updated successfully',
      data: { category }
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update category',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Delete category (Admin only)
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    
    const category = await Category.findByPk(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Check if category has products
    const productCount = await Product.count({
      where: { category_id: id }
    });

    if (productCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category with existing products'
      });
    }

    // Delete image from Cloudinary if exists
    if (category.image && category.image.includes('cloudinary.com')) {
      try {
        // Extract public_id from Cloudinary URL
        const urlParts = category.image.split('/');
        const fileWithExt = urlParts[urlParts.length - 1];
        const publicId = `uploads/categories/${fileWithExt.split('.')[0]}`;
        await cloudinary.uploader.destroy(publicId);
      } catch (cloudinaryError) {
        console.error('Failed to delete image from Cloudinary:', cloudinaryError);
        // Continue with category deletion even if Cloudinary deletion fails
      }
    }

    await category.destroy();

    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete category',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory
};