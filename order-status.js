const API_BASE_URL = "https://cufood-backend.onrender.com";

const pageContent = document.getElementById("page-content");
let pollTimer = null;
// Survives the periodic re-render triggered by polling (see loadOrder),
// so opening the QR to scan doesn't get silently closed mid-scan.
let qrVisible = false;
// Set once the student has actually engaged with a payment method (opened
// the UPI link or revealed the QR) — until then "I've paid" stays disabled,
// so it can't be tapped as a reflex without ever attempting to pay. Not a
// real verification (nothing client-side can be, without a payment
// gateway), just friction against the most casual false claims. Survives
// the 8s poll re-render like qrVisible does, for the same reason.
let paymentAttempted = false;

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Falls back to a hidden textarea + execCommand for browsers/contexts where
// navigator.clipboard isn't available (e.g. some in-app UPI/WhatsApp webviews).
async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      // fall through to the execCommand fallback below
    }
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    return true;
  } catch (err) {
    return false;
  }
}

function wireCopyButton(btn, getText) {
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const ok = await copyToClipboard(getText());
    const original = btn.innerHTML;
    btn.innerHTML = `<span class="w-4 h-4 pointer-events-none">${ICONS.check}</span>`;
    btn.classList.toggle("text-accent-deep", ok);
    setTimeout(() => {
      btn.innerHTML = original;
      btn.classList.remove("text-accent-deep");
    }, 1500);
  });
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
// once payment_status is already "claimed", so those don't need to check it.
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
    if (order.payment_status !== "claimed") {
      return {
        label: "Pay to confirm your order",
        color: "text-accent-deep",
        icon: ICONS.clock,
        message: "The restaurant starts as soon as your payment is in.",
      };
    }
    return {
      label: "Payment received",
      color: "text-accent-deep",
      icon: ICONS.clock,
      message: "Waiting for the restaurant to accept. This page updates automatically.",
    };
  }
  if (order.status === "rejected") {
    if (order.payment_status === "claimed") {
      return {
        label: "Rejected — refund on the way",
        color: "text-error",
        icon: ICONS.warning,
        message: "The restaurant couldn't take this order. They'll refund you via UPI shortly.",
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

// Only shown once payment_status is "claimed" (see renderOrder) — before
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

// Some UPI apps show extra caution on deep-link payments (the "Open UPI
// app to pay" button above) to a payee the student hasn't paid before,
// and suggest scanning a QR code instead — but give no way to actually
// get one. This renders the identical payment request as a real,
// scannable QR (via the vendored qrcode-lib.js) so that fallback exists.
function buildQrSvg(uri) {
  const qr = qrcode(0, "M");
  qr.addData(uri);
  qr.make();
  return qr.createSvgTag(4, 8);
}

// Only ever called for status "placed" with payment_status !== "claimed"
// (see the call site in renderOrder) — the payment prompt is meaningless
// once payment's already been claimed.
function renderPaymentSection(order) {
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
        <div class="flex items-center gap-2">
          <p class="text-base font-extrabold text-ink break-all">${escapeHtml(order.restaurant_upi_id)}</p>
          <button type="button" id="copy-upi-btn" data-upi-id="${escapeHtml(order.restaurant_upi_id)}" class="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-muted hover:text-accent-deep hover:bg-white transition-colors duration-150" aria-label="Copy UPI ID">
            <span class="w-4 h-4 pointer-events-none">${ICONS.copy}</span>
          </button>
        </div>
        <p class="text-sm font-bold text-accent-deep mt-1">${escapeHtml(formatPrice(order.total_amount))}</p>
      </div>
      <a href="${buildUpiLink(order)}" id="open-upi-link" class="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-accent to-accent-deep text-white font-bold text-base px-5 py-3.5 shadow-accent-glow hover:shadow-lg transition-all duration-150 mb-2.5">Open UPI app to pay</a>
      <button type="button" id="toggle-qr-btn" class="w-full text-center text-xs font-bold text-accent-deep hover:underline mb-3">${qrVisible ? "Hide QR code" : "If that shows a warning, scan a QR code instead"}</button>
      <div id="qr-wrapper" class="${qrVisible ? "flex" : "hidden"} flex-col items-center gap-2 mb-3" style="${qrVisible ? "display:flex" : ""}">
        <div class="w-40 h-40 [&_svg]:w-full [&_svg]:h-full">${buildQrSvg(buildUpiLink(order))}</div>
        <p class="text-xs text-muted text-center">Scan with any UPI app</p>
      </div>
      <button type="button" id="ive-paid-btn" ${paymentAttempted ? "" : "disabled"} class="w-full rounded-xl border-2 border-line bg-white text-ink font-bold text-sm px-5 py-3 hover:border-accent-soft transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-line">I've paid</button>
      <p id="ive-paid-hint" class="text-xs text-muted text-center mt-2">${paymentAttempted ? "Only confirm after the money has actually left your account." : "Open the UPI app or scan the QR above first — this unlocks once you have."}</p>
    </div>
  `;
}

function renderOrder(order) {
  const meta = getStatusMeta(order);
  const eta = order.status === "preparing" ? formatEta(order.estimated_ready_at) : null;
  // The tracker only makes sense once the order is actually in the
  // restaurant's queue — before payment_status is "claimed" it's not
  // visible to them yet at all (see MyOrdersView), and "rejected" is a
  // terminal off-ramp the linear tracker can't represent.
  const showTracker = order.payment_status === "claimed" && order.status !== "rejected";

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
        ${order.status === "placed" && order.payment_status !== "claimed" ? renderPaymentSection(order) : ""}
        <div class="pt-4 mt-2 border-t border-line text-xs text-muted">
          ${escapeHtml(order.student_name)}
        </div>
      </div>
    </div>
    <a href="restaurant.html?slug=${encodeURIComponent(order.restaurant_slug)}" class="block text-center text-accent-deep font-bold hover:underline">Order again from ${escapeHtml(order.restaurant_name)}</a>
  `;

  const ivePaidBtn = document.getElementById("ive-paid-btn");
  if (ivePaidBtn) {
    ivePaidBtn.addEventListener("click", () => {
      if (
        !window.confirm(
          `Confirm you've completed the ${formatPrice(order.total_amount)} payment to ${order.restaurant_name}. Marking this falsely may get your order rejected.`
        )
      ) {
        return;
      }
      claimPayment(order.order_code);
    });
  }

  const ivePaidHint = document.getElementById("ive-paid-hint");
  function unlockIvePaid() {
    paymentAttempted = true;
    if (ivePaidBtn) ivePaidBtn.disabled = false;
    if (ivePaidHint) ivePaidHint.textContent = "Only confirm after the money has actually left your account.";
  }

  const openUpiLink = document.getElementById("open-upi-link");
  if (openUpiLink) {
    openUpiLink.addEventListener("click", unlockIvePaid);
  }

  const copyUpiBtn = document.getElementById("copy-upi-btn");
  wireCopyButton(copyUpiBtn, () => copyUpiBtn.dataset.upiId);

  const toggleQrBtn = document.getElementById("toggle-qr-btn");
  const qrWrapper = document.getElementById("qr-wrapper");
  if (toggleQrBtn && qrWrapper) {
    toggleQrBtn.addEventListener("click", () => {
      // qrVisible is a module-level flag, not just local DOM state — the
      // page polls every 8s while an order is active and re-renders from
      // scratch (see loadOrder), which would otherwise silently close the
      // QR mid-scan.
      qrVisible = !qrVisible;
      qrWrapper.classList.toggle("hidden", !qrVisible);
      qrWrapper.style.display = qrVisible ? "flex" : "";
      toggleQrBtn.textContent = qrVisible ? "Hide QR code" : "If that shows a warning, scan a QR code instead";
      if (qrVisible) unlockIvePaid();
    });
  }
}

async function claimPayment(code) {
  const btn = document.getElementById("ive-paid-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Saving...";
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
    const activeStatuses = ["placed", "preparing", "ready"];
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
