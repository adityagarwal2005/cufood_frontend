// Shared cart state, used by restaurant.js (add/remove) and checkout.js
// (review/submit). Backed by localStorage so it survives page navigation
// without needing a student account. A cart can only hold items from one
// restaurant at a time — callers are responsible for confirming with the
// student before switching (see restaurant.js's addToCart flow).
const CART_STORAGE_KEY = "cufood_cart";

function cartLineKey(menuItemId, sizeLabel) {
  return `${menuItemId}|${sizeLabel || ""}`;
}

function getCart() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return null;
    const cart = JSON.parse(raw);
    if (!cart || typeof cart.items !== "object") return null;
    return cart;
  } catch (err) {
    return null;
  }
}

function saveCart(cart) {
  if (!cart || Object.keys(cart.items).length === 0) {
    localStorage.removeItem(CART_STORAGE_KEY);
    return;
  }
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

function clearCart() {
  localStorage.removeItem(CART_STORAGE_KEY);
}

// Returns the updated cart. If the cart currently belongs to a different
// restaurant, the caller must clearCart() first (with student confirmation)
// before calling this — it will otherwise keep appending to the old cart.
function addToCart({ restaurantSlug, restaurantName, menuItemId, name, sizeLabel, unitPrice }) {
  let cart = getCart();
  if (!cart || cart.restaurantSlug !== restaurantSlug) {
    cart = { restaurantSlug, restaurantName, items: {} };
  }
  const key = cartLineKey(menuItemId, sizeLabel);
  if (cart.items[key]) {
    cart.items[key].quantity += 1;
  } else {
    cart.items[key] = { menuItemId, name, sizeLabel: sizeLabel || "", unitPrice, quantity: 1 };
  }
  saveCart(cart);
  return cart;
}

function removeFromCart(menuItemId, sizeLabel) {
  const cart = getCart();
  if (!cart) return null;
  const key = cartLineKey(menuItemId, sizeLabel);
  if (cart.items[key]) {
    cart.items[key].quantity -= 1;
    if (cart.items[key].quantity <= 0) delete cart.items[key];
  }
  saveCart(cart);
  return cart;
}

function removeCartLine(menuItemId, sizeLabel) {
  const cart = getCart();
  if (!cart) return null;
  delete cart.items[cartLineKey(menuItemId, sizeLabel)];
  saveCart(cart);
  return cart;
}

function getCartLineQuantity(menuItemId, sizeLabel) {
  const cart = getCart();
  if (!cart) return 0;
  const line = cart.items[cartLineKey(menuItemId, sizeLabel)];
  return line ? line.quantity : 0;
}

function getCartItemCount(cart) {
  cart = cart === undefined ? getCart() : cart;
  if (!cart) return 0;
  return Object.values(cart.items).reduce((sum, line) => sum + line.quantity, 0);
}

function getCartTotal(cart) {
  cart = cart === undefined ? getCart() : cart;
  if (!cart) return 0;
  return Object.values(cart.items).reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
}
