const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Leads = sequelize.define('Leads', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false
  },
  contact: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: 1
  }
}, {
  tableName: 'Leads'
});

module.exports = Leads;
