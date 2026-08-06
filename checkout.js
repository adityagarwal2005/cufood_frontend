const API_BASE_URL = "https://cufood-backend.onrender.com";

const pageContent = document.getElementById("page-content");
const backLink = document.getElementById("back-link");

// So my-orders.html can list past orders without a student account —
// read by my-orders.js under the same key.
const MY_ORDERS_KEY = "cufood_my_orders";
const MAX_TRACKED_ORDERS = 10;

function rememberMyOrder(code, restaurantName) {
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(MY_ORDERS_KEY)) || [];
  } catch (err) {
    list = [];
  }
  list = list.filter((entry) => entry.code !== code);
  list.unshift({ code, restaurantName, placedAt: new Date().toISOString() });
  localStorage.setItem(MY_ORDERS_KEY, JSON.stringify(list.slice(0, MAX_TRACKED_ORDERS)));
}

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

function formatSlotTime(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Mirrors the backend's MIN_SCHEDULE_LEAD_MINUTES / MAX_SCHEDULE_LEAD_HOURS
// (see CreateOrderView.parse_scheduled_for) — kept in sync manually since
// this is a plain static site with no shared config between frontend/backend.
const MIN_SCHEDULE_LEAD_MINUTES = 10;
const MAX_SCHEDULE_LEAD_HOURS = 4;
const SLOT_INTERVAL_MINUTES = 15;

// Generates pickup slots every 15 min, starting from the next slot that's
// safely past the minimum lead time, through the scheduling window.
function generateTimeSlots() {
  const now = new Date();
  const earliest = new Date(now.getTime() + MIN_SCHEDULE_LEAD_MINUTES * 60000);
  const latest = new Date(now.getTime() + MAX_SCHEDULE_LEAD_HOURS * 3600000);

  const first = new Date(earliest);
  const remainder = first.getMinutes() % SLOT_INTERVAL_MINUTES;
  if (remainder !== 0) first.setMinutes(first.getMinutes() + (SLOT_INTERVAL_MINUTES - remainder));
  first.setSeconds(0, 0);

  const slots = [];
  for (let t = new Date(first); t <= latest; t.setMinutes(t.getMinutes() + SLOT_INTERVAL_MINUTES)) {
    slots.push(new Date(t));
  }
  return slots;
}

// null = "as soon as possible" (the default). Set to a Date when the
// student picks a slot; survives re-render since it's module-level.
let selectedSlot = null;

function emptyCartView() {
  // backLink is set once at page load from the cart that existed then (see
  // the bottom of this file) and its href doesn't change after — so it's
  // still pointing at the right restaurant even once the cart empties out
  // from here, unlike a hardcoded link to the generic location picker.
  const goBackHref = backLink ? backLink.href : "location-select.html";
  const goBackLabel = backLink && backLink.href.includes("restaurant.html") ? "Back to menu" : "Browse outlets";
  pageContent.innerHTML = `
    <div class="text-center bg-white border border-line rounded-2xl shadow-sm px-7 py-14">
      <span class="flex items-center justify-center w-14 h-14 rounded-full bg-accent-soft text-accent mx-auto mb-4 p-3.5">${ICONS.cart}</span>
      <p class="text-muted text-[15px] mb-4">Your cart is empty.</p>
      <a href="${escapeHtml(goBackHref)}" class="text-accent-deep font-bold hover:underline">${goBackLabel}</a>
    </div>
  `;
}

function renderCartLine(key, line) {
  return `
    <div class="flex items-start justify-between gap-4 py-3 border-b border-line last:border-b-0">
      <div class="min-w-0">
        <p class="text-[15px] font-semibold text-ink">${escapeHtml(line.name)}${line.sizeLabel ? ` <span class="text-muted font-medium">(${escapeHtml(line.sizeLabel)})</span>` : ""}</p>
        <p class="text-xs text-muted">${escapeHtml(formatPrice(line.unitPrice))} each</p>
      </div>
      <div class="flex items-center gap-3 flex-shrink-0">
        <div class="inline-flex items-center gap-1 bg-cream-alt rounded-full pl-1 pr-1 py-1">
          <button type="button" class="cart-line-remove w-9 h-9 flex items-center justify-center rounded-full hover:bg-white transition-colors duration-150" data-key="${escapeHtml(key)}">
            <span class="w-3.5 h-3.5 text-ink">${ICONS.minus}</span>
          </button>
          <span class="text-sm font-bold min-w-[1rem] text-center">${line.quantity}</span>
          <button type="button" class="cart-line-add w-9 h-9 flex items-center justify-center rounded-full hover:bg-white transition-colors duration-150" data-key="${escapeHtml(key)}">
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

    <div class="bg-white border border-line rounded-2xl shadow-sm p-5 sm:p-6 mb-6">
      <h2 class="text-xs font-bold uppercase tracking-widest text-muted mb-4">When?</h2>
      <div class="grid grid-cols-2 gap-2.5 mb-1">
        <button type="button" id="when-asap-btn" class="rounded-xl border-2 px-4 py-3 text-sm font-bold transition-all duration-150 ${selectedSlot === null ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-white text-muted hover:border-accent-soft"}">
          Now
          <span class="block text-xs font-medium ${selectedSlot === null ? "text-accent-deep/70" : "text-muted"} mt-0.5">Pay now, cooked right away</span>
        </button>
        <button type="button" id="when-schedule-btn" class="rounded-xl border-2 px-4 py-3 text-sm font-bold transition-all duration-150 ${selectedSlot !== null ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-white text-muted hover:border-accent-soft"}">
          Schedule
          <span class="block text-xs font-medium ${selectedSlot !== null ? "text-accent-deep/70" : "text-muted"} mt-0.5">${selectedSlot ? `Pickup ~${escapeHtml(formatSlotTime(selectedSlot))}` : "Pick a pickup time"}</span>
        </button>
      </div>
      <div id="slot-picker" class="${selectedSlot !== null ? "flex" : "hidden"} flex-wrap gap-2 pt-4 mt-3 border-t border-line"></div>
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
          <label class="text-xs font-semibold text-muted" for="student-phone">Your phone number</label>
          <input type="tel" id="student-phone" placeholder="98765 43210" required
            class="rounded-xl border-2 border-line bg-white px-4 py-3 text-[15px] text-ink focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft transition-all duration-150">
          <p class="text-xs text-muted">Only used to refund you directly if the restaurant can't take your order.</p>
        </div>
        <button type="submit" id="pay-btn" class="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-accent to-accent-deep text-white font-bold text-base px-5 py-3.5 shadow-accent-glow hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 mt-1">
          Continue to pay — ${escapeHtml(formatPrice(total))}
        </button>
        <p class="text-xs text-muted text-center leading-relaxed">${selectedSlot ? `You'll pay the restaurant by UPI next. They'll have your order ready around ${escapeHtml(formatSlotTime(selectedSlot))}.` : "You'll pay the restaurant by UPI next. They start preparing as soon as your payment lands."}</p>
      </form>
    </div>
  `;

  renderSlotPicker();
  attachCheckoutListeners();
}

function renderSlotPicker() {
  const wrapper = document.getElementById("slot-picker");
  if (!wrapper) return;
  const slots = generateTimeSlots();
  if (slots.length === 0) {
    wrapper.innerHTML = `<p class="text-xs text-muted">No slots left in the next ${MAX_SCHEDULE_LEAD_HOURS} hours — try "Now" instead.</p>`;
    return;
  }
  wrapper.innerHTML = slots
    .map((slot) => {
      const isSelected = selectedSlot && slot.getTime() === selectedSlot.getTime();
      return `
        <button type="button" class="slot-btn rounded-full border-2 px-4 py-2 text-sm font-bold transition-all duration-150 ${isSelected ? "border-accent bg-accent text-white" : "border-line bg-white text-ink hover:border-accent-soft"}" data-time="${slot.getTime()}">
          ${escapeHtml(formatSlotTime(slot))}
        </button>
      `;
    })
    .join("");
}

function attachCheckoutListeners() {
  const asapBtn = document.getElementById("when-asap-btn");
  if (asapBtn) {
    asapBtn.addEventListener("click", () => {
      selectedSlot = null;
      renderCheckout(getCart());
    });
  }

  const scheduleBtn = document.getElementById("when-schedule-btn");
  if (scheduleBtn) {
    scheduleBtn.addEventListener("click", () => {
      if (selectedSlot === null) selectedSlot = generateTimeSlots()[0] || null;
      renderCheckout(getCart());
    });
  }

  document.querySelectorAll(".slot-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedSlot = new Date(Number(btn.dataset.time));
      renderCheckout(getCart());
    });
  });

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

function resetPlaceOrderButton() {
  const payBtn = document.getElementById("pay-btn");
  const cart = getCart();
  if (!payBtn || !cart) return;
  payBtn.disabled = false;
  payBtn.textContent = `Continue to pay — ${formatPrice(getCartTotal(cart))}`;
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
  const studentPhone = document.getElementById("student-phone").value.trim();
  if (!studentName) {
    showError("Please fill in your name.");
    return;
  }
  if (studentPhone.replace(/\D/g, "").length < 10) {
    showError("Please enter a valid phone number.");
    return;
  }

  const payBtn = document.getElementById("pay-btn");
  payBtn.disabled = true;
  payBtn.textContent = "Placing order...";

  const items = Object.values(cart.items).map((line) => ({
    menu_item_id: line.menuItemId,
    quantity: line.quantity,
    size_label: line.sizeLabel,
  }));

  try {
    const response = await fetch(`${API_BASE_URL}/api/orders/create/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurant_slug: cart.restaurantSlug,
        student_name: studentName,
        student_phone_number: studentPhone,
        scheduled_for: selectedSlot ? selectedSlot.toISOString() : null,
        items,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      showError(data.detail || "Could not place your order. Please try again.");
      resetPlaceOrderButton();
      return;
    }
    rememberMyOrder(data.order_code, cart.restaurantName);
    clearCart();
    window.location.href = `order-status.html?code=${encodeURIComponent(data.order_code)}`;
  } catch (err) {
    showError("Could not reach the server. Please try again.");
    console.error(err);
    resetPlaceOrderButton();
  }
}

if (backLink) {
  const cart = getCart();
  backLink.href = cart && cart.restaurantSlug
    ? `restaurant.html?slug=${encodeURIComponent(cart.restaurantSlug)}`
    : "location-select.html";
}

refresh();
