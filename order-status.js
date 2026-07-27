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

const STATUS_META = {
  placed: {
    label: "Waiting for confirmation",
    color: "text-accent-deep",
    icon: ICONS.clock,
    message: "The restaurant hasn't responded yet. This page updates automatically.",
  },
  accepted: {
    label: "Accepted — pay to confirm",
    color: "text-accent-deep",
    icon: ICONS.check,
    message: null,
  },
  preparing: {
    label: "Preparing",
    color: "text-accent-deep",
    icon: ICONS.check,
    message: null,
  },
  rejected: {
    label: "Rejected",
    color: "text-error",
    icon: ICONS.warning,
    message: "The restaurant couldn't take this order. Nothing was charged.",
  },
  ready: {
    label: "Ready for pickup",
    color: "text-accent-deep",
    icon: ICONS.check,
    message: "Go collect it! Show your code + UID at the counter.",
  },
  completed: {
    label: "Completed",
    color: "text-muted",
    icon: ICONS.check,
    message: "Picked up. Enjoy!",
  },
};

function formatEta(estimatedReadyAt) {
  if (!estimatedReadyAt) return null;
  const eta = new Date(estimatedReadyAt);
  const diffMin = Math.round((eta - new Date()) / 60000);
  if (diffMin <= 0) return "any moment now";
  return `in about ${diffMin} min`;
}

function buildUpiLink(order) {
  const params = new URLSearchParams({
    pa: order.restaurant_upi_id,
    pn: order.restaurant_name,
    am: String(order.total_amount),
    cu: "INR",
    tn: `CUFood order ${order.order_code}`,
  });
  return `upi://pay?${params.toString()}`;
}

function renderPaymentSection(order) {
  if (order.payment_status === "claimed") {
    return `
      <div class="border-t border-line pt-4 mt-4">
        <div class="flex items-center gap-3 bg-accent-soft rounded-xl px-4 py-3.5">
          <span class="w-5 h-5 text-accent-deep flex-shrink-0">${ICONS.clock}</span>
          <p class="text-sm font-semibold text-accent-deep">You said you've paid — waiting for the restaurant to confirm.</p>
        </div>
      </div>
    `;
  }

  if (!order.restaurant_upi_id) {
    return `
      <div class="border-t border-line pt-4 mt-4">
        <p class="text-sm text-muted">This restaurant hasn't set up UPI payments yet — please pay at the counter when you arrive.</p>
      </div>
    `;
  }

  return `
    <div class="border-t border-line pt-4 mt-4">
      <p class="text-xs font-bold uppercase tracking-widest text-muted mb-2">Pay to confirm your order</p>
      <div class="bg-cream-alt rounded-xl p-4 mb-3">
        <p class="text-xs text-muted mb-1">Pay via UPI to</p>
        <p class="text-base font-extrabold text-ink break-all">${escapeHtml(order.restaurant_upi_id)}</p>
        <p class="text-sm font-bold text-accent-deep mt-1">${escapeHtml(formatPrice(order.total_amount))}</p>
      </div>
      <a href="${buildUpiLink(order)}" class="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-accent to-accent-deep text-white font-bold text-base px-5 py-3.5 shadow-accent-glow hover:shadow-lg transition-all duration-150 mb-2.5">Open UPI app to pay</a>
      <button type="button" id="ive-paid-btn" class="w-full rounded-xl border-2 border-line bg-white text-ink font-bold text-sm px-5 py-3 hover:border-accent-soft transition-all duration-150">I've paid</button>
      <p class="text-xs text-muted text-center mt-2">Only tap "I've paid" after the money has actually left your account.</p>
    </div>
  `;
}

function renderOrder(order) {
  const meta = STATUS_META[order.status] || STATUS_META.placed;
  const eta = order.status === "preparing" ? formatEta(order.estimated_ready_at) : null;

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
      </div>
      <div class="p-6 sm:p-7">
        <div class="flex items-center gap-3 mb-4">
          <span class="flex items-center justify-center w-10 h-10 rounded-full bg-accent-soft ${meta.color} p-2.5 flex-shrink-0">${meta.icon}</span>
          <div>
            <p class="text-base font-extrabold text-ink">${meta.label}</p>
            ${eta ? `<p class="text-sm text-muted">Ready ${eta}</p>` : ""}
          </div>
        </div>
        ${meta.message ? `<p class="text-sm text-muted mb-4">${escapeHtml(meta.message)}</p>` : ""}
        <div class="border-t border-line pt-4">
          <p class="text-xs font-bold uppercase tracking-widest text-muted mb-2">${escapeHtml(order.restaurant_name)}</p>
          <div>${itemsHtml}</div>
          <div class="flex items-center justify-between pt-3 mt-1 border-t border-line">
            <span class="text-sm font-bold text-muted uppercase tracking-wide">Total</span>
            <span class="text-lg font-extrabold text-ink">${escapeHtml(formatPrice(order.total_amount))}</span>
          </div>
        </div>
        ${order.status === "accepted" ? renderPaymentSection(order) : ""}
        <div class="pt-4 mt-2 border-t border-line text-xs text-muted">
          ${escapeHtml(order.student_name)} · ${escapeHtml(order.student_uid)}
        </div>
      </div>
    </div>
    <a href="restaurant.html?slug=${encodeURIComponent(order.restaurant_slug)}" class="block text-center text-accent-deep font-bold hover:underline">Order again from ${escapeHtml(order.restaurant_name)}</a>
  `;

  const ivePaidBtn = document.getElementById("ive-paid-btn");
  if (ivePaidBtn) {
    ivePaidBtn.addEventListener("click", () => claimPayment(order.order_code));
  }
}

async function claimPayment(code) {
  const btn = document.getElementById("ive-paid-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Confirming...";
  }
  try {
    const response = await fetch(`${API_BASE_URL}/api/orders/${encodeURIComponent(code)}/claim-payment/`, {
      method: "PATCH",
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    loadOrder(code);
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "I've paid";
    }
    console.error(err);
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
    const activeStatuses = ["placed", "accepted", "preparing", "ready"];
    clearTimeout(pollTimer);
    if (activeStatuses.includes(order.status)) {
      pollTimer = setTimeout(() => loadOrder(code), 8000);
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
