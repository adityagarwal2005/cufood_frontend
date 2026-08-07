const API_BASE_URL = "https://cufood-backend.onrender.com";

const pageContent = document.getElementById("page-content");
let pollTimer = null;

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

function getCodeFromUrl() {
  return new URLSearchParams(window.location.search).get("code");
}

function stateMessage({ icon, message }) {
  return `
    <div class="text-center bg-white border border-line rounded-2xl shadow-sm px-7 py-14">
      <span class="flex items-center justify-center w-14 h-14 rounded-full bg-accent-soft text-accent mx-auto mb-4 p-3.5">${icon}</span>
      <p class="text-muted text-[15px]">${message}</p>
    </div>
  `;
}

function renderLookupForm(errorMessage) {
  pageContent.innerHTML = `
    <div class="bg-white border border-line rounded-2xl shadow-sm p-6 sm:p-7">
      <h1 class="text-xl font-extrabold text-ink mb-1">Check your order</h1>
      <p class="text-sm text-muted mb-5">Enter the 6-character code from your confirmation.</p>
      ${errorMessage ? `<div class="text-sm font-medium text-error bg-error-soft rounded-xl px-4 py-3 mb-4">${escapeHtml(errorMessage)}</div>` : ""}
      <form id="lookup-form" class="flex gap-2">
        <input type="text" id="code-input" maxlength="6" placeholder="ABC123" required
          class="flex-1 rounded-xl border-2 border-line bg-cream px-4 py-3 text-[15px] font-bold tracking-widest uppercase text-ink focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft transition-all duration-150">
        <button type="submit" class="rounded-xl bg-gradient-to-br from-accent to-accent-deep text-white font-bold px-5 py-3 shadow-accent-glow hover:shadow-lg transition-all duration-150">Check</button>
      </form>
    </div>
  `;
  const form = document.getElementById("lookup-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const code = document.getElementById("code-input").value.trim().toUpperCase();
    if (!code) return;
    window.location.href = `order-status.html?code=${encodeURIComponent(code)}`;
  });
}

// Payment now happens before the restaurant ever sees the order, so
// "placed" and "rejected" each split into two messages depending on
// payment_status — everything from "preparing" onward is only reachable
// once payment_status is already "paid" (verified server-side by
// RazorpayWebhookView, not self-reported), so those don't need to check it.
const STATUS_META = {
  preparing: {
    label: "Preparing",
    color: "text-accent-deep",
    icon: ICONS.check,
    message: null,
  },
  ready: {
    label: "Ready for pickup",
    color: "text-accent-deep",
    icon: ICONS.check,
    message: "Go collect it! Show your code at the counter.",
  },
  completed: {
    label: "Completed",
    color: "text-muted",
    icon: ICONS.check,
    message: "Picked up. Enjoy!",
  },
};

function getStatusMeta(order) {
  if (order.status === "placed") {
    if (order.payment_status !== "paid") {
      return {
        label: "Waiting for payment",
        color: "text-accent-deep",
        icon: ICONS.clock,
        message: "The restaurant sees this order as soon as payment is confirmed.",
      };
    }
    return {
      label: "Payment confirmed",
      color: "text-accent-deep",
      icon: ICONS.clock,
      message: "Waiting for the restaurant to accept. This page updates automatically.",
    };
  }
  if (order.status === "rejected") {
    if (order.payment_status === "refunded") {
      return {
        label: "Rejected — refunded",
        color: "text-error",
        icon: ICONS.warning,
        message: "The restaurant couldn't take this order. Your payment has been refunded automatically — it should reflect in a few days depending on your bank.",
      };
    }
    return {
      label: "Rejected",
      color: "text-error",
      icon: ICONS.warning,
      message: "The restaurant couldn't take this order.",
    };
  }
  return STATUS_META[order.status] || STATUS_META.preparing;
}

// Only shown once payment_status is "paid" (see renderOrder) — before
// that, the order isn't really "in the queue" yet from the restaurant's
// side, so a step tracker would be misleading.
const ORDER_STEPS = [
  { key: "placed", label: "Placed", icon: ICONS.check },
  { key: "preparing", label: "Preparing", icon: ICONS.utensils },
  { key: "ready", label: "Ready", icon: ICONS.cart },
  { key: "completed", label: "Picked up", icon: ICONS.check },
];

function currentStepIndex(status) {
  const index = ORDER_STEPS.findIndex((step) => step.key === status);
  return index === -1 ? 0 : index;
}

function renderStepTracker(order) {
  const activeIndex = currentStepIndex(order.status);
  const fillPercent = (activeIndex / (ORDER_STEPS.length - 1)) * 100;

  const stepsHtml = ORDER_STEPS.map((step, i) => {
    const done = i < activeIndex;
    const active = i === activeIndex;
    const circleClass = done
      ? "bg-accent text-white"
      : active
      ? "bg-accent text-white ring-4 ring-accent-soft animate-pulse"
      : "bg-white border-2 border-line text-muted";
    const labelClass = done || active ? "text-ink font-bold" : "text-muted font-medium";
    return `
      <div class="relative z-10 flex flex-col items-center gap-2 flex-1">
        <span class="flex items-center justify-center w-9 h-9 rounded-full transition-all duration-300 ${circleClass}">
          <span class="w-4 h-4">${step.icon}</span>
        </span>
        <span class="text-[11px] text-center ${labelClass}">${escapeHtml(step.label)}</span>
      </div>
    `;
  }).join("");

  return `
    <div class="relative mb-2">
      <div class="absolute top-[18px] left-9 right-9 h-1 bg-line rounded-full"></div>
      <div class="absolute top-[18px] left-9 h-1 bg-accent rounded-full transition-all duration-500" style="width: calc((100% - 4.5rem) * ${fillPercent / 100})"></div>
      <div class="relative flex items-start">${stepsHtml}</div>
    </div>
  `;
}

function formatScheduledBadge(order) {
  if (!order.scheduled_for) return "";
  const slot = new Date(order.scheduled_for);
  const label = slot.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `
    <div class="flex items-center gap-1.5 text-xs font-bold text-white/90 bg-white/15 rounded-full px-3 py-1.5 w-fit mx-auto mt-3">
      <span class="w-3.5 h-3.5">${ICONS.clock}</span>Scheduled for ${escapeHtml(label)}
    </div>
  `;
}

function formatEta(estimatedReadyAt) {
  if (!estimatedReadyAt) return null;
  const eta = new Date(estimatedReadyAt);
  const diffMin = Math.round((eta - new Date()) / 60000);
  if (diffMin <= 0) return "any moment now";
  return `in about ${diffMin} min`;
}

// Only ever called for status "placed" with payment_status !== "paid" (see
// the call site in renderOrder). Payment itself already happened (or was
// attempted) in Razorpay's own Checkout modal on the checkout page — this
// is just "waiting to hear back" plus a way back in if it didn't go
// through, not a place to pay from directly.
function renderPaymentPendingSection(order) {
  return `
    <div class="border-t border-line pt-4 mt-4">
      <div class="flex items-center gap-3 bg-cream-alt rounded-xl p-4 mb-3">
        <span class="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" aria-hidden="true"></span>
        <p class="text-sm text-ink">Confirming your payment of ${escapeHtml(formatPrice(order.total_amount))} — this page updates on its own once it's through.</p>
      </div>
      <button type="button" id="retry-payment-btn" class="w-full rounded-xl border-2 border-line bg-white text-ink font-bold text-sm px-5 py-3 hover:border-accent-soft transition-all duration-150">Didn't finish paying? Try again</button>
    </div>
  `;
}

async function retryPayment(code) {
  const btn = document.getElementById("retry-payment-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Loading...";
  }
  try {
    const response = await fetch(`${API_BASE_URL}/api/orders/${encodeURIComponent(code)}/retry-payment/`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || `Request failed: ${response.status}`);

    if (typeof Razorpay === "undefined") {
      throw new Error("Payment couldn't load. Please check your connection and try again.");
    }
    const checkout = new Razorpay({
      key: data.razorpay_key_id,
      order_id: data.razorpay_order_id,
      name: "CUFood",
      description: `Order from ${data.restaurant_name}`,
      image: `${window.location.origin}/icon-192.png`,
      prefill: { name: data.student_name },
      theme: { color: "#d9531e" },
      handler: () => loadOrder(code),
      modal: {
        ondismiss: () => {
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Didn't finish paying? Try again";
          }
        },
      },
    });
    checkout.open();
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Didn't finish paying? Try again";
    }
    console.error(err);
  }
}

function renderOrder(order) {
  const meta = getStatusMeta(order);
  const eta = order.status === "preparing" ? formatEta(order.estimated_ready_at) : null;
  // The tracker only makes sense once the order is actually in the
  // restaurant's queue — before payment_status is "paid" it's not
  // visible to them yet at all (see MyOrdersView), and "rejected" is a
  // terminal off-ramp the linear tracker can't represent.
  const showTracker = order.payment_status === "paid" && order.status !== "rejected";

  const itemsHtml = order.items
    .map(
      (item) => `
        <div class="flex items-center justify-between gap-3 py-2.5 border-b border-line last:border-b-0">
          <span class="text-sm text-ink">${item.quantity}x ${escapeHtml(item.name)}${item.size_label ? ` <span class="text-muted">(${escapeHtml(item.size_label)})</span>` : ""}</span>
          <span class="text-sm font-bold text-ink">${escapeHtml(formatPrice(item.subtotal))}</span>
        </div>
      `
    )
    .join("");

  pageContent.innerHTML = `
    <div class="bg-white border border-line rounded-2xl shadow-lg overflow-hidden mb-6">
      <div class="bg-gradient-to-br from-accent to-accent-deep text-white p-6 sm:p-7 text-center">
        <p class="text-xs font-bold uppercase tracking-widest text-white/80 mb-2">Pickup code</p>
        <p class="text-4xl font-extrabold tracking-[0.3em]">${escapeHtml(order.order_code)}</p>
        ${formatScheduledBadge(order)}
      </div>
      <div class="p-6 sm:p-7">
        ${
          showTracker
            ? `
              ${renderStepTracker(order)}
              <div class="flex items-center gap-2 mb-4">
                <p class="text-base font-extrabold text-ink">${meta.label}</p>
                ${eta ? `<span class="text-xs font-bold text-accent-deep bg-accent-soft rounded-full px-2.5 py-1">Ready ${eta}</span>` : ""}
              </div>
            `
            : `
              <div class="flex items-center gap-3 mb-4">
                <span class="flex items-center justify-center w-10 h-10 rounded-full bg-accent-soft ${meta.color} p-2.5 flex-shrink-0">${meta.icon}</span>
                <div>
                  <p class="text-base font-extrabold text-ink">${meta.label}</p>
                  ${eta ? `<p class="text-sm text-muted">Ready ${eta}</p>` : ""}
                </div>
              </div>
            `
        }
        ${meta.message ? `<p class="text-sm text-muted mb-4">${escapeHtml(meta.message)}</p>` : ""}
        <div class="border-t border-line pt-4">
          <p class="text-xs font-bold uppercase tracking-widest text-muted mb-2">${escapeHtml(order.restaurant_name)}</p>
          <div>${itemsHtml}</div>
          <div class="flex items-center justify-between pt-3 mt-1 border-t border-line">
            <span class="text-sm font-bold text-muted uppercase tracking-wide">Total</span>
            <span class="text-lg font-extrabold text-ink">${escapeHtml(formatPrice(order.total_amount))}</span>
          </div>
        </div>
        ${order.status === "placed" && order.payment_status !== "paid" ? renderPaymentPendingSection(order) : ""}
        <div class="pt-4 mt-2 border-t border-line text-xs text-muted">
          ${escapeHtml(order.student_name)}
        </div>
      </div>
    </div>
    <a href="restaurant.html?slug=${encodeURIComponent(order.restaurant_slug)}" class="block text-center text-accent-deep font-bold hover:underline">Order again from ${escapeHtml(order.restaurant_name)}</a>
  `;

  const retryPaymentBtn = document.getElementById("retry-payment-btn");
  if (retryPaymentBtn) {
    retryPaymentBtn.addEventListener("click", () => retryPayment(order.order_code));
  }
}

async function loadOrder(code) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/orders/${encodeURIComponent(code)}/`);
    if (response.status === 404) {
      renderLookupForm(`No order found for code "${code}".`);
      return;
    }
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const order = await response.json();
    renderOrder(order);

    // Keep polling while the order is still moving through its lifecycle,
    // so a student can leave this page open and watch it update live.
    // Faster while payment is still pending — the webhook usually confirms
    // within a couple of seconds, so a short poll here means the "waiting"
    // spinner doesn't sit there for up to 8s after payment actually landed.
    const activeStatuses = ["placed", "preparing", "ready"];
    clearTimeout(pollTimer);
    if (activeStatuses.includes(order.status)) {
      const interval = order.payment_status === "pending" ? 3000 : 8000;
      pollTimer = setTimeout(() => loadOrder(code), interval);
    }
  } catch (err) {
    pageContent.innerHTML = stateMessage({
      icon: ICONS.warning,
      message: "Could not load your order. Is the backend running?",
    });
    console.error(err);
  }
}

const code = getCodeFromUrl();
if (code) {
  loadOrder(code.toUpperCase());
} else {
  renderLookupForm();
}
