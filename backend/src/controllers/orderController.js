const { Order, OrderItem, Product, ProductVariant, Address, User, Cart, CartItem, ProductImage } = require('../models');
const { Op } = require('sequelize');
const { ORDER_STATUS } = require('../utils/constant');
const { sequelize } = require('../models');
const { v4: uuidv4 } = require('uuid');
const redis = require('../utils/redis.js');
const { QueryTypes } = require('sequelize');




// const generateOrderNumber = () => {
//   const timestamp = Date.now();
//   const random = Math.floor(1000 + Math.random() * 9000);
//   return `ORD-${timestamp}-${random}`;
// };
const generateOrderNumber = () => {
  return `ORD-${uuidv4()}`;
};

const order_number = generateOrderNumber();

// Create new order
const createOrder = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { items, shipping_address_id, payment_method, notes } = req.body;
    const buyer_id = req.user.id;
    // Debug logs
    console.log('Order payload:', req.body);
    console.log('Checking address:', shipping_address_id, 'for user:', buyer_id);

    // Verify shipping address belongs to user
    const shippingAddress = await Address.findOne({
      where: { id: shipping_address_id, user_id: buyer_id }
    });
    console.log('shippingaddress is ', shippingAddress);

    if (!shippingAddress) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Invalid shipping address'
      });
    }

    let subtotal = 0;
    const orderItems = [];

    // Validate and calculate order total
    for (const item of items) {
      const product = await Product.findByPk(item.product_id, {
        include: [{
          model: ProductVariant,
          as: 'variants',
          where: item.variant_id ? { id: item.variant_id } : undefined,
          required: false
        }]
      });

      if (!product || product.status !== 'active') {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Product ${item.product_id} is not available`
        });
      }

      let variant = null;
      let availableStock = product.stock_quantity;
      let unitPrice = parseFloat(product.discount_price || product.price);

      if (item.variant_id) {
        variant = product.variants.find(v => v.id === item.variant_id);
        if (!variant || !variant.is_active) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Product variant ${item.variant_id} is not available`
          });
        }
        availableStock = variant.stock_quantity;
        unitPrice += parseFloat(variant.price_adjustment || 0);
      }

      if (availableStock < item.quantity) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name}. Available: ${availableStock}`
        });
      }

      const totalPrice = unitPrice * item.quantity;
      subtotal += totalPrice;

      orderItems.push({
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
        product_name: product.name,
        product_sku: variant ? variant.sku : product.sku,
        variant_details: variant ? {
          size: variant.size,
          color: variant.color,
          color_code: variant.color_code
        } : null
      });
    }

    // Calculate totals
    const tax_amount = subtotal * 0.18; // 18% GST
    const shipping_amount = subtotal > 500 ? 0 : 50; // Free shipping above ₹500
    const total_amount = subtotal + tax_amount + shipping_amount;

    // Create order
    const order = await Order.create({
      order_number,
      buyer_id,
      shipping_address_id,
      status: ORDER_STATUS.PENDING,
      subtotal,
      tax_amount,
      shipping_amount,
      total_amount,
      payment_method,
      payment_status: payment_method === 'cod' ? 'pending' : 'pending',
      notes
    }, { transaction });

    // Create order items and update stock
    for (const itemData of orderItems) {
      await OrderItem.create({
        order_id: order.id,
        ...itemData
      }, { transaction });

      // Update stock
      if (itemData.variant_id) {
        await ProductVariant.decrement('stock_quantity', {
          by: itemData.quantity,
          where: { id: itemData.variant_id },
          transaction
        });
      } else {
        await Product.decrement('stock_quantity', {
          by: itemData.quantity,
          where: { id: itemData.product_id },
          transaction
        });
      }

      // Update product sales count
      await Product.increment('total_sales', {
        by: itemData.quantity,
        where: { id: itemData.product_id },
        transaction
      });
    }

    // Clear user's cart
    const userCart = await Cart.findOne({ where: { user_id: buyer_id } });
    if (userCart) {
      await CartItem.destroy({
        where: { cart_id: userCart.id },
        transaction
      });
      await userCart.update({
        total_items: 0,
        total_amount: 0
      }, { transaction });
    }

    await transaction.commit();

    // Fetch complete order details
    const completeOrder = await Order.findByPk(order.id, {
      include: [
        {
          model: OrderItem,
          as: 'items',
          include: [{
            model: Product,
            as: 'product',
            attributes: ['id', 'name', 'brand']
          }]
        },
        {
          model: Address,
          as: 'shippingAddress'
        },
        {
          model: User,
          as: 'buyer',
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: { order: completeOrder }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get user's orders
const getUserOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query;
    // const cacheKey  = `User-Orders:${id}`;
    const cacheKey = `User-Orders:${JSON.stringify(req.query)}`;
    // First checking in cache 
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      console.log("cache data hit ");
      return res.json(JSON.parse(cachedData));
    }


    const offset = (page - 1) * limit;
    const where = { buyer_id: req.user.id };

    if (status) {
      where.status = status;
    }

    const { count, rows: orders } = await Order.findAndCountAll({
      where,
      include: [
        {
          model: OrderItem,
          as: 'items',
          include: [{
            model: Product,
            as: 'product',
            attributes: ['id', 'name', 'brand'],
            include: [{
              model: ProductImage,
              as: 'images',
              where: { is_primary: true },
              required: false,
              limit: 1
            }]
          }]
        },
        {
          model: Address,
          as: 'shippingAddress'
        }
      ],
      order: [[sort_by, sort_order.toUpperCase()]],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const totalPages = Math.ceil(count / limit);

    const responsePayload = {
       success: true,
      data: {
        orders,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_items: count,
          items_per_page: parseInt(limit)
        }
      }
    };
    await redis.setex(cacheKey,300, JSON.stringify(responsePayload));
    return res.json(responsePayload);


  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
};

// Get single order
const getOrder = async (req, res) => {
  try {
    const { id } = req.params;
    
    const where = { id };
    
    // Buyers can only see their own orders
    if (req.user.role === 'buyer') {
      where.buyer_id = req.user.id;
    }
    const cacheKey = `Indivisual-user-order:${id} order id`;
    const getOrderByid = await redis.get(cacheKey);
    if(getOrderByid){
      console.log('cached data for indivisual order hit');
      return res.json(JSON.parse(getOrderByid));
    }
    const order = await Order.findOne({
      where,
      include: [
        {
          model: OrderItem,
          as: 'items',
          include: [{
            model: Product,
            as: 'product',
            attributes: ['id', 'name', 'brand', 'seller_id'],
            include: [
              {
                model: ProductImage,
                as: 'images',
                where: { is_primary: true },
                required: false,
                limit: 1
              },
              {
                model: User,
                as: 'seller',
                attributes: ['id', 'first_name', 'last_name', 'company_name']
              }
            ]
          }]
        },
        {
          model: Address,
          as: 'shippingAddress'
        },
        {
          model: User,
          as: 'buyer',
          attributes: ['id', 'first_name', 'last_name', 'email', 'phone']
        }
      ]
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
   
    // res.json({
    //   success: true,
    //   data: { order }
    // });
    const responsePayload = {
      success: true, 
      data: {order}
    };
    await redis.set(cacheKey,JSON.stringify(responsePayload) );
    return res.json(responsePayload);


  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order'
    });
  }
};

// Update order status (Seller/Admin only)
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, tracking_number, notes } = req.body;

    const order = await Order.findByPk(id, {
      include: [{
        model: OrderItem,
        as: 'items',
        include: [{
          model: Product,
          as: 'product',
          attributes: ['seller_id']
        }]
      }]
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if seller owns any products in this order
    if (req.user.role === 'seller') {
      const sellerProductIds = order.items
        .map(item => item.product.seller_id)
        .filter(sellerId => sellerId === req.user.id);
      
      if (sellerProductIds.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'You can only update orders containing your products'
        });
      }
    }

    const updateData = { status };
    
    if (tracking_number) {
      updateData.tracking_number = tracking_number;
    }
    
    if (notes) {
      updateData.notes = notes;
    }

    // Set timestamps based on status
    if (status === ORDER_STATUS.SHIPPED && !order.shipped_at) {
      updateData.shipped_at = new Date();
    }
    
    if (status === ORDER_STATUS.DELIVERED && !order.delivered_at) {
      updateData.delivered_at = new Date();
    }

    await order.update(updateData);

    const updatedOrder = await Order.findByPk(order.id, {
      include: [
        {
          model: OrderItem,
          as: 'items',
          include: [{
            model: Product,
            as: 'product',
            attributes: ['id', 'name', 'brand']
          }]
        },
        {
          model: User,
          as: 'buyer',
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ]
    });

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: { order: updatedOrder }
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status'
    });
  }
};

// Cancel order
const cancelOrder = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({
      where: {
        id,
        buyer_id: req.user.id,
        status: { [Op.in]: [ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED] }
      },
      include: [{
        model: OrderItem,
        as: 'items'
      }]
    });

    if (!order) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Order not found or cannot be cancelled'
      });
    }

    // Restore stock quantities
    for (const item of order.items) {
      if (item.variant_id) {
        await ProductVariant.increment('stock_quantity', {
          by: item.quantity,
          where: { id: item.variant_id },
          transaction
        });
      } else {
        await Product.increment('stock_quantity', {
          by: item.quantity,
          where: { id: item.product_id },
          transaction
        });
      }

      // Update product sales count
      await Product.decrement('total_sales', {
        by: item.quantity,
        where: { id: item.product_id },
        transaction
      });
    }

    // Update order status
    await order.update({
      status: ORDER_STATUS.CANCELLED,
      notes: reason ? `Cancelled by customer: ${reason}` : 'Cancelled by customer'
    }, { transaction });

    await transaction.commit();

    res.json({
      success: true,
      message: 'Order cancelled successfully'
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Cancel order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order'
    });
  }
};

// Get seller's orders
// const getSellerOrders = async (req, res) => {
//   console.log('testing -> req.user.id -> to debug get seller orders', req.user);
//   try {
//     const {
//       page = 1,
//       limit = 10,
//       status,
//       sort_by = 'created_at',
//       sort_order = 'DESC'
//     } = req.query;

//     const offset = (page - 1) * limit;

//     // Get orders containing seller's products
//     const { count, rows: orders } = await Order.findAndCountAll({
//       where: status ? { status } : {},
//       include: [{
//         model: OrderItem,
//         as: 'items',
//         require: true,
//         include: [{

//           model: Product,
//           as: 'product',
//           required: true,
//           where: { seller_id: req.user.id },
//           attributes: ['id', 'name', 'brand', 'seller_id'],
//           include: [{
//             model: ProductImage,
//             as: 'images',
//             where: { is_primary: true },
//             required: false,
//             limit: 1
//           }]
//         }],
//         required: true
//       }, {
//         model: User,
//         as: 'buyer',
//         attributes: ['id', 'first_name', 'last_name', 'email']
//       }, {
//         model: Address,
//         as: 'shippingAddress'
//       }],
//       where: status ? { status } : {},
//       order: [[sort_by, sort_order.toUpperCase()]],
//       limit: parseInt(limit),
//       offset: parseInt(offset),
//       distinct: true
//     });

//     const totalPages = Math.ceil(count / limit);

//     res.json({
//       success: true,
//       data: {
//         orders,
//         pagination: {
//           current_page: parseInt(page),
//           total_pages: totalPages,
//           total_items: count,
//           items_per_page: parseInt(limit)
//         }
//       }
//     });
//   } catch (error) {
//     console.error('Get seller orders error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to fetch orders'
//     });
//   }
// };
const getSellerOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    const sellerId = req.user.dataValues.id; 

    let whereClause = `WHERE p.seller_id = ${sellerId}`;
    if (status) {
      whereClause += ` AND o.status = '${status}'`;
    }

    const query = `
      SELECT 
        o.id AS order_id,
        o.order_number,
        o.status,
        o.total_amount,
        o.created_at AS order_date,
        u.first_name AS buyer_first_name,
        u.last_name AS buyer_last_name,
        u.email AS buyer_email,
        a.address_line_1,
        a.city,
        a.state,
        a.postal_code,
        a.country,
        p.id AS product_id,
        p.name AS product_name,
        p.brand AS product_brand,
        p.seller_id,
        oi.quantity,
        oi.unit_price,
        oi.total_price,
        pi.image_url AS product_image
      FROM orders o
      INNER JOIN order_items oi ON o.id = oi.order_id
      INNER JOIN products p ON oi.product_id = p.id
      LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = 1
      LEFT JOIN users u ON o.buyer_id = u.id
      LEFT JOIN addresses a ON o.shipping_address_id = a.id
      ${whereClause}
      ORDER BY o.${sort_by} ${sort_order}
      LIMIT ${limit} OFFSET ${offset};
    `;

    const orders = await sequelize.query(query, { type: QueryTypes.SELECT });

    const countQuery = `
      SELECT COUNT(DISTINCT o.id) AS total
      FROM orders o
      INNER JOIN order_items oi ON o.id = oi.order_id
      INNER JOIN products p ON oi.product_id = p.id
      ${whereClause};
    `;
    const totalResult = await sequelize.query(countQuery, { type: QueryTypes.SELECT });
    const totalItems = totalResult[0]?.total || 0;
    const totalPages = Math.ceil(totalItems / limit);

    return res.json({
      success: true,
      data: {
        orders,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_items: totalItems,
          items_per_page: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error('Get seller orders error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
    });
  }
};

module.exports = {
  createOrder,
  getUserOrders,
  getOrder,
  updateOrderStatus,
  cancelOrder,
  getSellerOrders
};