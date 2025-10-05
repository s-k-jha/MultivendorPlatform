const { Product, ProductImage, ProductVariant, Category, User, Review } = require('../models');
const cloudinary = require('../utils/cloudinary.js'); 
const streamifier = require('streamifier');
const { Op, json } = require('sequelize');
const { PRODUCT_STATUS } = require('../utils/constant');
const redis = require('../utils/redis.js');
const { Json } = require('sequelize/lib/utils');
const db = require('../models'); 
const { QueryTypes } = require('sequelize'); 

// Get all products with filters and pagination

//at 2 places caching will be managed one at product list page for all products with filter and another is one when user click on indivisual products for details using :id
const getProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      category_id,
      brand,
      min_price,
      max_price,
      search,
      sort_by = 'created_at',
      sort_order = 'DESC',
      status = PRODUCT_STATUS.ACTIVE
    } = req.query;

    const offset = (page - 1) * limit;
    const where = { status };
    console.log('req.query >>', JSON.stringify(req.query));
    const cacheKey = `products:${JSON.stringify(req.query)}`;

    // First checking in cache 
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      console.log("cache data hit ");
      return res.json(JSON.parse(cachedData));
    }

    // Apply filters
    if (category_id) {
      where.category_id = category_id;
    }

    if (brand) {
      where.brand = { [Op.iLike]: `%${brand}%` };
    }

    if (min_price || max_price) {
      where.price = {};
      if (min_price) where.price[Op.gte] = min_price;
      if (max_price) where.price[Op.lte] = max_price;
    }

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
        { brand: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: products } = await Product.findAndCountAll({
      where,
      include: [
        {
          model: ProductImage,
          as: 'images',
          where: { is_primary: true },
          required: false,
          limit: 1
        },
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name', 'slug']
        },
        {
          model: User,
          as: 'seller',
          attributes: ['id', 'first_name', 'last_name', 'company_name']
        }
      ],
      order: [[sort_by, sort_order.toUpperCase()]],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    const totalPages = Math.ceil(count / limit);

    const responsePayload = {
      success: true,
      data: {
        products,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_items: count,
          items_per_page: parseInt(limit),
          has_next_page: page < totalPages,
          has_prev_page: page > 1
        }
      }
    };

    // await redis.setex(cacheKey, 300, JSON.stringify(responsePayload));
    // await redis.set(cacheKey, JSON.stringify(responsePayload));
    await redis.setex(cacheKey, 300, JSON.stringify(responsePayload));


    return res.json(responsePayload);

  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products'
    });
  }
};

// Get single product by ID or slug
const getProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const where = isNaN(id) ? { slug: id } : { id: parseInt(id) };

    const cacheKey = `Indivisual-product:${id}`;
    // const cacheKey = `products:${JSON.stringify(req.query)}`;

    const cachedProductDatawithId = await redis.get(cacheKey);
    if (cachedProductDatawithId) {
      console.log('data would be served from redis server');
      return res.json(JSON.parse(cachedProductDatawithId));
    }

    const product = await Product.findOne({
      where,
      include: [
        {
          model: ProductImage,
          as: 'images',
          order: [['sort_order', 'ASC']]
        },
        {
          model: ProductVariant,
          as: 'variants',
          where: { is_active: true },
          required: false
        },
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name', 'slug']
        },
        {
          model: User,
          as: 'seller',
          attributes: ['id', 'first_name', 'last_name', 'company_name', 'seller_verified']
        },
        {
          model: Review,
          as: 'reviews',
          include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'first_name', 'last_name']
          }],
          where: { is_approved: true },
          required: false,
          limit: 5,
          order: [['created_at', 'DESC']]
        }
      ]
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    const payloadData = {
      success: true,
      data: { product }
    };
    // res.json({
    //   success: true,
    //   data: { product }
    // });
    await redis.set(cacheKey, JSON.stringify(payloadData));
    return res.json(payloadData);


  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product'
    });
  }
};

// Create new product (Seller only)
const createProduct = async (req, res) => {
  try {
    const productData = {
      ...req.body,
      seller_id: req.user.id
    };

    const product = await Product.create(productData);

    // Handle image uploads
    // if (req.files && req.files.length > 0) {
    //   const imagePromises = req.files.map((file, index) =>
    //     ProductImage.create({
    //       product_id: product.id,
    //       image_url: `/uploads/products/${file.filename}`,
    //       is_primary: index === 0,
    //       sort_order: index
    //     })
    //   );
    //   await Promise.all(imagePromises);
    // }
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map((file, index) => {
        return new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: `uploads/products/${product.id}`, 
              public_id: `${product.id}-${Date.now()}-${index}`,
              resource_type: "auto"
            },
            (error, result) => {
              if (error) {
                console.error(`Cloudinary upload error for file ${index}:`, error);
                return reject(error);
              }
              resolve({
                product_id: product.id,
                image_url: result.secure_url,
                public_id: result.public_id, 
                is_primary: index === 0,
                sort_order: index
              });
            }
          );
          streamifier.createReadStream(file.buffer).pipe(uploadStream);
        });
      });

      const productImageData = await Promise.all(uploadPromises);

      await ProductImage.bulkCreate(productImageData);
    }


    // Fetch product with associations
    const createdProduct = await Product.findByPk(product.id, {
      include: [
        { model: ProductImage, as: 'images' },
        { model: Category, as: 'category' }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: { product: createdProduct }
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update product (Seller/Admin only)
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check ownership (sellers can only edit their own products)
    if (req.user.role === 'seller' && product.seller_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own products'
      });
    }

    await product.update(req.body);

    const updatedProduct = await Product.findByPk(product.id, {
      include: [
        { model: ProductImage, as: 'images' },
        { model: Category, as: 'category' }
      ]
    });
    // Update cache for this product
    const productCacheKey = `Indivisual-product:${updatedProduct.id}`;
    await redis.set(productCacheKey, JSON.stringify(updatedProduct), 'EX', 3600);

    // Delete product list caches (so they rebuild on next fetch)
    // const categoryCacheKey = `products:category:${updatedProduct.category_id}`;
    const deletecachekey = `products:${JSON.stringify(req.query)}`;
    await redis.del(deletecachekey);

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: { product: updatedProduct }
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product'
    });
  }
};

// Delete product (Seller/Admin only)
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check ownership
    if (req.user.role === 'seller' && product.seller_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own products'
      });
    }

    await product.destroy();
    const delete_Product_from_redis = `products:${id}`;
    //delete product list (in future saved in product:{filter manner})
    await redis.del(delete_Product_from_redis);

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product'
    });
  }
};
// Get seller's products
const getSellerProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      status,
      search,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    const where = { seller_id: req.user.id };

    if (status) {
      where.status = status;
    }

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { brand: { [Op.iLike]: `%${search}%` } },
        { sku: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: products } = await Product.findAndCountAll({
      where,
      include: [
        {
          model: ProductImage,
          as: 'images',
          where: { is_primary: true },
          required: false,
          limit: 1
        },
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name']
        }
      ],
      order: [[sort_by, sort_order.toUpperCase()]],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    const totalPages = Math.ceil(count / limit);

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_items: count,
          items_per_page: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get seller products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products'
    });
  }
};

module.exports = {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getSellerProducts
};