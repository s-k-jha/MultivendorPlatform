const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OrderItem = sequelize.define('OrderItem', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  order_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'orders',
      key: 'id'
    }
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'products',
      key: 'id'
    }
  },
  variant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'product_variants',
      key: 'id'
    }
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1
    }
  },
  unit_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  total_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  product_name: {
    type: DataTypes.STRING(200),
    allowNull: false,
    comment: 'Snapshot of product name at time of order'
  },
  product_sku: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Snapshot of product SKU at time of order'
  },
  variant_details: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Snapshot of variant details (size, color, etc.)'
  }
}, {
  tableName: 'order_items'
});

module.exports = OrderItem;