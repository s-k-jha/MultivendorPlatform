const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const User = require('./User');
const Product = require('./Product');
const ProductImage = require('./ProductImage');
const ProductVariant = require('./ProductVariant');
const Category = require('./Category');
const Order = require('./Order');
const OrderItem = require('./OrderItem');
const Cart = require('./Cart');
const CartItem = require('./CartItem');
const Review = require('./Review');
const Address = require('./Address');
const Theme = require('./Theme');
const Leads = require('./Leads');
const CarouselImage = require('./CarouselImage')(sequelize, DataTypes);
const ReturnRequest = require('./ReturnRequest'); 
const UserFootprint = require('./UserFootprint')(sequelize, DataTypes);


// Define associations
const defineAssociations = () => {
  // User associations
  User.hasMany(Product, { foreignKey: 'seller_id', as: 'products' });
  User.hasMany(Order, { foreignKey: 'buyer_id', as: 'orders' });
  User.hasOne(Cart, { foreignKey: 'user_id', as: 'cart' });
  User.hasMany(Review, { foreignKey: 'user_id', as: 'reviews' });
  User.hasMany(Address, { foreignKey: 'user_id', as: 'addresses' });

  // Product associations
  Product.belongsTo(User, { foreignKey: 'seller_id', as: 'seller' });
  Product.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });
  Product.hasMany(ProductImage, { foreignKey: 'product_id', as: 'images' });
  Product.hasMany(ProductVariant, { foreignKey: 'product_id', as: 'variants' });
  Product.hasMany(OrderItem, { foreignKey: 'product_id', as: 'orderItems' });
  Product.hasMany(CartItem, { foreignKey: 'product_id', as: 'cartItems' });
  Product.hasMany(Review, { foreignKey: 'product_id', as: 'reviews' });

  // Category associations
  Category.hasMany(Product, { foreignKey: 'category_id', as: 'products' });

  // Product Image associations
  ProductImage.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

  // Product Variant associations
  ProductVariant.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

  // Order associations
  Order.belongsTo(User, { foreignKey: 'buyer_id', as: 'buyer' });
  Order.belongsTo(Address, { foreignKey: 'shipping_address_id', as: 'shippingAddress' });
  Order.hasMany(OrderItem, { foreignKey: 'order_id', as: 'items' });

  // Order Item associations
  OrderItem.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });
  OrderItem.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
  OrderItem.belongsTo(ProductVariant, { foreignKey: 'variant_id', as: 'variant' });

  // Cart associations
  Cart.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
  Cart.hasMany(CartItem, { foreignKey: 'cart_id', as: 'items' });

  // Cart Item associations
  CartItem.belongsTo(Cart, { foreignKey: 'cart_id', as: 'cart' });
  CartItem.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });
  CartItem.belongsTo(ProductVariant, { foreignKey: 'variant_id', as: 'variant' });

  // Review associations
  Review.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
  Review.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

  // Address associations
  Address.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
  Address.hasMany(Order, { foreignKey: 'shipping_address_id', as: 'orders' });

  // ReturnRequest associations
  ReturnRequest.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
  ReturnRequest.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });
  ReturnRequest.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

  // Optional: Inverse associations (if want to access returns from the User/Order side)
  User.hasMany(ReturnRequest, { foreignKey: 'user_id', as: 'returnRequests' });
  Order.hasMany(ReturnRequest, { foreignKey: 'order_id', as: 'returns' });
};

// Initialize associations
defineAssociations();

module.exports = {
  sequelize,
  User,
  Product,
  ProductImage,
  ProductVariant,
  Category,
  Order,
  OrderItem,
  Cart,
  CartItem,
  Review,
  Address,
  CarouselImage,
  Theme,
  Leads,
  ReturnRequest,
  UserFootprint

};