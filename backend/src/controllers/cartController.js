const { Cart, CartItem, Product, ProductVariant, ProductImage } = require('../models');

// Get user's cart
const getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({
      where: { user_id: req.user.id },
      include: [{
        model: CartItem,
        as: 'items',
        include: [{
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'brand', 'price', 'discount_price', 'stock_quantity', 'status'],
          include: [{
            model: ProductImage,
            as: 'images',
            where: { is_primary: true },
            required: false,
            limit: 1
          }]
        }, {
          model: ProductVariant,
          as: 'variant',
          required: false
        }]
      }]
    });
    //testing: migration branch
    if (!cart) {
      // Create cart if it doesn't exist
      const newCart = await Cart.create({ user_id: req.user.id });
      return res.json({
        success: true,
        data: { cart: { ...newCart.toJSON(), items: [] } }
      });
    }

    res.json({
      success: true,
      data: { cart }
    });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cart'
    });
  }
};

// Add item to cart
const addToCart = async (req, res) => {
  try {
    const { product_id, variant_id, quantity = 1 } = req.body;

    // Verify product exists and is active
    const product = await Product.findOne({
      where: { id: product_id, status: 'active' },
      include: [{
        model: ProductVariant,
        as: 'variants',
        where: variant_id ? { id: variant_id, is_active: true } : undefined,
        required: false
      }]
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or not available'
      });
    }

    let variant = null;
    let availableStock = product.stock_quantity;

    if (variant_id) {
      variant = product.variants.find(v => v.id === variant_id);
      if (!variant) {
        return res.status(404).json({
          success: false,
          message: 'Product variant not found'
        });
      }
      availableStock = variant.stock_quantity;
    }

    // Get or create cart
    let cart = await Cart.findOne({ where: { user_id: req.user.id } });
    if (!cart) {
      cart = await Cart.create({ user_id: req.user.id });
    }

    // Check if item already exists in cart
    let cartItem = await CartItem.findOne({
      where: {
        cart_id: cart.id,
        product_id,
        variant_id: variant_id || null
      }
    });

    const newQuantity = cartItem ? cartItem.quantity + quantity : quantity;

    if (newQuantity > availableStock) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Available: ${availableStock}`
      });
    }

    if (cartItem) {
      await cartItem.update({ quantity: newQuantity });
    } else {
      cartItem = await CartItem.create({
        cart_id: cart.id,
        product_id,
        variant_id,
        quantity
      });
    }

    // Update cart totals
    await updateCartTotals(cart.id);

    // Fetch updated cart
    const updatedCart = await Cart.findByPk(cart.id, {
      include: [{
        model: CartItem,
        as: 'items',
        include: [{
          model: Product,
          as: 'product',
          include: [{
            model: ProductImage,
            as: 'images',
            where: { is_primary: true },
            required: false,
            limit: 1
          }]
        }, {
          model: ProductVariant,
          as: 'variant',
          required: false
        }]
      }]
    });

    res.json({
      success: true,
      message: 'Item added to cart',
      data: { cart: updatedCart }
    });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add item to cart'
    });
  }
};

// Update cart item quantity
const updateCartItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    if (quantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be at least 1'
      });
    }

    const cartItem = await CartItem.findOne({
      where: { id },
      include: [{
        model: Cart,
        as: 'cart',
        where: { user_id: req.user.id }
      }, {
        model: Product,
        as: 'product'
      }, {
        model: ProductVariant,
        as: 'variant',
        required: false
      }]
    });

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found'
      });
    }

    // Check stock availability
    const availableStock = cartItem.variant 
      ? cartItem.variant.stock_quantity 
      : cartItem.product.stock_quantity;

    if (quantity > availableStock) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Available: ${availableStock}`
      });
    }

    await cartItem.update({ quantity });
    await updateCartTotals(cartItem.cart.id);

    res.json({
      success: true,
      message: 'Cart item updated'
    });
  } catch (error) {
    console.error('Update cart item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cart item'
    });
  }
};

// Remove item from cart
const removeFromCart = async (req, res) => {
  try {
    const { id } = req.params;

    const cartItem = await CartItem.findOne({
      where: { id },
      include: [{
        model: Cart,
        as: 'cart',
        where: { user_id: req.user.id }
      }]
    });

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found'
      });
    }

    const cartId = cartItem.cart.id;
    await cartItem.destroy();
    await updateCartTotals(cartId);

    res.json({
      success: true,
      message: 'Item removed from cart'
    });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove item from cart'
    });
  }
};

// Clear cart
const clearCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ where: { user_id: req.user.id } });
    
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    await CartItem.destroy({ where: { cart_id: cart.id } });
    await cart.update({
      total_items: 0,
      total_amount: 0
    });

    res.json({
      success: true,
      message: 'Cart cleared'
    });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cart'
    });
  }
};

// Helper function to update cart totals
const updateCartTotals = async (cartId) => {
  const cartItems = await CartItem.findAll({
    where: { cart_id: cartId },
    include: [{
      model: Product,
      as: 'product'
    }, {
      model: ProductVariant,
      as: 'variant',
      required: false
    }]
  });

  let totalItems = 0;
  let totalAmount = 0;

  cartItems.forEach(item => {
    totalItems += item.quantity;
    const price = parseFloat(item.product.discount_price || item.product.price);
    const variantAdjustment = item.variant ? parseFloat(item.variant.price_adjustment || 0) : 0;
    totalAmount += (price + variantAdjustment) * item.quantity;
  });

  await Cart.update(
    { total_items: totalItems, total_amount: totalAmount },
    { where: { id: cartId } }
  );
};

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart
};