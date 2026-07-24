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

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function ensureCsrfCookie() {
  await fetch(`${API_BASE_URL}/api/csrf/`, { credentials: "include" });
}

function csrfHeaders() {
  return { "X-CSRFToken": getCookie("csrftoken") };
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
      const tiered = hasPriceTiers(item);
      html += `
        <div class="flex items-center gap-4 bg-white border border-line border-l-4 border-l-transparent rounded-xl shadow-sm px-5 py-4 hover:shadow-md hover:-translate-y-0.5 hover:border-l-accent transition-all duration-200">
          <div class="flex-1 flex flex-wrap items-baseline gap-2 min-w-0">
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
  accepted: { label: "Preparing", pillClass: "bg-accent-soft text-accent-deep" },
  rejected: { label: "Rejected & refunded", pillClass: "bg-stone-100 text-muted" },
  ready: { label: "Ready for pickup", pillClass: "bg-accent-soft text-accent-deep" },
  completed: { label: "Completed", pillClass: "bg-stone-100 text-muted" },
  payment_pending: { label: "Awaiting payment", pillClass: "bg-stone-100 text-muted" },
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
        <button type="button" class="order-accept-btn inline-flex items-center gap-1.5 text-sm font-bold text-white bg-gradient-to-br from-accent to-accent-deep rounded-xl px-4 py-2 shadow-accent-glow hover:shadow-lg transition-all duration-150" data-code="${escapeHtml(order.order_code)}">Accept</button>
      </div>
    `;
  }
  if (order.status === "accepted") {
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
  const etaText = order.status === "accepted" && order.estimated_ready_at
    ? `<p class="text-xs text-muted mt-1">Ready by ${escapeHtml(new Date(order.estimated_ready_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}</p>`
    : "";

  return `
    <div class="border border-line rounded-xl p-4 sm:p-5 mb-3 last:mb-0 bg-white" data-order-card>
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span class="text-sm font-extrabold text-ink">#${escapeHtml(order.order_code)}</span>
            <span class="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${meta.pillClass}">${meta.label}</span>
          </div>
          <p class="text-xs text-muted">${escapeHtml(order.student_name)} · ${escapeHtml(order.student_uid)} · ${timeAgo(order.created_at)}</p>
          <p class="text-sm text-ink mt-2">${itemsSummary}</p>
          <p class="text-sm font-bold text-accent-deep mt-1">${escapeHtml(formatPrice(order.total_amount))}</p>
          ${etaText}
        </div>
        ${renderOrderActions(order)}
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
  const container = document.getElementById("orders-list");
  if (!container) return;

  const active = orders.filter((o) => ["placed", "accepted", "ready"].includes(o.status));
  const history = orders.filter((o) => ["rejected", "completed"].includes(o.status)).slice(0, 5);

  if (active.length === 0 && history.length === 0) {
    container.innerHTML = stateMessage({
      icon: ICONS.cart,
      message: "No orders yet — they'll show up here the moment a student pays.",
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
    btn.addEventListener("click", () => handleOrderAction(btn.dataset.code, "accept", btn));
  });
  document.querySelectorAll(".order-reject-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!window.confirm("Reject this order? The student is refunded automatically.")) return;
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
      credentials: "include",
      headers: csrfHeaders(),
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
    const response = await fetch(`${API_BASE_URL}/api/me/orders/`, { credentials: "include" });
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
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2.5 pl-4 border-l border-line">
            <span class="text-sm font-semibold text-muted">Open today</span>
            ${toggleSwitchHtml({ id: "open-toggle", checked: restaurantData.is_open_today })}
          </div>
          <button type="button" id="logout-btn" class="inline-flex items-center gap-1.5 text-sm font-semibold text-muted bg-cream border border-line rounded-full px-5 py-2.5 hover:text-accent-deep hover:border-accent-soft transition-all duration-150">
            <span class="w-3.5 h-3.5">${ICONS.logout}</span>Log out
          </button>
        </div>
      </div>
    </div>

    <div id="error-banner" class="hidden text-sm font-medium text-error bg-error-soft rounded-xl px-4 py-3 mb-6"></div>

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
}

async function handleToggleOpen(event) {
  hideError();
  const checkbox = event.target;
  const previousValue = restaurantData.is_open_today;

  try {
    const response = await fetch(`${API_BASE_URL}/api/me/restaurant/toggle-open/`, {
      method: "PATCH",
      credentials: "include",
      headers: csrfHeaders(),
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

async function handleToggleItem(itemId, checkbox) {
  hideError();
  const item = restaurantData.menu_items.find((i) => String(i.id) === String(itemId));
  const previousValue = item ? item.is_available_today : false;

  try {
    const response = await fetch(`${API_BASE_URL}/api/me/menu-items/${itemId}/toggle-today/`, {
      method: "PATCH",
      credentials: "include",
      headers: csrfHeaders(),
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

async function handleDeleteItem(itemId) {
  hideError();
  const item = restaurantData.menu_items.find((i) => String(i.id) === String(itemId));
  const confirmed = window.confirm(`Delete "${item ? item.name : "this item"}"? This cannot be undone.`);
  if (!confirmed) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/me/menu-items/${itemId}/`, {
      method: "DELETE",
      credentials: "include",
      headers: csrfHeaders(),
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
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...csrfHeaders(),
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
      credentials: "include",
      headers: csrfHeaders(),
    });
  } catch (err) {
    console.error(err);
  } finally {
    window.location.href = "restaurant-login.html";
  }
}

async function loadDashboard() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/me/restaurant/`, {
      credentials: "include",
    });

    if (response.status === 401 || response.status === 403) {
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
    await ensureCsrfCookie();
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
