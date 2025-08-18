const USER_ROLES = {
  ADMIN: 'admin',
  SELLER: 'seller',
  BUYER: 'buyer'
};

const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled'
};

const PRODUCT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  OUT_OF_STOCK: 'out_of_stock'
};

module.exports = {
  USER_ROLES,
  ORDER_STATUS,
  PRODUCT_STATUS
};