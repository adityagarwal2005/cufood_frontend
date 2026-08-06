// Kept in sync with the API_BASE_URL constant in app.js.
const API_BASE_URL = "https://cufood-backend.onrender.com";

const pageContent = document.getElementById("page-content");

let restaurantData = null;
let ordersData = null;
let ordersPollTimer = null;
const ORIGINAL_TITLE = document.title;

// Tracks which "placed" orders we've already alerted on, so a fresh page
// load doesn't blast a sound/notification for orders that were already
// sitting there, only ones that arrive while the dashboard is open.
let seenPlacedCodes = new Set();
let hasLoadedOrdersOnce = false;

function playNewOrderSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.16].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = i === 0 ? 880 : 1046.5;
      gain.gain.setValueAtTime(0.001, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.3);
    });
  } catch (err) {
    console.error(err);
  }
}

function notifyNewOrder(count) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification("New order on CUFood", {
      body: count === 1 ? "You have a new order waiting." : `You have ${count} new orders waiting.`,
      icon: "icon-192.png",
    });
  } catch (err) {
    console.error(err);
  }
}

function checkForNewOrders(orders) {
  const currentPlaced = new Set(orders.filter((o) => o.status === "placed").map((o) => o.order_code));
  if (hasLoadedOrdersOnce) {
    const newOnes = [...currentPlaced].filter((code) => !seenPlacedCodes.has(code));
    if (newOnes.length > 0) {
      playNewOrderSound();
      notifyNewOrder(newOnes.length);
    }
  }
  seenPlacedCodes = currentPlaced;
  hasLoadedOrdersOnce = true;
}

const TOKEN_KEY = "cufood_owner_token";

// Bearer token, not session+CSRF cookie: the frontend (Vercel) and this
// backend (Render) are different domains, so JS here can never read a
// CSRF cookie the backend set — cookies are scoped to the domain that
// set them, no matter what SameSite says. That silently 403'd every
// mutation (toggle item, accept/reject order, etc.) while GETs still
// worked. A token sent as a normal header has no such dependency.
function authHeaders() {
  return { Authorization: `Token ${localStorage.getItem(TOKEN_KEY)}` };
}

// Escapes for both HTML text-node and attribute-value contexts — the
// div.textContent/innerHTML round-trip alone only escapes &, <, > and
// leaves quotes untouched, which is unsafe when the result is later
// concatenated into a quoted HTML attribute.
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatPrice(price) {
  if (price === null || price === undefined) return null;
  const value = parseFloat(price);
  if (Number.isNaN(value)) return null;
  return Number.isInteger(value) ? `₹${value}` : `₹${value.toFixed(2)}`;
}

// Falls back to a hidden textarea + execCommand for browsers/contexts where
// navigator.clipboard isn't available.
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

// Delegated once on the document so it keeps working across renderDashboard()
// / renderOrders() re-renders without needing to be re-bound to new .copy-btn
// elements every time.
document.addEventListener("click", async (event) => {
  const btn = event.target.closest(".copy-btn");
  if (!btn) return;
  const ok = await copyToClipboard(btn.dataset.copyValue);
  const original = btn.innerHTML;
  btn.innerHTML = `<span class="w-full h-full pointer-events-none">${ICONS.check}</span>`;
  setTimeout(() => {
    btn.innerHTML = original;
  }, 1500);
});

// Items with price_half/price_full set (e.g. rice dishes sold by portion)
// take priority over the plain price field, which is null in that case.
function renderItemPrice(item) {
  const half = formatPrice(item.price_half);
  const full = formatPrice(item.price_full);
  if (half || full) {
    const parts = [];
    if (half) parts.push(`Half ${half}`);
    if (full) parts.push(`Full ${full}`);
    return `<span class="text-[15px] font-bold text-accent-deep whitespace-nowrap">${escapeHtml(parts.join(" / "))}</span>`;
  }
  const price = formatPrice(item.price);
  return price ? `<span class="text-[15px] font-bold text-accent-deep whitespace-nowrap">${escapeHtml(price)}</span>` : "";
}

function hasPriceTiers(item) {
  return !!item.price_tiers && Object.keys(item.price_tiers).length > 0;
}

// Renders each size/price pair (e.g. Regular/Medium/Large/Giant) as a pill.
// Sizes with no price yet (still being filled in) are skipped.
function renderTierPills(tiers) {
  const pills = Object.entries(tiers)
    .map(([label, value]) => {
      const price = formatPrice(value);
      if (!price) return "";
      return `<span class="inline-flex items-center gap-1 text-xs font-semibold text-accent-deep bg-accent-soft rounded-full pl-2.5 pr-3 py-1 whitespace-nowrap"><span class="text-muted font-semibold">${escapeHtml(label)}</span>${escapeHtml(price)}</span>`;
    })
    .join("");
  return pills;
}

function groupItemsByCategory(items) {
  const groups = new Map();
  items.forEach((item) => {
    const key = item.category && item.category.trim() ? item.category.trim() : "Menu";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return groups;
}

function showError(message) {
  const banner = document.getElementById("error-banner");
  if (!banner) return;
  banner.textContent = message;
  banner.classList.remove("hidden");
}

function hideError() {
  const banner = document.getElementById("error-banner");
  if (!banner) return;
  banner.classList.add("hidden");
}

// Tailwind "peer" toggle switch. `extraInputClasses` lets callers add a
// selector hook (e.g. "item-toggle") that attachEventListeners() queries.
// The checkmark icon lives in its own span, shown via peer-checked:opacity-100.
function toggleSwitchHtml({ id, extraInputClasses, checked, dataAttrs }) {
  const idAttr = id ? ` id="${id}"` : "";
  return `
    <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
      <input type="checkbox"${idAttr} class="peer sr-only ${extraInputClasses || ""}" ${dataAttrs || ""} ${checked ? "checked" : ""}>
      <span class="block w-11 h-6 rounded-full bg-line shadow-inner peer-checked:bg-gradient-to-r peer-checked:from-accent peer-checked:to-accent-deep transition-colors duration-200"></span>
      <span class="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow flex items-center justify-center text-accent-deep p-1 opacity-0 peer-checked:opacity-100 transition-all duration-200 peer-checked:translate-x-5">${ICONS.check}</span>
    </label>
  `;
}

function stateMessage({ icon, message, card }) {
  const wrapper = card
    ? "text-center bg-white border border-line rounded-2xl shadow-sm px-7 py-14"
    : "text-center py-10";
  return `
    <div class="${wrapper}">
      <span class="flex items-center justify-center w-14 h-14 rounded-full bg-accent-soft text-accent mx-auto mb-4 p-3.5">${icon}</span>
      <p class="text-muted text-[15px]">${message}</p>
    </div>
  `;
}

// Tracks which item's row is showing the inline edit form, if any.
let editingItemId = null;

function renderEditItemRow(item) {
  // Tiered/half-full items keep their pricing structure untouched here —
  // only name/category are editable for them, since a single "price"
  // field doesn't represent their pricing shape. Plain-priced items get
  // a price field too, matching what the "Add item" form can create.
  const simplePriced = !hasPriceTiers(item) && item.price_half == null && item.price_full == null;
  return `
    <div class="flex flex-wrap items-end gap-3 bg-white border-2 border-accent-soft rounded-xl px-5 py-4" data-edit-row="${item.id}">
      <div class="flex flex-col gap-1 flex-1 min-w-[140px]">
        <label class="text-[11px] font-semibold text-muted">Name</label>
        <input type="text" class="edit-item-name rounded-lg border-2 border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" value="${escapeHtml(item.name)}">
      </div>
      <div class="flex flex-col gap-1 flex-1 min-w-[120px]">
        <label class="text-[11px] font-semibold text-muted">Category</label>
        <input type="text" class="edit-item-category rounded-lg border-2 border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" value="${escapeHtml(item.category || "")}">
      </div>
      ${simplePriced ? `
        <div class="flex flex-col gap-1 w-24">
          <label class="text-[11px] font-semibold text-muted">Price</label>
          <input type="number" min="0" step="0.01" class="edit-item-price rounded-lg border-2 border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent" value="${item.price !== null ? item.price : ""}">
        </div>
      ` : ""}
      <div class="flex items-center gap-2">
        <button type="button" class="btn-save-edit inline-flex items-center gap-1.5 text-sm font-bold text-white bg-gradient-to-br from-accent to-accent-deep rounded-lg px-3.5 py-2" data-item-id="${item.id}">Save</button>
        <button type="button" class="btn-cancel-edit inline-flex items-center gap-1.5 text-sm font-semibold text-muted bg-white border border-line rounded-lg px-3.5 py-2">Cancel</button>
      </div>
    </div>
  `;
}

function renderMenuItemsHtml(items) {
  if (items.length === 0) {
    return stateMessage({
      icon: ICONS.plate,
      message: "No menu items yet — add your first one above.",
      card: false,
    });
  }

  const groups = groupItemsByCategory(items);
  let html = "";

  groups.forEach((groupItems, category) => {
    html += `<div class="mb-6 last:mb-0">`;
    html += `<h2 class="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted mb-3.5">
      <span class="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-accent to-accent-deep"></span>
      ${escapeHtml(category)}
    </h2>`;
    html += `<div class="flex flex-col gap-2.5">`;
    groupItems.forEach((item) => {
      if (item.id === editingItemId) {
        html += renderEditItemRow(item);
        return;
      }
      const tiered = hasPriceTiers(item);
      html += `
        <div class="flex flex-wrap items-center gap-4 bg-white border border-line border-l-4 border-l-transparent rounded-xl shadow-sm px-5 py-4 hover:shadow-md hover:-translate-y-0.5 hover:border-l-accent transition-all duration-200">
          <div class="flex-1 flex flex-wrap items-baseline gap-2 min-w-[140px]">
            <span class="text-[15px] font-semibold text-ink">${escapeHtml(item.name)}</span>
            ${tiered ? renderTierPills(item.price_tiers) : renderItemPrice(item)}
            ${!item.is_permanently_active ? `<span class="text-[11px] font-semibold text-muted bg-stone-100 px-2.5 py-0.5 rounded-full">Inactive</span>` : ""}
          </div>
          <div class="flex items-center gap-4 flex-shrink-0">
            ${toggleSwitchHtml({
              extraInputClasses: "item-toggle",
              checked: item.is_available_today,
              dataAttrs: `data-item-id="${item.id}"`,
            })}
            <button type="button" class="btn-edit inline-flex items-center gap-1.5 text-sm font-semibold text-muted bg-white border border-line rounded-xl px-3.5 py-2 hover:text-accent-deep hover:border-accent-soft hover:bg-accent-soft transition-all duration-150" data-item-id="${item.id}">
              <span class="w-3.5 h-3.5">${ICONS.edit}</span>Edit
            </button>
            <button type="button" class="btn-delete inline-flex items-center gap-1.5 text-sm font-semibold text-muted bg-white border border-line rounded-xl px-3.5 py-2 hover:text-error hover:border-error-soft hover:bg-error-soft transition-all duration-150" data-item-id="${item.id}">
              <span class="w-3.5 h-3.5">${ICONS.trash}</span>Delete
            </button>
          </div>
        </div>
      `;
    });
    html += `</div></div>`;
  });

  return html;
}

const ORDER_STATUS_META = {
  placed: { label: "New order", pillClass: "bg-accent-soft text-accent-deep" },
  preparing: { label: "Preparing", pillClass: "bg-accent-soft text-accent-deep" },
  rejected: { label: "Rejected", pillClass: "bg-stone-100 text-muted" },
  ready: { label: "Ready for pickup", pillClass: "bg-accent-soft text-accent-deep" },
  completed: { label: "Completed", pillClass: "bg-stone-100 text-muted" },
};

function timeAgo(isoString) {
  const diffMin = Math.round((new Date() - new Date(isoString)) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin === 1) return "1 min ago";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  return `${diffHr} hr ago`;
}

function renderOrderActions(order) {
  if (order.status === "placed") {
    return `
      <div class="flex items-center gap-2 flex-shrink-0">
        <button type="button" class="order-reject-btn inline-flex items-center gap-1.5 text-sm font-semibold text-error bg-error-soft rounded-xl px-4 py-2 hover:opacity-80 transition-opacity duration-150" data-code="${escapeHtml(order.order_code)}">Reject</button>
        <button type="button" class="order-accept-btn inline-flex items-center gap-1.5 text-sm font-bold text-white bg-gradient-to-br from-accent to-accent-deep rounded-xl px-4 py-2 shadow-accent-glow hover:shadow-lg transition-all duration-150" data-code="${escapeHtml(order.order_code)}">Accept & start</button>
      </div>
    `;
  }
  if (order.status === "preparing") {
    return `
      <button type="button" class="order-ready-btn inline-flex items-center gap-1.5 text-sm font-bold text-white bg-gradient-to-br from-accent to-accent-deep rounded-xl px-4 py-2 shadow-accent-glow hover:shadow-lg transition-all duration-150 flex-shrink-0" data-code="${escapeHtml(order.order_code)}">Mark ready</button>
    `;
  }
  if (order.status === "ready") {
    return `
      <button type="button" class="order-complete-btn inline-flex items-center gap-1.5 text-sm font-bold text-white bg-gradient-to-br from-accent to-accent-deep rounded-xl px-4 py-2 shadow-accent-glow hover:shadow-lg transition-all duration-150 flex-shrink-0" data-code="${escapeHtml(order.order_code)}">Picked up</button>
    `;
  }
  return "";
}

function renderOrderCard(order) {
  const meta = ORDER_STATUS_META[order.status] || ORDER_STATUS_META.placed;
  const itemsSummary = order.items
    .map((item) => `${item.quantity}x ${escapeHtml(item.name)}${item.size_label ? ` (${escapeHtml(item.size_label)})` : ""}`)
    .join(", ");
  const etaText = order.status === "preparing" && order.estimated_ready_at
    ? `<p class="text-xs text-muted mt-1">Ready by ${escapeHtml(new Date(order.estimated_ready_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}</p>`
    : "";
  // Only meaningful before the order's actually being prepped — once
  // it's preparing/ready, etaText above (driven by estimated_ready_at,
  // which mark_preparing() sets from scheduled_for when relevant) is the
  // more current signal, so this badge would be redundant there.
  const scheduledBadge = order.scheduled_for && ["placed", "rejected"].includes(order.status)
    ? `<span class="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-accent-soft text-accent-deep"><span class="w-3 h-3">${ICONS.clock}</span>${escapeHtml(new Date(order.scheduled_for).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}</span>`
    : "";
  // No UPI deep-link parameter exists for "pay by mobile number" (the
  // spec only supports payee VPA, pa=), so unlike restaurant_upi_id this
  // can't be a tap-to-pay link or QR — just the number, for the owner to
  // enter manually via their UPI app's "Pay via Mobile Number" option.
  const refundLinkHtml = order.status === "rejected" && order.student_phone_number
    ? `
      <div class="mt-2 bg-error-soft rounded-xl px-3 py-2">
        <p class="text-xs font-semibold text-error">Refund this number via UPI:</p>
        <div class="flex items-center gap-1.5">
          <a href="tel:${escapeHtml(order.student_phone_number)}" class="text-sm font-bold text-error underline">${escapeHtml(order.student_phone_number)}</a>
          <button type="button" class="copy-btn flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg text-error hover:bg-white/60 transition-colors duration-150" data-copy-value="${escapeHtml(order.student_phone_number)}" aria-label="Copy phone number">
            <span class="w-3.5 h-3.5 pointer-events-none">${ICONS.copy}</span>
          </button>
        </div>
        <p class="text-[11px] text-error/80 mt-0.5">Use "Pay via Mobile Number" in your UPI app.</p>
      </div>
    `
    : "";

  return `
    <div class="border border-line rounded-xl p-4 sm:p-5 mb-3 last:mb-0 bg-white" data-order-card>
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span class="text-sm font-extrabold text-ink">#${escapeHtml(order.order_code)}</span>
            <span class="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${meta.pillClass}">${meta.label}</span>
            ${scheduledBadge}
          </div>
          <p class="text-xs text-muted">${escapeHtml(order.student_name)}${order.status === "placed" && order.student_phone_number ? ` · ${escapeHtml(order.student_phone_number)}` : ""} · ${timeAgo(order.created_at)}</p>
          <p class="text-sm text-ink mt-2">${itemsSummary}</p>
          <p class="text-sm font-bold text-accent-deep mt-1">${escapeHtml(formatPrice(order.total_amount))}</p>
          ${etaText}
          ${refundLinkHtml}
        </div>
        ${renderOrderActions(order)}
      </div>
    </div>
  `;
}

// Orders paid today, excluding rejected ones (nothing was actually
// fulfilled for those). MyOrdersView caps at the 100 most recent orders,
// so on a very high-volume day this undercounts — acceptable for a quick
// pulse check, not meant as an authoritative sales report.
function renderTodayStats(orders) {
  const el = document.getElementById("today-stats");
  if (!el) return;

  const todayStr = new Date().toDateString();
  const todaysOrders = orders.filter(
    (o) => o.status !== "rejected" && new Date(o.created_at).toDateString() === todayStr
  );

  if (todaysOrders.length === 0) {
    el.innerHTML = "";
    return;
  }

  const revenue = todaysOrders.reduce((sum, o) => sum + parseFloat(o.total_amount), 0);
  el.innerHTML = `
    <div class="flex items-center gap-5 bg-cream-alt rounded-xl px-4 py-3 mb-4">
      <div>
        <p class="text-xl font-extrabold text-ink leading-none">${todaysOrders.length}</p>
        <p class="text-[11px] font-semibold text-muted uppercase tracking-wide mt-1">Orders today</p>
      </div>
      <div class="w-px h-8 bg-line"></div>
      <div>
        <p class="text-xl font-extrabold text-accent-deep leading-none">${escapeHtml(formatPrice(revenue))}</p>
        <p class="text-[11px] font-semibold text-muted uppercase tracking-wide mt-1">Revenue today</p>
      </div>
    </div>
  `;
}

function renderOrders(orders) {
  // null means "not fetched yet" — leave the "Loading orders..." placeholder
  // alone rather than flashing an incorrect "no orders" state.
  if (orders === null) return;
  checkForNewOrders(orders);
  ordersData = orders;
  renderTodayStats(orders);
  const container = document.getElementById("orders-list");
  if (!container) return;

  const active = orders.filter((o) => ["placed", "preparing", "ready"].includes(o.status));
  const history = orders.filter((o) => ["rejected", "completed"].includes(o.status)).slice(0, 5);

  if (active.length === 0 && history.length === 0) {
    container.innerHTML = stateMessage({
      icon: ICONS.cart,
      message: "No orders yet — they'll show up here the moment a student places one.",
      card: false,
    });
  } else {
    let html = "";
    if (active.length > 0) {
      html += active.map(renderOrderCard).join("");
    } else {
      html += `<p class="text-sm text-muted py-2">No active orders right now.</p>`;
    }
    if (history.length > 0) {
      html += `<p class="text-xs font-bold uppercase tracking-widest text-muted mt-5 mb-3">Recent</p>`;
      html += history.map(renderOrderCard).join("");
    }
    container.innerHTML = html;
  }

  attachOrderListeners();

  // Lightweight "notification": prefix the tab title with a count so an
  // owner with the dashboard open in a background tab still notices.
  const pendingCount = orders.filter((o) => o.status === "placed").length;
  document.title = pendingCount > 0 ? `(${pendingCount}) ${ORIGINAL_TITLE}` : ORIGINAL_TITLE;

  const badge = document.getElementById("orders-pending-badge");
  if (badge) {
    if (pendingCount > 0) {
      badge.textContent = `${pendingCount} new`;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }
}

function attachOrderListeners() {
  document.querySelectorAll(".order-accept-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      // "Accept" is the only point that actually matters for the false-claim
      // problem: a student tapping "I've paid" without paying costs nothing
      // by itself, but it does if the owner starts cooking on the strength
      // of that claim alone. This forces them to actually check their own
      // UPI app — the one place real proof of payment exists — before
      // committing food/time, instead of just trusting payment_status.
      const order = (ordersData || []).find((o) => o.order_code === btn.dataset.code);
      const amount = order ? formatPrice(order.total_amount) : "the order amount";
      const phoneLine = order && order.student_phone_number
        ? ` Payer's number on file: ${order.student_phone_number} — cross-check it against the payment notification in your UPI app.`
        : "";
      if (
        !window.confirm(
          `Before accepting: have you actually seen ${amount} land in your UPI app for this order?${phoneLine}\n\nThe student's "paid" status is self-reported, not verified — only your own bank/UPI app is proof. If you haven't seen the payment, reject instead.`
        )
      ) {
        return;
      }
      handleOrderAction(btn.dataset.code, "accept", btn);
    });
  });
  document.querySelectorAll(".order-reject-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!window.confirm("Reject this order? The student has already paid — you'll need to refund them via UPI. Their phone number will appear on the order once you reject it.")) return;
      handleOrderAction(btn.dataset.code, "reject", btn);
    });
  });
  document.querySelectorAll(".order-ready-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleOrderAction(btn.dataset.code, "ready", btn));
  });
  document.querySelectorAll(".order-complete-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleOrderAction(btn.dataset.code, "complete", btn));
  });
}

async function handleOrderAction(orderCode, action, triggerBtn) {
  hideError();
  const card = triggerBtn.closest("[data-order-card]");
  const buttons = card ? card.querySelectorAll("button") : [triggerBtn];
  buttons.forEach((b) => (b.disabled = true));

  try {
    const response = await fetch(`${API_BASE_URL}/api/me/orders/${orderCode}/${action}/`, {
      method: "PATCH",
      headers: authHeaders(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showError(data.detail || "Could not update this order. Please try again.");
      buttons.forEach((b) => (b.disabled = false));
      return;
    }
    await loadOrders();
  } catch (err) {
    showError("Could not reach the server. Please try again.");
    console.error(err);
    buttons.forEach((b) => (b.disabled = false));
  }
}

async function loadOrders() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/me/orders/`, { headers: authHeaders() });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const orders = await response.json();
    renderOrders(orders);
  } catch (err) {
    console.error(err);
  }
}

function startOrderPolling() {
  clearInterval(ordersPollTimer);
  ordersPollTimer = setInterval(loadOrders, 12000);
}

function renderDashboard() {
  const statusPill = restaurantData.is_open_today
    ? `<span class="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-full bg-accent-soft text-accent-deep"><span class="w-1.5 h-1.5 rounded-full bg-accent"></span>Open today</span>`
    : `<span class="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-full bg-stone-100 text-muted"><span class="w-1.5 h-1.5 rounded-full bg-muted"></span>Closed today</span>`;

  const items = restaurantData.menu_items || [];
  const availableCount = items.filter((i) => i.is_available_today).length;
  const itemWord = items.length === 1 ? "item" : "items";
  const initial = restaurantData.name ? restaurantData.name.charAt(0).toUpperCase() : "R";

  pageContent.innerHTML = `
    <div class="relative bg-white border border-line rounded-2xl shadow-lg p-6 sm:p-7 mb-8 overflow-hidden">
      <div class="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-accent to-accent-deep"></div>
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex flex-wrap items-center gap-4">
          <span class="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-accent to-accent-deep text-white font-extrabold text-lg shadow-accent-glow flex-shrink-0">${escapeHtml(initial)}</span>
          <div class="flex flex-col gap-1">
            <div class="flex flex-wrap items-center gap-3">
              <h1 class="text-2xl sm:text-3xl font-extrabold text-ink leading-tight">${escapeHtml(restaurantData.name)}</h1>
              ${statusPill}
            </div>
            <p class="text-sm font-semibold text-muted">${items.length} ${itemWord} · ${availableCount} available today</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-4">
          <div class="flex items-center gap-2.5 pl-4 border-l border-line whitespace-nowrap">
            <span class="text-sm font-semibold text-muted">Open today</span>
            ${toggleSwitchHtml({ id: "open-toggle", checked: restaurantData.is_open_today })}
          </div>
          <button type="button" id="logout-btn" class="inline-flex items-center gap-1.5 text-sm font-semibold text-muted bg-cream border border-line rounded-full px-5 py-2.5 hover:text-accent-deep hover:border-accent-soft transition-all duration-150 whitespace-nowrap">
            <span class="w-3.5 h-3.5">${ICONS.logout}</span>Log out
          </button>
        </div>
      </div>
    </div>

    <div id="error-banner" class="hidden text-sm font-medium text-error bg-error-soft rounded-xl px-4 py-3 mb-6"></div>

    ${!restaurantData.upi_id ? `
      <div class="flex items-center gap-3 bg-error-soft border border-error/20 rounded-2xl px-5 py-4 mb-6">
        <span class="w-5 h-5 text-error flex-shrink-0">${ICONS.warning}</span>
        <p class="text-sm font-semibold text-error">Set your UPI ID below so students can pay you right after they place an order.</p>
      </div>
    ` : ""}

    <section class="bg-white border border-line rounded-2xl shadow-sm p-6 sm:p-7 mb-8">
      <h2 class="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted mb-4">
        <span class="w-3.5 h-3.5 text-accent-deep">${ICONS.cart}</span>Payment settings
      </h2>
      <form id="upi-form" class="flex flex-wrap gap-3.5 items-end">
        <div class="flex flex-col gap-1.5 flex-1 min-w-[200px]">
          <label class="text-xs font-semibold text-muted" for="upi-id-input">Your UPI ID</label>
          <div class="flex items-center gap-2">
            <input type="text" id="upi-id-input" placeholder="yourname@bank" value="${escapeHtml(restaurantData.upi_id || "")}"
              class="flex-1 rounded-xl border-2 border-line bg-white px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft transition-all duration-150">
            ${restaurantData.upi_id ? `
              <button type="button" class="copy-btn flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl border-2 border-line text-muted hover:text-accent-deep hover:border-accent-soft transition-colors duration-150" data-copy-value="${escapeHtml(restaurantData.upi_id)}" aria-label="Copy UPI ID">
                <span class="w-4 h-4 pointer-events-none">${ICONS.copy}</span>
              </button>
            ` : ""}
          </div>
        </div>
        <button type="submit" id="upi-save-btn" class="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-accent to-accent-deep text-white font-bold text-sm px-5 py-2.5 shadow-accent-glow hover:shadow-lg transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed">Save</button>
      </form>
      <p class="text-xs text-muted mt-3">Shown to students right after they place an order, so they can pay you directly before you ever see it.</p>
    </section>

    <section class="bg-white border border-line rounded-2xl shadow-sm p-6 sm:p-7 mb-8">
      <div class="flex items-center justify-between gap-3 mb-5">
        <h2 class="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
          <span class="w-3.5 h-3.5 text-accent-deep">${ICONS.cart}</span>Orders
        </h2>
        <div class="flex items-center gap-2">
          ${typeof Notification !== "undefined" && Notification.permission === "default" ? `
            <button type="button" id="enable-notifications-btn" class="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-deep bg-accent-soft rounded-full px-3 py-1.5 hover:opacity-80 transition-opacity duration-150">Enable alerts</button>
          ` : ""}
          <span id="orders-pending-badge" class="hidden text-xs font-bold text-white bg-accent rounded-full px-2.5 py-1"></span>
        </div>
      </div>
      <div id="today-stats"></div>
      <div id="orders-list">
        <p class="text-sm text-muted py-2">Loading orders...</p>
      </div>
    </section>

    <div class="bg-cream-alt border border-line rounded-2xl shadow-sm p-6 sm:p-7 mb-8">
      <h2 class="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted mb-4">
        <span class="w-3.5 h-3.5 text-accent-deep">${ICONS.plus}</span>Add new item
      </h2>
      <form id="add-item-form" class="flex flex-wrap gap-3.5 items-end">
        <div class="flex flex-col gap-1.5 flex-1 min-w-[140px]">
          <label class="text-xs font-semibold text-muted" for="item-name">Name</label>
          <input type="text" id="item-name" required
            class="rounded-xl border-2 border-line bg-white px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft transition-all duration-150">
        </div>
        <div class="flex flex-col gap-1.5 flex-1 min-w-[140px]">
          <label class="text-xs font-semibold text-muted" for="item-category">Category</label>
          <input type="text" id="item-category" placeholder="Optional"
            class="rounded-xl border-2 border-line bg-white px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft transition-all duration-150">
        </div>
        <div class="flex flex-col gap-1.5 flex-1 min-w-[140px]">
          <label class="text-xs font-semibold text-muted" for="item-price">Price</label>
          <input type="number" id="item-price" placeholder="Optional" min="0" step="0.01"
            class="rounded-xl border-2 border-line bg-white px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft transition-all duration-150">
        </div>
        <button type="submit" id="add-item-submit" class="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-accent to-accent-deep text-white font-bold text-sm px-5 py-2.5 shadow-accent-glow hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0">
          <span class="w-3.5 h-3.5">${ICONS.plus}</span>Add item
        </button>
      </form>
    </div>

    <section id="menu-section" class="bg-cream-alt border border-line rounded-2xl shadow-sm p-6 sm:p-7">
      <h2 class="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted mb-5">
        <span class="w-3.5 h-3.5 text-accent-deep">${ICONS.utensils}</span>Your menu
      </h2>
      ${renderMenuItemsHtml(restaurantData.menu_items || [])}
    </section>
  `;

  attachEventListeners();
  // Menu actions (add/delete/toggle item) re-render this whole page, which
  // would otherwise flash "Loading orders..." on every one of them — repaint
  // the orders section from cache immediately; polling refreshes it for real.
  renderOrders(ordersData);
}

function attachEventListeners() {
  document.getElementById("logout-btn").addEventListener("click", handleLogout);
  document.getElementById("open-toggle").addEventListener("change", handleToggleOpen);
  document.getElementById("add-item-form").addEventListener("submit", handleAddItem);
  document.getElementById("upi-form").addEventListener("submit", handleUpdateUpiId);

  const notifyBtn = document.getElementById("enable-notifications-btn");
  if (notifyBtn) {
    notifyBtn.addEventListener("click", () => {
      Notification.requestPermission().finally(renderDashboard);
    });
  }

  document.querySelectorAll(".item-toggle").forEach((el) => {
    el.addEventListener("change", (e) => handleToggleItem(e.target.dataset.itemId, e.target));
  });

  document.querySelectorAll(".btn-delete").forEach((el) => {
    el.addEventListener("click", (e) => handleDeleteItem(e.currentTarget.dataset.itemId));
  });

  document.querySelectorAll(".btn-edit").forEach((el) => {
    el.addEventListener("click", (e) => {
      editingItemId = Number(e.currentTarget.dataset.itemId);
      renderDashboard();
    });
  });

  document.querySelectorAll(".btn-cancel-edit").forEach((el) => {
    el.addEventListener("click", () => {
      editingItemId = null;
      renderDashboard();
    });
  });

  document.querySelectorAll(".btn-save-edit").forEach((el) => {
    el.addEventListener("click", (e) => handleSaveEditItem(e.currentTarget.dataset.itemId));
  });
}

async function handleToggleOpen(event) {
  hideError();
  const checkbox = event.target;
  const previousValue = restaurantData.is_open_today;

  try {
    const response = await fetch(`${API_BASE_URL}/api/me/restaurant/toggle-open/`, {
      method: "PATCH",
      headers: authHeaders(),
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const data = await response.json();
    restaurantData.is_open_today = data.is_open_today;
    renderDashboard();
  } catch (err) {
    checkbox.checked = previousValue;
    showError("Could not update open/closed status. Please try again.");
    console.error(err);
  }
}

async function handleUpdateUpiId(event) {
  event.preventDefault();
  hideError();

  const saveBtn = document.getElementById("upi-save-btn");
  const upiId = document.getElementById("upi-id-input").value.trim();
  saveBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/api/me/restaurant/upi-id/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({ upi_id: upiId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showError(data.detail || "Could not save your UPI ID. Please try again.");
      return;
    }
    restaurantData.upi_id = data.upi_id;
    renderDashboard();
  } catch (err) {
    showError("Could not reach the server. Please try again.");
    console.error(err);
  } finally {
    saveBtn.disabled = false;
  }
}

async function handleToggleItem(itemId, checkbox) {
  hideError();
  const item = restaurantData.menu_items.find((i) => String(i.id) === String(itemId));
  const previousValue = item ? item.is_available_today : false;

  try {
    const response = await fetch(`${API_BASE_URL}/api/me/menu-items/${itemId}/toggle-today/`, {
      method: "PATCH",
      headers: authHeaders(),
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const data = await response.json();
    if (item) item.is_available_today = data.is_available_today;
    renderDashboard();
  } catch (err) {
    checkbox.checked = previousValue;
    showError("Could not update item availability. Please try again.");
    console.error(err);
  }
}

async function handleSaveEditItem(itemId) {
  hideError();
  const row = document.querySelector(`[data-edit-row="${itemId}"]`);
  if (!row) return;

  const name = row.querySelector(".edit-item-name").value.trim();
  const category = row.querySelector(".edit-item-category").value.trim();
  const priceInput = row.querySelector(".edit-item-price");

  if (!name) {
    showError("Item name can't be empty.");
    return;
  }

  const body = { name, category };
  if (priceInput) {
    const priceValue = priceInput.value.trim();
    body.price = priceValue === "" ? null : priceValue;
  }

  const saveBtn = row.querySelector(".btn-save-edit");
  saveBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/api/me/menu-items/${itemId}/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showError(data.detail || "Could not save changes. Please try again.");
      saveBtn.disabled = false;
      return;
    }
    const item = restaurantData.menu_items.find((i) => String(i.id) === String(itemId));
    if (item) Object.assign(item, data);
    editingItemId = null;
    renderDashboard();
  } catch (err) {
    showError("Could not reach the server. Please try again.");
    console.error(err);
    saveBtn.disabled = false;
  }
}

async function handleDeleteItem(itemId) {
  hideError();
  const item = restaurantData.menu_items.find((i) => String(i.id) === String(itemId));
  const confirmed = window.confirm(`Delete "${item ? item.name : "this item"}"? This cannot be undone.`);
  if (!confirmed) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/me/menu-items/${itemId}/`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    restaurantData.menu_items = restaurantData.menu_items.filter(
      (i) => String(i.id) !== String(itemId)
    );
    renderDashboard();
  } catch (err) {
    showError("Could not delete item. Please try again.");
    console.error(err);
  }
}

async function handleAddItem(event) {
  event.preventDefault();
  hideError();

  const submitBtn = document.getElementById("add-item-submit");
  const nameInput = document.getElementById("item-name");
  const categoryInput = document.getElementById("item-category");
  const priceInput = document.getElementById("item-price");

  const name = nameInput.value.trim();
  const category = categoryInput.value.trim();
  const price = priceInput.value.trim() === "" ? null : priceInput.value.trim();

  submitBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/api/me/menu-items/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({ name, category, price }),
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const newItem = await response.json();
    restaurantData.menu_items.push({
      ...newItem,
      is_permanently_active: true,
      is_available_today: true,
    });
    renderDashboard();
  } catch (err) {
    showError("Could not add item. Check the fields and try again.");
    console.error(err);
  } finally {
    submitBtn.disabled = false;
  }
}

async function handleLogout() {
  try {
    await fetch(`${API_BASE_URL}/api/logout/`, {
      method: "POST",
      headers: authHeaders(),
    });
  } catch (err) {
    console.error(err);
  } finally {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = "restaurant-login.html";
  }
}

async function loadDashboard() {
  if (!localStorage.getItem(TOKEN_KEY)) {
    window.location.href = "restaurant-login.html";
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/me/restaurant/`, {
      headers: authHeaders(),
    });

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = "restaurant-login.html";
      return;
    }

    if (response.status === 404) {
      pageContent.innerHTML = stateMessage({
        icon: ICONS.warning,
        message: "Your account isn't linked to a restaurant yet. Contact the CUFood admin to get this set up.",
        card: true,
      });
      return;
    }

    if (!response.ok) throw new Error(`Request failed: ${response.status}`);

    restaurantData = await response.json();
    renderDashboard();
    loadOrders();
    startOrderPolling();
  } catch (err) {
    pageContent.innerHTML = stateMessage({
      icon: ICONS.warning,
      message: "Could not load your dashboard. Is the backend running?",
      card: true,
    });
    console.error(err);
  }
}

loadDashboard();
