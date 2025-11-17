const { 
  User, Product, Order, OrderItem, ProductImage, Category 
} = require('../models');

const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const redis = require('../utils/redis');

const getAdminDashboardOverview = async (req, res) => {
  try {
    const cacheKey = "admin_dashboard_overview";

    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log("Admin Dashboard Cache Hit");
      return res.json(JSON.parse(cached));
    }

    // -----------------------------
    //  TOTAL COUNTS
    // -----------------------------
    const totalUsers = await User.count();
    const totalSellers = await User.count({ where: { role: 'seller' } });
    const totalProducts = await Product.count();
    const totalCategories = await Category.count();
    const totalOrders = await Order.count();

    // -----------------------------
    //  TOTAL REVENUE
    // -----------------------------
    const [revenueRow] = await sequelize.query(
      `
      SELECT COALESCE(SUM(oi.total_price), 0) AS total_revenue
      FROM order_items oi
      `,
      { type: QueryTypes.SELECT }
    );

    // -----------------------------
    //  ORDER STATUS COUNTS
    // -----------------------------
    const [orderStatusCounts] = await sequelize.query(
      `
      SELECT 
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_orders,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered_orders,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders
      FROM orders
      `,
      { type: QueryTypes.SELECT }
    );

    // -----------------------------
    //  LAST 7 DAYS SALES GRAPH
    // -----------------------------
    const dailySales = await sequelize.query(
      `
      SELECT 
        DATE(o.created_at) AS date,
        SUM(oi.total_price) AS revenue
      FROM orders o
      INNER JOIN order_items oi ON oi.order_id = o.id
      WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY DATE(o.created_at)
      ORDER BY date ASC
      `,
      { type: QueryTypes.SELECT }
    );

    // -----------------------------
    //  TOP 5 BEST SELLING PRODUCTS
    // -----------------------------
    const topProducts = await sequelize.query(
      `
      SELECT 
        p.id,
        p.name,
        p.price,
        SUM(oi.quantity) AS total_sold,
        (SELECT image_url 
           FROM product_images 
           WHERE product_id = p.id AND is_primary = 1 LIMIT 1
        ) AS primary_image
      FROM order_items oi
      INNER JOIN products p ON p.id = oi.product_id
      GROUP BY p.id
      ORDER BY total_sold DESC
      LIMIT 5
      `,
      { type: QueryTypes.SELECT }
    );

    // -----------------------------
    // RESPONSE
    // -----------------------------
    const responsePayload = {
      success: true,
      data: {
        stats: {
          total_users: totalUsers,
          total_sellers: totalSellers,
          total_products: totalProducts,
          total_categories: totalCategories,
          total_orders: totalOrders,
          total_revenue: revenueRow.total_revenue
        },
        order_status: {
          pending: orderStatusCounts.pending_orders,
          delivered: orderStatusCounts.delivered_orders,
          cancelled: orderStatusCounts.cancelled_orders
        },
        sales_graph: dailySales,
        top_selling_products: topProducts
      }
    };

    await redis.setex(cacheKey, 300, JSON.stringify(responsePayload));

    return res.json(responsePayload);

  } catch (error) {
    console.error("Admin Dashboard Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin dashboard data"
    });
  }
};

module.exports = { getAdminDashboardOverview };
