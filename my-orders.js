const API_BASE_URL = "https://cufood-backend-832534179056.asia-south1.run.app";

const pageContent = document.getElementById("page-content");

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

function signedOutState() {
  pageContent.innerHTML = `
    <div class="state-shell">
      <span class="state-icon">${ICONS.user}</span>
      <p class="text-muted text-base mb-4">Sign in to see your order history.</p>
      <a href="student-login.html?next=${encodeURIComponent("my-orders.html")}" class="btn-primary text-sm">Sign in</a>
    </div>
  `;
}

function emptyState() {
  pageContent.innerHTML = `
    <div class="state-shell">
      <span class="state-icon">${ICONS.cart}</span>
      <p class="text-muted text-base mb-4">No orders yet.</p>
      <a href="location-select.html" class="text-accent-deep font-bold hover:underline">Browse outlets</a>
    </div>
  `;
}

function errorState() {
  pageContent.innerHTML = `
    <div class="state-shell">
      <span class="state-icon">${ICONS.warning}</span>
      <p class="text-muted text-base">Could not load your orders. Please try again.</p>
    </div>
  `;
}

// A flat list, not a stack of boxed cards — order history reads more like
// a receipt/ledger than a set of unrelated tiles, so one continuous list
// with a rule between rows fits it better than each row being its own
// bordered/shadowed surface.
function renderOrderRow(order, index) {
  const pillClass = STATUS_PILL[order.status] || "bg-cream-alt text-muted";
  const label = STATUS_LABEL[order.status] || order.status;
  return `
    <a href="order-status.html?code=${encodeURIComponent(order.order_code)}" style="animation-delay:${index * 50}ms" class="opacity-0 animate-fade-in-up flex items-center justify-between gap-4 py-5 border-b border-line last:border-b-0 hover:bg-cream-alt -mx-2 px-2 transition-colors duration-150">
      <div class="min-w-0">
        <p class="text-lg font-bold text-ink truncate">${escapeHtml(order.restaurant_name || "")}</p>
        <p class="text-xs text-muted mt-0.5">#${escapeHtml(order.order_code)} &middot; ${escapeHtml(formatPrice(order.total_amount))}</p>
      </div>
      <span class="badge flex-shrink-0 ${pillClass}">${escapeHtml(label)}</span>
    </a>
  `;
}

async function loadMyOrders() {
  if (!isStudentLoggedIn()) {
    signedOutState();
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/students/orders/`, {
      headers: studentAuthHeaders(),
    });
    if (response.status === 401) {
      clearStudentSession();
      signedOutState();
      return;
    }
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const orders = await response.json();
    if (orders.length === 0) {
      emptyState();
      return;
    }
    pageContent.innerHTML = orders.map((o, i) => renderOrderRow(o, i)).join("");
  } catch (err) {
    errorState();
    console.error(err);
  }
}

loadMyOrders();
