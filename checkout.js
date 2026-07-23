const API_BASE_URL = "https://cufood-backend.onrender.com";

const pageContent = document.getElementById("page-content");
const backLink = document.getElementById("back-link");

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatPrice(price) {
  if (price === null || price === undefined) return "";
  const value = parseFloat(price);
  if (Number.isNaN(value)) return "";
  return Number.isInteger(value) ? `₹${value}` : `₹${value.toFixed(2)}`;
}

function emptyCartView() {
  pageContent.innerHTML = `
    <div class="text-center bg-white border border-line rounded-2xl shadow-sm px-7 py-14">
      <span class="flex items-center justify-center w-14 h-14 rounded-full bg-accent-soft text-accent mx-auto mb-4 p-3.5">${ICONS.cart}</span>
      <p class="text-muted text-[15px] mb-4">Your cart is empty.</p>
      <a href="location-select.html" class="text-accent-deep font-bold hover:underline">Browse outlets</a>
    </div>
  `;
}

function renderCartLine(key, line) {
  return `
    <div class="flex items-center justify-between gap-4 py-3 border-b border-line last:border-b-0">
      <div class="min-w-0">
        <p class="text-[15px] font-semibold text-ink truncate">${escapeHtml(line.name)}${line.sizeLabel ? ` <span class="text-muted font-medium">(${escapeHtml(line.sizeLabel)})</span>` : ""}</p>
        <p class="text-xs text-muted">${escapeHtml(formatPrice(line.unitPrice))} each</p>
      </div>
      <div class="flex items-center gap-3 flex-shrink-0">
        <div class="inline-flex items-center gap-2.5 bg-cream-alt rounded-full pl-1 pr-1 py-1">
          <button type="button" class="cart-line-remove w-7 h-7 flex items-center justify-center rounded-full hover:bg-white transition-colors duration-150" data-key="${escapeHtml(key)}">
            <span class="w-3.5 h-3.5 text-ink">${ICONS.minus}</span>
          </button>
          <span class="text-sm font-bold min-w-[1rem] text-center">${line.quantity}</span>
          <button type="button" class="cart-line-add w-7 h-7 flex items-center justify-center rounded-full hover:bg-white transition-colors duration-150" data-key="${escapeHtml(key)}">
            <span class="w-3.5 h-3.5 text-ink">${ICONS.plus}</span>
          </button>
        </div>
        <p class="text-[15px] font-bold text-accent-deep w-16 text-right">${escapeHtml(formatPrice(line.unitPrice * line.quantity))}</p>
      </div>
    </div>
  `;
}

function renderCheckout(cart) {
  const lines = Object.entries(cart.items);
  const total = getCartTotal(cart);

  pageContent.innerHTML = `
    <h1 class="text-2xl sm:text-3xl font-extrabold text-ink mb-1">Your order</h1>
    <p class="text-sm text-muted mb-6">From <span class="font-bold text-ink">${escapeHtml(cart.restaurantName)}</span></p>

    <div id="error-banner" class="hidden text-sm font-medium text-error bg-error-soft rounded-xl px-4 py-3 mb-5"></div>

    <div class="bg-white border border-line rounded-2xl shadow-sm p-5 sm:p-6 mb-6">
      <div id="cart-lines">${lines.map(([key, line]) => renderCartLine(key, line)).join("")}</div>
      <div class="flex items-center justify-between pt-4 mt-2 border-t border-line">
        <span class="text-sm font-bold text-muted uppercase tracking-wide">Total</span>
        <span class="text-xl font-extrabold text-ink">${escapeHtml(formatPrice(total))}</span>
      </div>
    </div>

    <div class="bg-cream-alt border border-line rounded-2xl shadow-sm p-5 sm:p-6 mb-6">
      <h2 class="text-xs font-bold uppercase tracking-widest text-muted mb-4">Your details</h2>
      <form id="checkout-form" class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-semibold text-muted" for="student-name">Name</label>
          <input type="text" id="student-name" required
            class="rounded-xl border-2 border-line bg-white px-4 py-3 text-[15px] text-ink focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft transition-all duration-150">
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-semibold text-muted" for="student-uid">University ID (UID)</label>
          <input type="text" id="student-uid" required
            class="rounded-xl border-2 border-line bg-white px-4 py-3 text-[15px] text-ink focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft transition-all duration-150">
          <p class="text-xs text-muted">Show this + your order code at pickup.</p>
        </div>
        <button type="submit" id="pay-btn" class="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-accent to-accent-deep text-white font-bold text-base px-5 py-3.5 shadow-accent-glow hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 mt-1">
          Pay ${escapeHtml(formatPrice(total))}
        </button>
        <p class="text-xs text-muted text-center leading-relaxed">Prepaid only — no cash on delivery. If the restaurant can't take your order, you're refunded automatically. Ready in ~15 min after they accept.</p>
      </form>
    </div>
  `;

  attachCheckoutListeners();
}

function attachCheckoutListeners() {
  document.querySelectorAll(".cart-line-add").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cart = getCart();
      const line = cart && cart.items[btn.dataset.key];
      if (!line) return;
      addToCart({
        restaurantSlug: cart.restaurantSlug,
        restaurantName: cart.restaurantName,
        menuItemId: line.menuItemId,
        name: line.name,
        sizeLabel: line.sizeLabel,
        unitPrice: line.unitPrice,
      });
      refresh();
    });
  });

  document.querySelectorAll(".cart-line-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cart = getCart();
      const line = cart && cart.items[btn.dataset.key];
      if (!line) return;
      removeFromCart(line.menuItemId, line.sizeLabel);
      refresh();
    });
  });

  const form = document.getElementById("checkout-form");
  if (form) form.addEventListener("submit", handleCheckoutSubmit);
}

function refresh() {
  const cart = getCart();
  if (!cart || getCartItemCount(cart) === 0) {
    emptyCartView();
    return;
  }
  renderCheckout(cart);
}

function hideError() {
  const banner = document.getElementById("error-banner");
  if (banner) banner.classList.add("hidden");
}

function showError(message) {
  const banner = document.getElementById("error-banner");
  if (!banner) return;
  banner.textContent = message;
  banner.classList.remove("hidden");
}

function resetPayButton() {
  const payBtn = document.getElementById("pay-btn");
  const cart = getCart();
  if (!payBtn || !cart) return;
  payBtn.disabled = false;
  payBtn.textContent = `Pay ${formatPrice(getCartTotal(cart))}`;
}

async function handleCheckoutSubmit(event) {
  event.preventDefault();
  hideError();

  const cart = getCart();
  if (!cart || getCartItemCount(cart) === 0) {
    refresh();
    return;
  }

  const studentName = document.getElementById("student-name").value.trim();
  const studentUid = document.getElementById("student-uid").value.trim();
  if (!studentName || !studentUid) {
    showError("Please fill in your name and UID.");
    return;
  }

  const payBtn = document.getElementById("pay-btn");
  payBtn.disabled = true;
  payBtn.textContent = "Starting payment...";

  const items = Object.values(cart.items).map((line) => ({
    menu_item_id: line.menuItemId,
    quantity: line.quantity,
    size_label: line.sizeLabel,
  }));

  try {
    const response = await fetch(`${API_BASE_URL}/api/orders/create-payment/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurant_slug: cart.restaurantSlug,
        student_name: studentName,
        student_uid: studentUid,
        items,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      showError(data.detail || "Could not start payment. Please try again.");
      resetPayButton();
      return;
    }
    openRazorpayCheckout(data, studentName);
  } catch (err) {
    showError("Could not reach the server. Please try again.");
    console.error(err);
    resetPayButton();
  }
}

function openRazorpayCheckout(paymentData, studentName) {
  if (typeof Razorpay === "undefined") {
    showError("Could not load the payment window. Please refresh and try again.");
    resetPayButton();
    return;
  }

  const rzp = new Razorpay({
    key: paymentData.razorpay_key_id,
    amount: paymentData.amount,
    currency: paymentData.currency,
    order_id: paymentData.razorpay_order_id,
    name: "CUFood",
    description: paymentData.restaurant_name,
    prefill: { name: studentName },
    theme: { color: "#d9531e" },
    handler: function (response) {
      verifyPayment(response, paymentData.order_code);
    },
    modal: {
      ondismiss: function () {
        resetPayButton();
        showError("Payment cancelled. Your cart is still here — try again when ready.");
      },
    },
  });

  rzp.on("payment.failed", function () {
    resetPayButton();
    showError("Payment failed. Please try again.");
  });

  rzp.open();
}

async function verifyPayment(razorpayResponse, orderCode) {
  const payBtn = document.getElementById("pay-btn");
  if (payBtn) payBtn.textContent = "Confirming payment...";

  try {
    const response = await fetch(`${API_BASE_URL}/api/orders/verify-payment/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpay_order_id: razorpayResponse.razorpay_order_id,
        razorpay_payment_id: razorpayResponse.razorpay_payment_id,
        razorpay_signature: razorpayResponse.razorpay_signature,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      showError(data.detail || "Payment could not be verified. If money was deducted, contact support.");
      resetPayButton();
      return;
    }
    clearCart();
    window.location.href = `order-status.html?code=${encodeURIComponent(orderCode)}`;
  } catch (err) {
    showError("Payment succeeded but we couldn't confirm it. If money was deducted, contact support.");
    console.error(err);
  }
}

if (backLink) {
  const cart = getCart();
  backLink.href = cart && cart.restaurantSlug
    ? `restaurant.html?slug=${encodeURIComponent(cart.restaurantSlug)}`
    : "location-select.html";
}

refresh();
