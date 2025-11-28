const { Product, ProductImage, Order, OrderItem, Review } = require('../models');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const redis = require('../utils/redis');

const getSellerDashboardOverview = async (req, res) => {
    try {
        const sellerId = req.user.id;

        const cacheKey = `seller_dashboard:${sellerId}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
            console.log("Seller dashboard cache hit");
            return res.json(JSON.parse(cached));
        }

        // -----------------------------
        // TOTAL PRODUCTS
        // -----------------------------
        const totalProducts = await Product.count({
            where: { seller_id: sellerId }
        });

        // -----------------------------
        // TOTAL ORDERS (INCLUDING ORDER ITEMS)
        // -----------------------------
        const totalOrders = await Order.count({
            include: [
                {
                    model: OrderItem,
                    as: 'items',            // FIXED ALIAS
                    required: true,
                    include: [
                        {
                            model: Product,
                            as: 'product',      // FIXED ALIAS
                            where: { seller_id: sellerId }
                        }
                    ]
                }
            ],
            distinct: true
        });


        // -----------------------------
        // ORDER STATUS COUNTS
        // -----------------------------
        const [orderCounts] = await sequelize.query(
            `
      SELECT 
        SUM(CASE WHEN o.status = 'pending' THEN 1 ELSE 0 END) AS pending_orders,
        SUM(CASE WHEN o.status = 'delivered' THEN 1 ELSE 0 END) AS delivered_orders,
        SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders
      FROM orders o
      INNER JOIN order_items oi ON oi.order_id = o.id
      INNER JOIN products p ON p.id = oi.product_id
      WHERE p.seller_id = :sellerId
      `,
            {
                replacements: { sellerId },
                type: QueryTypes.SELECT
            }
        );

        // -----------------------------
        // TOTAL REVENUE
        // -----------------------------
        const [revenueRow] = await sequelize.query(
            `
      SELECT 
        COALESCE(SUM(oi.total_price), 0) AS total_revenue
      FROM order_items oi
      INNER JOIN products p ON p.id = oi.product_id
      WHERE p.seller_id = :sellerId
      `,
            {
                replacements: { sellerId },
                type: QueryTypes.SELECT
            }
        );

        // -----------------------------
        // AVG RATING OF SELLER PRODUCTS
        // -----------------------------
        const [ratingRow] = await sequelize.query(
            `
      SELECT 
        COALESCE(AVG(r.rating), 0) AS avg_rating
      FROM reviews r
      INNER JOIN products p ON p.id = r.product_id
      WHERE p.seller_id = :sellerId
      `,
            {
                replacements: { sellerId },
                type: QueryTypes.SELECT
            }
        );

        // -----------------------------
        // TOP 5 SELLING PRODUCTS
        // -----------------------------
        const topProducts = await sequelize.query(
            `
  SELECT 
    p.id,
    p.name,
    p.price,
    p.seller_id,
    p.category_id,
    SUM(oi.quantity) AS total_sold,
    (SELECT image_url FROM product_images 
        WHERE product_id = p.id AND is_primary = 1 LIMIT 1) AS primary_image
  FROM order_items oi
  INNER JOIN products p ON p.id = oi.product_id
  WHERE p.seller_id = :sellerId
  GROUP BY p.id
  ORDER BY total_sold DESC
  LIMIT 5;
  `,
            {
                replacements: { sellerId },
                type: QueryTypes.SELECT
            }
        );



        // -----------------------------
        // FINAL RESPONSE PAYLOAD
        // -----------------------------
        const responsePayload = {
            success: true,
            data: {
                total_products: totalProducts,
                total_orders: totalOrders,
                total_revenue: parseFloat(revenueRow.total_revenue || 0),
                pending_orders: parseInt(orderCounts.pending_orders || 0),
                delivered_orders: parseInt(orderCounts.delivered_orders || 0),
                cancelled_orders: parseInt(orderCounts.cancelled_orders || 0),
                avg_rating: parseFloat(ratingRow.avg_rating || 0).toFixed(2),
                top_selling_products: topProducts
            }
        };

        // Cache dashboard for 5 minutes
        await redis.setex(cacheKey, 300, JSON.stringify(responsePayload));

        return res.json(responsePayload);

    } catch (error) {
        console.error("Seller Dashboard Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch seller dashboard data"
        });
    }
};

module.exports = { getSellerDashboardOverview };
