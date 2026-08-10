const API_BASE_URL = "https://cufood-backend.onrender.com";
// Written by checkout.js right after an order is placed.
const MY_ORDERS_KEY = "cufood_my_orders";

const pageContent = document.getElementById("page-content");

function getMyOrders() {
  try {
    return JSON.parse(localStorage.getItem(MY_ORDERS_KEY)) || [];
  } catch (err) {
    return [];
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

const STATUS_PILL = {
  placed: "bg-accent-soft text-accent-deep",
  preparing: "bg-accent-soft text-accent-deep",
  ready: "bg-accent-soft text-accent-deep",
  completed: "bg-cream-alt text-muted",
  rejected: "bg-cream-alt text-muted",
};

const STATUS_LABEL = {
  placed: "Placed",
  preparing: "Preparing",
  ready: "Ready for pickup",
  completed: "Completed",
  rejected: "Rejected",
};

function emptyState() {
  pageContent.innerHTML = `
    <div class="state-shell">
      <span class="state-icon">${ICONS.cart}</span>
      <p class="text-muted text-base mb-4">No orders placed from this device yet.</p>
      <a href="location-select.html" class="text-accent-deep font-bold hover:underline">Browse outlets</a>
    </div>
  `;
}

// A flat list, not a stack of boxed cards — order history reads more like
// a receipt/ledger than a set of unrelated tiles, so one continuous list
// with a rule between rows fits it better than each row being its own
// bordered/shadowed surface.
function renderOrderRow(order, live, index) {
  const status = live ? live.status : null;
  const pillClass = status ? STATUS_PILL[status] || "bg-cream-alt text-muted" : "bg-cream-alt text-muted";
  const label = status ? STATUS_LABEL[status] || status : "Not found";
  return `
    <a href="order-status.html?code=${encodeURIComponent(order.code)}" style="animation-delay:${index * 50}ms" class="opacity-0 animate-fade-in-up flex items-center justify-between gap-4 py-5 border-b border-line last:border-b-0 hover:bg-cream-alt -mx-2 px-2 transition-colors duration-150">
      <div class="min-w-0">
        <p class="text-lg font-bold text-ink truncate">${escapeHtml(order.restaurantName || "")}</p>
        <p class="text-xs text-muted mt-0.5">#${escapeHtml(order.code)}${live ? ` &middot; ${escapeHtml(formatPrice(live.total_amount))}` : ""}</p>
      </div>
      <span class="badge flex-shrink-0 ${pillClass}">${escapeHtml(label)}</span>
    </a>
  `;
}

async function loadMyOrders() {
  const orders = getMyOrders();
  if (orders.length === 0) {
    emptyState();
    return;
  }

  pageContent.innerHTML = orders.map((o, i) => renderOrderRow(o, null, i)).join("");

  const results = await Promise.all(
    orders.map(async (o) => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/orders/${encodeURIComponent(o.code)}/`);
        if (!response.ok) return null;
        return await response.json();
      } catch (err) {
        return null;
      }
    })
  );

  pageContent.innerHTML = orders.map((o, i) => renderOrderRow(o, results[i], i)).join("");
}

loadMyOrders();
