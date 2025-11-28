const { ReturnRequest, Order, OrderItem, Product } = require('../models');
const cloudinary = require('../utils/cloudinary.js'); 
const streamifier = require('streamifier');

const createReturnRequest = async (req, res) => {
    try {
        console.log('user id', req.user.id)
        const { order_id, product_id, reason, description, quantity } = req.body;
        const userId = req.user.id; // Assuming auth middleware sets req.user

        const order = await Order.findOne({
            where: { id: order_id, buyer_id: userId }
        });

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found or does not belong to you.' });
        }

        const orderItem = await OrderItem.findOne({
            where: { order_id: order_id, product_id: product_id }
        });

        if (!orderItem) {
            return res.status(400).json({ success: false, message: 'This product was not found in the specified order.' });
        }

        const existingReturn = await ReturnRequest.findOne({
            where: { order_id, product_id }
        });

        if (existingReturn) {
            return res.status(400).json({ success: false, message: 'A return request has already been submitted for this item.' });
        }

        // 4. Handle Image Uploads to Cloudinary (Evidence)
        let evidenceImages = [];
        if (req.files && req.files.length > 0) {
            const uploadPromises = req.files.map((file, index) => {
                return new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        {
                            folder: `e-commerce/returns/${order_id}`,
                            resource_type: "auto"
                        },
                        (error, result) => {
                            if (error) return reject(error);
                            resolve(result.secure_url);
                        }
                    );
                    streamifier.createReadStream(file.buffer).pipe(uploadStream);
                });
            });

            evidenceImages = await Promise.all(uploadPromises);
        }

        // 5. Create the Return Request Record
        // Calculate refund amount (simple logic: price * quantity)
        //  might need more complex logic if you have discounts/coupons applied
        const refundAmount = parseFloat(orderItem.price) * (parseInt(quantity) || 1);

        const returnRequest = await ReturnRequest.create({
            user_id: userId,
            order_id,
            product_id,
            reason,
            description,
            refund_amount: refundAmount,
            images: evidenceImages,
            status: 'pending'
        });

        res.status(201).json({
            success: true,
            message: 'Return request submitted successfully.',
            data: returnRequest
        });

    } catch (error) {
        console.error('Create return request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit return request',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getUserReturnRequests = async (req, res) => {
    try {
        const returns = await ReturnRequest.findAll({
            where: { user_id: req.user.id },
            include: [
                { model: Product, as: 'product', attributes: ['id', 'name'] }
            ],
            order: [['createdAt', 'DESC']]
        });

        res.json({ success: true, data: returns });
    } catch (error) {
        console.error('Get returns error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch return requests' });
    }
};

module.exports = {
    createReturnRequest,
    getUserReturnRequests
};