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

// The backend only sends orders that were actually paid for (see
// StudentOrdersView), so every row here is real: either the student got
// their food, or they got their money back. Nothing in this list is a
// dead checkout they abandoned.
//
// Three outcomes matter to a student looking back at their history:
// it's happening now, it went through, or the outlet turned it down and
// they were refunded. The pills say exactly that rather than exposing
// internal status names.
const OUTCOME = {
  placed: { label: "Ongoing", pill: "badge-accent", note: null },
  preparing: { label: "Being prepared", pill: "badge-accent", note: null },
  ready: { label: "Ready for pickup", pill: "badge-accent", note: "Go collect it — show your code at the counter." },
  completed: { label: "Completed", pill: "badge-success", note: null },
  rejected: { label: "Declined by outlet", pill: "badge-error", note: "Refunded to the way you paid." },
};

// Same row, different story: nobody answered rather than someone said no.
const AUTO_DECLINED_OUTCOME = {
  label: "Not accepted",
  pill: "badge-error",
  note: "The outlet didn't confirm in time — refunded.",
};

const ONGOING = ["placed", "preparing", "ready"];

// "Today" / "Yesterday" / "3 Sept" — a student thinks about their orders
// in terms of when, and an absolute timestamp reads like a receipt.
function formatWhen(iso) {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const today = new Date();
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(then)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

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
      <p class="text-muted text-base mb-4">No orders yet — once you order something, it'll show up here.</p>
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
  const outcome =
    (order.status === "rejected" && order.auto_declined && AUTO_DECLINED_OUTCOME) ||
    OUTCOME[order.status] ||
    { label: order.status, pill: "badge-muted", note: null };
  const when = formatWhen(order.created_at);
  const items = (order.items || [])
    .map((i) => `${i.quantity}x ${escapeHtml(i.name)}`)
    .join(", ");
  return `
    <a href="order-status.html?code=${encodeURIComponent(order.order_code)}" style="animation-delay:${index * 50}ms" class="opacity-0 animate-fade-in-up flex items-start justify-between gap-4 py-5 border-b border-line last:border-b-0 hover:bg-cream-alt -mx-2 px-2 transition-colors duration-150">
      <div class="min-w-0">
        <p class="text-lg font-bold text-ink truncate">${escapeHtml(order.restaurant_name || "")}</p>
        ${items ? `<p class="text-xs text-muted mt-0.5 truncate">${items}</p>` : ""}
        <p class="text-xs text-muted mt-0.5">
          ${when ? `${escapeHtml(when)} &middot; ` : ""}#${escapeHtml(order.order_code)} &middot; ${escapeHtml(formatPrice(order.total_amount))}
        </p>
        ${outcome.note ? `<p class="text-xs text-muted mt-1">${escapeHtml(outcome.note)}</p>` : ""}
      </div>
      <span class="${outcome.pill} flex-shrink-0">${escapeHtml(outcome.label)}</span>
    </a>
  `;
}

// Anything still in flight goes above the history, under its own heading —
// a student opening this page mid-order is looking for that one first, and
// it would otherwise just be the top row of an undifferentiated list.
function renderSections(orders) {
  const ongoing = orders.filter((o) => ONGOING.includes(o.status));
  const past = orders.filter((o) => !ONGOING.includes(o.status));
  const section = (title, rows, offset) =>
    rows.length
      ? `<h2 class="text-xs font-bold uppercase tracking-widest text-muted mt-2 mb-1">${title}</h2>
         ${rows.map((o, i) => renderOrderRow(o, offset + i)).join("")}`
      : "";
  return (
    section("Ongoing", ongoing, 0) +
    (past.length && ongoing.length ? '<div class="h-6"></div>' : "") +
    section("Past orders", past, ongoing.length)
  );
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
    pageContent.innerHTML = renderSections(orders);
  } catch (err) {
    errorState();
    console.error(err);
  }
}

loadMyOrders();
