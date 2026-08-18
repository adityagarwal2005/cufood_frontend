const API_BASE_URL = "https://cufood-backend-832534179056.asia-south1.run.app";
// Safe to hardcode — this is the *public* half of the VAPID keypair (see
// backend settings.py); only the private key is a secret.
const VAPID_PUBLIC_KEY = "BOsXYYIQK2rY1nET_I-NXr-A6ts9_WDH9kEjZYBUC7mGhcfLqRLy3jbXtD3X72WZU1gaAqI_yOz8pO_6FNhhHqo";
// Kept in sync with Order.PLATFORM_FEE on the backend — that's the value
// actually charged (see CreateOrderView), this is purely for showing the
// right numbers here before that response comes back.
const PLATFORM_FEE = 1.5;
function getGrandTotal(cart) {
  return getCartTotal(cart) + PLATFORM_FEE;
}

const pageContent = document.getElementById("page-content");
const backLink = document.getElementById("back-link");

// Standard boilerplate for turning a VAPID public key (base64url) into the
// Uint8Array format PushManager.subscribe expects.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

// Fired from inside the "Pay" click handler (see handleCheckoutSubmit) so
// that Notification.requestPermission() — which browsers only allow in
// direct response to a user gesture — has one to ride on. Without this,
// a student would have to separately remember to tap "Notify me" on the
// order-status page for every single order, since there's no account to
// remember the choice against (see order-status.js's fallback button,
// still there for anyone who lands on that page without going through
// checkout first — a reopened link, a different device, etc.).
// Best-effort and silent: any failure/unsupported-browser/denied-permission
// just means the student falls back to this page's normal polling.
async function subscribeToPush(code) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (typeof Notification === "undefined" || Notification.permission === "denied") return;
  try {
    const registration = await navigator.serviceWorker.register("sw.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    await fetch(`${API_BASE_URL}/api/orders/${encodeURIComponent(code)}/subscribe/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
  } catch (err) {
    console.error(err);
  }
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
    <div class="state-shell">
      <span class="state-icon">${ICONS.cart}</span>
      <p class="text-muted text-base mb-4">Your cart is empty.</p>
      <a href="${escapeHtml(goBackHref)}" class="text-accent-deep font-bold hover:underline">${goBackLabel}</a>
    </div>
  `;
}

// Quiet by design: quantity editing is a secondary action here, so it
// stays small and muted rather than competing with the total/pay button
// for attention. No card, no shadow — a border-b rule between rows is
// all the separation a flat list needs.
function renderCartLine(key, line) {
  return `
    <div class="flex items-start justify-between gap-4 py-4 border-b border-line last:border-b-0">
      <div class="min-w-0">
        <p class="text-base font-bold text-ink">${escapeHtml(line.name)}${line.sizeLabel ? ` <span class="text-muted font-medium">(${escapeHtml(line.sizeLabel)})</span>` : ""}</p>
        <p class="text-xs text-muted mt-0.5">${escapeHtml(formatPrice(line.unitPrice))} each</p>
      </div>
      <div class="flex items-center gap-3 flex-shrink-0">
        <div class="inline-flex items-center gap-1 bg-cream-alt rounded-full pl-1 pr-1 py-1">
          <button type="button" class="cart-line-remove w-8 h-8 flex items-center justify-center rounded-full hover:bg-cream-alt transition-colors duration-150" data-key="${escapeHtml(key)}">
            <span class="w-3 h-3 text-muted">${ICONS.minus}</span>
          </button>
          <span class="text-sm font-bold min-w-[1rem] text-center">${line.quantity}</span>
          <button type="button" class="cart-line-add w-8 h-8 flex items-center justify-center rounded-full hover:bg-cream-alt transition-colors duration-150" data-key="${escapeHtml(key)}">
            <span class="w-3 h-3 text-muted">${ICONS.plus}</span>
          </button>
        </div>
        <p class="text-sm font-bold text-muted w-14 text-right">${escapeHtml(formatPrice(line.unitPrice * line.quantity))}</p>
      </div>
    </div>
  `;
}

function renderCheckout(cart) {
  const lines = Object.entries(cart.items);
  const subtotal = getCartTotal(cart);
  const grandTotal = subtotal + PLATFORM_FEE;

  pageContent.innerHTML = `
    <p class="text-xs font-bold uppercase tracking-widest text-muted mb-2">From ${escapeHtml(cart.restaurantName)}</p>
    <div class="flex items-end justify-between gap-4 pb-6 mb-6 border-b-2 border-ink">
      <h1 class="text-2xl sm:text-3xl font-black tracking-tightest text-ink">Your order</h1>
      <p class="text-3xl sm:text-4xl font-black tracking-tightest text-ink tabular-nums">${escapeHtml(formatPrice(grandTotal))}</p>
    </div>

    <div id="error-banner" class="hidden text-sm font-medium text-error bg-error-soft rounded-xl px-4 py-3 mb-5"></div>

    <div id="cart-lines" class="mb-2">${lines.map(([key, line]) => renderCartLine(key, line)).join("")}</div>
    <div class="flex items-center justify-between py-2 text-sm text-muted">
      <span>Platform fee</span>
      <span>${escapeHtml(formatPrice(PLATFORM_FEE))}</span>
    </div>
    <div class="flex items-center justify-between py-3 mb-8 border-t border-ink font-bold text-ink">
      <span>Total</span>
      <span>${escapeHtml(formatPrice(grandTotal))}</span>
    </div>

    <div class="mb-8">
      <h2 class="text-xs font-bold uppercase tracking-widest text-muted mb-3">When?</h2>
      <div class="flex gap-2">
        <button type="button" id="when-asap-btn" class="flex-1 rounded-xl border-2 px-4 py-3 text-sm font-bold text-left transition-all duration-150 ${selectedSlot === null ? "border-ink bg-accent text-white" : "border-line bg-cream-alt text-ink hover:border-ink"}">
          Now
          <span class="block text-xs font-medium ${selectedSlot === null ? "text-white/70" : "text-muted"} mt-0.5">Cooked right away</span>
        </button>
        <button type="button" id="when-schedule-btn" class="flex-1 rounded-xl border-2 px-4 py-3 text-sm font-bold text-left transition-all duration-150 ${selectedSlot !== null ? "border-ink bg-accent text-white" : "border-line bg-cream-alt text-ink hover:border-ink"}">
          Schedule
          <span class="block text-xs font-medium ${selectedSlot !== null ? "text-white/70" : "text-muted"} mt-0.5">${selectedSlot ? `Pickup ~${escapeHtml(formatSlotTime(selectedSlot))}` : "Pick a time"}</span>
        </button>
      </div>
      <div id="slot-picker" class="${selectedSlot !== null ? "flex" : "hidden"} flex-wrap gap-2 pt-4"></div>
    </div>

    <p class="text-xs text-muted mb-3">Ordering as <span class="font-bold text-ink">${escapeHtml(getStudentUsername() || "")}</span></p>

    <button type="button" id="pay-btn" class="btn-primary w-full text-base py-4">
      Pay ${escapeHtml(formatPrice(grandTotal))}
    </button>
    <p class="text-xs text-muted text-center leading-relaxed mt-3">${selectedSlot ? `You'll pay securely next. They'll have your order ready around ${escapeHtml(formatSlotTime(selectedSlot))}.` : "You'll pay securely next. The restaurant starts as soon as payment is confirmed."}</p>
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
        <button type="button" class="slot-btn rounded-full border-2 px-4 py-2 text-sm font-bold transition-all duration-150 ${isSelected ? "border-ink bg-accent text-white" : "border-line bg-cream-alt text-ink hover:border-ink"}" data-time="${slot.getTime()}">
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

  const payBtn = document.getElementById("pay-btn");
  if (payBtn) payBtn.addEventListener("click", handlePlaceOrder);
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
  payBtn.textContent = `Pay ${formatPrice(getGrandTotal(cart))}`;
}

async function handlePlaceOrder() {
  hideError();

  const cart = getCart();
  if (!cart || getCartItemCount(cart) === 0) {
    refresh();
    return;
  }

  const payBtn = document.getElementById("pay-btn");
  payBtn.disabled = true;
  payBtn.textContent = "Placing order…";

  const items = Object.values(cart.items).map((line) => ({
    menu_item_id: line.menuItemId,
    quantity: line.quantity,
    size_label: line.sizeLabel,
  }));

  try {
    const response = await fetch(`${API_BASE_URL}/api/orders/create/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...studentAuthHeaders() },
      body: JSON.stringify({
        restaurant_slug: cart.restaurantSlug,
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
    // The order exists now (with a pickup code) but isn't paid for yet —
    // clearing the cart here (not after payment) matches that: this cart's
    // contents have already become this specific order, so there's
    // nothing left for the checkout page to show if the student backs out
    // of paying and returns. Retrying payment for THIS order happens from
    // order-status.html, not by rebuilding a cart.
    clearCart();
    // Fire-and-forget — never block/delay opening Checkout on this, and
    // never let a permission-prompt hiccup fail the actual payment flow.
    subscribeToPush(data.order_code);
    openRazorpayCheckout({
      orderCode: data.order_code,
      razorpayOrderId: data.razorpay_order_id,
      razorpayKeyId: data.razorpay_key_id,
      restaurantName: cart.restaurantName,
    });
  } catch (err) {
    showError("Could not reach the server. Please try again.");
    console.error(err);
    resetPlaceOrderButton();
  }
}

// Opens Razorpay's own Checkout modal — payment itself happens entirely
// inside it, not on this page. Both branches below (paid or dismissed
// without paying) just move on to order-status.html; that page polls the
// backend for the real, webhook-confirmed state rather than trusting
// anything from this modal directly, since a client-side "success"
// callback is exactly the kind of self-report this whole flow exists to
// not rely on.
function openRazorpayCheckout({ orderCode, razorpayOrderId, razorpayKeyId, restaurantName }) {
  const goToStatus = () => {
    window.location.href = `order-status.html?code=${encodeURIComponent(orderCode)}`;
  };

  if (typeof Razorpay === "undefined") {
    // Payment couldn't even start — order-status.html's retry-payment
    // button (see order-status.js) gives the student another way in.
    goToStatus();
    return;
  }

  const checkout = new Razorpay({
    key: razorpayKeyId,
    order_id: razorpayOrderId,
    name: "CUFood",
    description: `Order from ${restaurantName}`,
    image: `${window.location.origin}/icon-192.png`,
    // No name/contact prefill anymore — Razorpay collects whatever's tied
    // to however the student actually pays (their own UPI app/card), which
    // is the real, working contact info, unlike a typed-in phone number.
    prefill: { name: getStudentUsername() || "" },
    theme: { color: "#d9531e" },
    handler: goToStatus,
    modal: { ondismiss: goToStatus },
  });
  checkout.on("payment.failed", goToStatus);
  checkout.open();
}

if (backLink) {
  const cart = getCart();
  backLink.href = cart && cart.restaurantSlug
    ? `restaurant.html?slug=${encodeURIComponent(cart.restaurantSlug)}`
    : "location-select.html";
}

if (!isStudentLoggedIn()) {
  window.location.href = `student-login.html?next=${encodeURIComponent(window.location.href)}`;
} else {
  refresh();
}
