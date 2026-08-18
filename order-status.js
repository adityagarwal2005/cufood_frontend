const API_BASE_URL = "https://cufood-backend-832534179056.asia-south1.run.app";
// Safe to hardcode — this is the *public* half of the VAPID keypair (see
// backend settings.py); it's meant to be embedded in client code, only the
// private key is a secret.
const VAPID_PUBLIC_KEY = "BOsXYYIQK2rY1nET_I-NXr-A6ts9_WDH9kEjZYBUC7mGhcfLqRLy3jbXtD3X72WZU1gaAqI_yOz8pO_6FNhhHqo";

const pageContent = document.getElementById("page-content");
let pollTimer = null;

// Standard boilerplate for turning a VAPID public key (base64url) into the
// Uint8Array format PushManager.subscribe expects.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

// Only shown as a fallback for a student who lands on this page without
// having gone through checkout.js's automatic subscribeToPush() first (a
// reopened link, a different device/browser, checkout-time permission was
// skipped, etc.) — if permission is already "granted", renderOrder()
// below subscribes silently instead of showing this at all, and if it's
// "denied" there's nothing a button can do about that either.
function canSubscribeToPush() {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined" &&
    Notification.permission === "default"
  );
}

// Called automatically (no button, no gesture needed — subscribe() itself
// doesn't require one once permission is already granted) whenever a
// student with notifications already enabled from a previous order lands
// on a fresh one. Same subscribe logic as checkout.js's subscribeToPush(),
// just triggered on page load instead of the Pay click.
async function autoSubscribeIfAlreadyGranted(code) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  await enablePushNotifications(code);
}

// Best-effort, silent on anything unsupported/denied — this is a bonus on
// top of the polling this page already does, never something the page
// depends on working. iOS only supports this for a PWA added to the home
// screen (not a regular Safari tab), and plenty of browsers/contexts won't
// support it at all; all of those just quietly no-op here.
async function enablePushNotifications(code) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  try {
    const registration = await navigator.serviceWorker.register("sw.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

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
    return true;
  } catch (err) {
    console.error(err);
    return false;
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

function getCodeFromUrl() {
  return new URLSearchParams(window.location.search).get("code");
}

function stateMessage({ icon, message }) {
  return `
    <div class="state-shell">
      <span class="state-icon">${icon}</span>
      <p class="text-muted text-base">${message}</p>
    </div>
  `;
}

function renderLookupForm(errorMessage) {
  pageContent.innerHTML = `
    <h1 class="text-3xl sm:text-4xl font-black tracking-tightest text-ink mb-2">Check your order</h1>
    <p class="text-sm text-muted mb-8">Enter the 6-character code from your confirmation.</p>
    ${errorMessage ? `<div class="text-sm font-medium text-error bg-error-soft rounded-xl px-4 py-3 mb-5">${escapeHtml(errorMessage)}</div>` : ""}
    <form id="lookup-form" class="flex gap-2">
      <input type="text" id="code-input" maxlength="6" placeholder="ABC123" required
        class="field flex-1 text-lg font-bold tracking-widest uppercase text-center">
      <button type="submit" class="btn-primary">Check</button>
    </form>
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
    if (order.payment_status === "expired") {
      return {
        label: "Order expired",
        color: "text-muted",
        icon: ICONS.warning,
        message: "This checkout wasn't completed in time and has expired — no payment was taken. Place a new order whenever you're ready.",
      };
    }
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
        message: "The restaurant couldn't take this order. Your payment has been refunded automatically — it typically takes 5–7 business days to reflect, depending on your bank.",
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

// The dominant element on this page — everything else (restaurant name,
// items, total) is supporting detail once an order is actually in
// progress, so the tracker gets the most vertical space and the largest
// type on the screen, not a component squeezed inside a card with them.
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
      : "bg-cream-alt border-2 border-line text-muted";
    const labelClass = done || active ? "text-ink font-bold" : "text-muted font-medium";
    return `
      <div class="relative z-10 flex flex-col items-center gap-2.5 flex-1">
        <span class="flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full transition-all duration-150 ${circleClass}">
          <span class="w-5 h-5 sm:w-6 sm:h-6">${step.icon}</span>
        </span>
        <span class="text-xs sm:text-sm text-center ${labelClass}">${escapeHtml(step.label)}</span>
      </div>
    `;
  }).join("");

  return `
    <div class="relative mb-6">
      <div class="absolute top-6 sm:top-7 left-9 right-9 h-1 bg-line rounded-full"></div>
      <div class="absolute top-6 sm:top-7 left-9 h-1 bg-accent rounded-full transition-all duration-200" style="width: calc((100% - 4.5rem) * ${fillPercent / 100})"></div>
      <div class="relative flex items-start">${stepsHtml}</div>
    </div>
  `;
}

function formatScheduledBadgeInk(order) {
  if (!order.scheduled_for) return "";
  const slot = new Date(order.scheduled_for);
  const label = slot.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `
    <div class="badge-muted flex-shrink-0">
      <span class="w-3.5 h-3.5">${ICONS.clock}</span>${escapeHtml(label)}
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
      <button type="button" id="retry-payment-btn" class="w-full rounded-xl border-2 border-line bg-cream-alt text-ink font-bold text-sm px-5 py-3 hover:border-accent-soft transition-all duration-150">Didn't finish paying? Try again</button>
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
    // Most likely to happen here: the order expired in the ~60 minutes
    // between the page loading and the student clicking this button.
    // Re-fetching (rather than just resetting the button) picks up that
    // real state and renders the actual "expired" message instead of
    // silently handing back a retry button that will just fail again.
    console.error(err);
    loadOrder(code);
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
        <div class="flex items-center justify-between gap-3 py-2 border-b border-line last:border-b-0">
          <span class="text-sm text-ink">${item.quantity}x ${escapeHtml(item.name)}${item.size_label ? ` <span class="text-muted">(${escapeHtml(item.size_label)})</span>` : ""}</span>
          <span class="text-sm font-bold text-muted">${escapeHtml(formatPrice(item.subtotal))}</span>
        </div>
      `
    )
    .join("");

  pageContent.innerHTML = `
    <div class="flex items-center justify-between gap-4 mb-8">
      <div>
        <p class="text-xs font-bold uppercase tracking-widest text-muted mb-1">Pickup code</p>
        <p class="text-3xl sm:text-4xl font-black tracking-[0.2em] text-ink">${escapeHtml(order.order_code)}</p>
      </div>
      ${formatScheduledBadgeInk(order)}
    </div>

    ${
      showTracker
        ? `
          ${renderStepTracker(order)}
          <div class="flex items-center gap-2 mb-1">
            <p class="text-xl sm:text-2xl font-black tracking-tightest text-ink">${meta.label}</p>
            ${eta ? `<span class="badge-accent">Ready ${eta}</span>` : ""}
          </div>
        `
        : `
          <div class="flex items-center gap-3 mb-1">
            <span class="flex items-center justify-center w-11 h-11 rounded-full bg-accent-soft ${meta.color} p-2.5 flex-shrink-0">${meta.icon}</span>
            <div>
              <p class="text-xl sm:text-2xl font-black tracking-tightest text-ink">${meta.label}</p>
              ${eta ? `<p class="text-sm text-muted">Ready ${eta}</p>` : ""}
            </div>
          </div>
        `
    }
    ${meta.message ? `<p class="text-sm text-muted mb-2">${escapeHtml(meta.message)}</p>` : ""}
    ${
      canSubscribeToPush() && ["placed", "preparing", "ready"].includes(order.status)
        ? `<button type="button" id="enable-push-btn" class="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink bg-cream-alt rounded-full px-3.5 py-2 hover:bg-line transition-colors duration-150 mb-2">
             <span class="w-3.5 h-3.5">${ICONS.bell}</span>Notify me on updates
           </button>`
        : ""
    }
    ${order.status === "placed" && order.payment_status === "pending" ? renderPaymentPendingSection(order) : ""}

    <div class="border-t border-line mt-8 pt-6">
      <p class="text-xs font-bold uppercase tracking-widest text-muted mb-2">${escapeHtml(order.restaurant_name)}</p>
      <div>${itemsHtml}</div>
      <div class="flex items-center justify-between pt-3 mt-1 border-t border-line">
        <span class="text-sm font-bold text-muted uppercase tracking-wide">Total</span>
        <span class="text-lg font-black text-ink">${escapeHtml(formatPrice(order.total_amount))}</span>
      </div>
      <p class="text-xs text-muted mt-4">${escapeHtml(order.student_name)}</p>
    </div>

    <a href="restaurant.html?slug=${encodeURIComponent(order.restaurant_slug)}" class="block text-center text-accent-deep font-bold hover:underline mt-8">Order again from ${escapeHtml(order.restaurant_name)}</a>
  `;

  const retryPaymentBtn = document.getElementById("retry-payment-btn");
  if (retryPaymentBtn) {
    retryPaymentBtn.addEventListener("click", () => retryPayment(order.order_code));
  }

  const pushBtn = document.getElementById("enable-push-btn");
  if (pushBtn) {
    pushBtn.addEventListener("click", async () => {
      pushBtn.disabled = true;
      const original = pushBtn.innerHTML;
      pushBtn.innerHTML = `<span class="w-3.5 h-3.5">${ICONS.bell}</span>Enabling…`;
      const ok = await enablePushNotifications(order.order_code);
      if (ok) {
        pushBtn.innerHTML = `<span class="w-3.5 h-3.5">${ICONS.check}</span>Notifications on`;
      } else {
        pushBtn.disabled = false;
        pushBtn.innerHTML = original;
      }
    });
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
    // An expired checkout is a dead end — nothing is going to change on
    // its own from here, so there's nothing left to poll for.
    if (activeStatuses.includes(order.status) && order.payment_status !== "expired") {
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
  // Once, not on every poll — renderOrder() re-runs every few seconds
  // while the order's active, and re-subscribing that often would just
  // hammer the subscribe endpoint with no benefit.
  autoSubscribeIfAlreadyGranted(code.toUpperCase());
} else {
  renderLookupForm();
}
