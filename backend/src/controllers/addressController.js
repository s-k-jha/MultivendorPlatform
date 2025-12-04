const { Address } = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../models');

// Get user's addresses
const getAddresses = async (req, res) => {
  try {
    const addresses = await Address.findAll({
      where: { user_id: req.user.id, is_active: true },
      order: [['is_default', 'DESC'], ['created_at', 'DESC']]
    });

    res.json({ success: true, data: { addresses } });
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch addresses' });
  }
};

// Get single address
const getAddress = async (req, res) => {
  try {
    const { id } = req.params;

    const address = await Address.findOne({
      where: { id, user_id: req.user.id, is_active: true }
    });

    if (!address) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    res.json({ success: true, data: { address } });
  } catch (error) {
    console.error('Get address error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch address' });
  }
};

// Create new address
const createAddress = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const addressData = { ...req.body, user_id: req.user.id, is_active: true };

    // If this is set as default, remove default from other addresses atomically
    if (req.body.is_default) {
      await Address.update(
        { is_default: false },
        { where: { user_id: req.user.id }, transaction: t }
      );
    }

    const address = await Address.create(addressData, { transaction: t });

    await t.commit();

    res.status(201).json({
      success: true,
      message: 'Address created successfully',
      data: { address }
    });
  } catch (error) {
    await t.rollback();
    console.error('Create address error:', error);
    res.status(500).json({ success: false, message: 'Failed to create address' });
  }
};

// Update address
const updateAddress = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const id = parseInt(req.params.id, 10);

    const address = await Address.findOne({
      where: { id, user_id: req.user.id },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!address) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    // If setting as default, remove default from other addresses
    if (req.body.is_default) {
      await Address.update(
        { is_default: false },
        { where: { user_id: req.user.id, id: { [Op.ne]: id } }, transaction: t }
      );
    }

    await address.update(req.body, { transaction: t });

    // ensure we return the latest state
    await address.reload({ transaction: t });

    await t.commit();

    res.json({
      success: true,
      message: 'Address updated successfully',
      data: { address }
    });
  } catch (error) {
    await t.rollback();
    console.error('Update address error:', error);
    res.status(500).json({ success: false, message: 'Failed to update address' });
  }
};

// Delete address
const deleteAddress = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const id = parseInt(req.params.id, 10);

    const address = await Address.findOne({
      where: { id, user_id: req.user.id },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!address) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    // Check if any orders reference this address
    const referencingOrder = await Order.findOne({
      where: { shipping_address_id: id },
      transaction: t
    });

    if (referencingOrder) {
      // Instead of deleting, archive the address so order history stays intact
      await address.update({ is_active: false }, { transaction: t });
      await t.commit();

      return res.status(409).json({
        success: false,
        message:
          'Address is used in existing orders and cannot be removed. The address has been archived (is_active=false).'
      });
    }

    // Safe to destroy (with paranoid=true in model, this will soft-delete)
    await address.destroy({ transaction: t });
    await t.commit();

    res.json({ success: true, message: 'Address deleted successfully' });
  } catch (error) {
    await t.rollback();
    console.error('Delete address error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete address' });
  }
};

// Set default address
const setDefaultAddress = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const id = parseInt(req.params.id, 10);

    const address = await Address.findOne({
      where: { id, user_id: req.user.id, is_active: true },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!address) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    // Remove default from all other addresses
    await Address.update(
      { is_default: false },
      { where: { user_id: req.user.id }, transaction: t }
    );

    // Set this address as default
    await address.update({ is_default: true }, { transaction: t });

    await t.commit();

    res.json({
      success: true,
      message: 'Default address updated',
      data: { address }
    });
  } catch (error) {
    await t.rollback();
    console.error('Set default address error:', error);
    res.status(500).json({ success: false, message: 'Failed to set default address' });
  }
};

module.exports = {
  getAddresses,
  getAddress,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress
};