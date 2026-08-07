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
  completed: "bg-stone-100 text-muted",
  rejected: "bg-stone-100 text-muted",
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
    <div class="text-center bg-white border border-line rounded-2xl shadow-sm px-7 py-14">
      <span class="flex items-center justify-center w-14 h-14 rounded-full bg-accent-soft text-accent mx-auto mb-4 p-3.5">${ICONS.cart}</span>
      <p class="text-muted text-[15px] mb-4">No orders placed from this device yet.</p>
      <a href="location-select.html" class="text-accent-deep font-bold hover:underline">Browse outlets</a>
    </div>
  `;
}

function renderOrderRow(order, live, index) {
  const status = live ? live.status : null;
  const pillClass = status ? STATUS_PILL[status] || "bg-stone-100 text-muted" : "bg-stone-100 text-muted";
  const label = status ? STATUS_LABEL[status] || status : "Not found";
  return `
    <a href="order-status.html?code=${encodeURIComponent(order.code)}" style="animation-delay:${index * 50}ms" class="opacity-0 animate-fade-in-up block bg-white border border-line rounded-xl px-5 py-4 mb-3 last:mb-0 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-extrabold text-ink">${escapeHtml(order.restaurantName || "")} <span class="text-muted font-semibold">· #${escapeHtml(order.code)}</span></p>
          ${live ? `<p class="text-sm text-ink mt-1">${escapeHtml(formatPrice(live.total_amount))}</p>` : ""}
        </div>
        <span class="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full flex-shrink-0 ${pillClass}">${escapeHtml(label)}</span>
      </div>
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
