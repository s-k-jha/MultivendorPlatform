const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); 

const ReturnRequest = sequelize.define('ReturnRequest', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
        model: 'users', 
        key: 'id'
    }
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
  reason: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected', 'completed'),
    defaultValue: 'pending',
  },
  refund_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  images: {
    type: DataTypes.JSON, 
    allowNull: true,
    comment: 'Array of evidence image URLs'
  }
}, {
  tableName: 'return_requests',
  timestamps: true,
});

module.exports = ReturnRequest;