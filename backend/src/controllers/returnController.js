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

// Update Return Request Status (Admin/Seller only ideally)
const updateReturnStatus = async (req, res) => {
    try {
        const { id } = req.params; // Return Request ID
        const { status, admin_comment } = req.body;

        // 1. Validate Status
        const validStatuses = ['pending', 'approved', 'rejected', 'completed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status value' });
        }

        // 2. Find the Return Request
        const returnRequest = await ReturnRequest.findByPk(id);

        if (!returnRequest) {
            return res.status(404).json({ success: false, message: 'Return request not found' });
        }

        // 3. Authorization Check (Optional but recommended)
        // You might want to check if req.user.role === 'admin' or 'seller' here
        // if (req.user.role !== 'admin') { ... }

        // 4. Update the Status
        returnRequest.status = status;
        
        // (Optional) If you have a comment field for admins/sellers
        // if (admin_comment) returnRequest.admin_comment = admin_comment;

        await returnRequest.save();

        // 5. Handle Business Logic based on status
        if (status === 'approved') {
            // TODO: Send email to user with shipping label
        } else if (status === 'completed') {
            // TODO: Trigger Refund Logic (Stripe/Wallet/etc)
        }

        res.json({
            success: true,
            message: `Return request marked as ${status}`,
            data: returnRequest
        });

    } catch (error) {
        console.error('Update return status error:', error);
        res.status(500).json({ success: false, message: 'Failed to update return status' });
    }
};

module.exports = {
    createReturnRequest,
    getUserReturnRequests,
    updateReturnStatus
};