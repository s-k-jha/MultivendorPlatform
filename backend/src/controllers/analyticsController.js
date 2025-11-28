const { UserFootprint } = require('../models');

const trackAction = async (req, res) => {
    try {
        const { product_id, metadata } = req.body;
        const userId = req.user ? req.user.id : null; 
        
        await UserFootprint.create({
            user_id: userId,
            product_id: product_id || null,
            metadata: metadata || null
        });

        res.status(200).json({ success: true });

    } catch (error) {
        console.error('Tracking error:', error);
        res.status(500).json({ success: false, message: 'Tracking failed' });
    }
};

module.exports = {
    trackAction
};