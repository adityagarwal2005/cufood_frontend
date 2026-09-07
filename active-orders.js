// "Orders" panel shown on the browsing pages (location picker + outlet
// list) so a signed-in student can see a live order without hunting for
// it: what stage it's at and roughly how long is left, plus a short tail
// of past orders. Full history still lives on my-orders.html.
//
// Loaded AFTER each page's own script, since API_BASE_URL is declared
// there (app.js / location-select.js), not here.

const ACTIVE_ORDER_STATUSES = ["placed", "preparing", "ready"];
const PAST_ORDER_STATUSES = ["completed", "rejected"];
const MAX_PAST_SHOWN = 3;
// Only polls while something is actually in progress — a student with no
// live order shouldn't be generating background traffic.
const ORDERS_POLL_MS = 30000;

let ordersPanelTimer = null;

function ordersEscape(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : text;
  return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function ordersFormatPrice(price) {
  if (price === null || price === undefined) return "";
  const value = parseFloat(price);
  if (Number.isNaN(value)) return "";
  return Number.isInteger(value) ? `₹${value}` : `₹${value.toFixed(2)}`;
}

// Mirrors order-status.js's own stage wording so the two never disagree
// about what the same order is doing.
function activeOrderStage(order) {
  if (order.status === "ready") {
    return { label: "Ready for pickup", detail: "Go collect it now.", live: true };
  }
  if (order.status === "preparing") {
    const eta = order.estimated_ready_at ? new Date(order.estimated_ready_at) : null;
    if (eta) {
      const mins = Math.round((eta - new Date()) / 60000);
      return {
        label: "Being prepared",
        detail: mins <= 0 ? "Ready any moment now" : `Ready in about ${mins} min`,
        live: true,
      };
    }
    return { label: "Being prepared", detail: "The outlet is on it.", live: true };
  }
  // "placed" and paid. Worded as done, not pending, to match
  // order-status.js: the student has paid and their part is finished —
  // what's left is the outlet's, and either outcome is handled for them.
  return { label: "Order placed", detail: "With the outlet — they'll confirm shortly.", live: false };
}

function renderActiveOrderCard(order) {
  const stage = activeOrderStage(order);
  const items = (order.items || [])
    .map((i) => `${i.quantity}x ${ordersEscape(i.name)}`)
    .join(", ");
  return `
    <a href="order-status.html?code=${encodeURIComponent(order.order_code)}"
       class="block bg-cream-alt border-2 border-accent rounded-2xl px-5 py-4 hover:-translate-y-0.5 transition-transform duration-150">
      <div class="flex items-center justify-between gap-3 mb-1.5">
        <span class="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-accent-deep">
          <span class="relative flex w-2 h-2">
            ${stage.live ? `<span class="absolute inline-flex w-full h-full rounded-full bg-accent opacity-70 animate-ping"></span>` : ""}
            <span class="relative inline-flex w-2 h-2 rounded-full bg-accent"></span>
          </span>
          ${ordersEscape(stage.label)}
        </span>
        <span class="text-xs font-bold text-muted">#${ordersEscape(order.order_code)}</span>
      </div>
      <p class="text-lg font-black tracking-tight text-ink leading-tight">${ordersEscape(order.restaurant_name)}</p>
      <p class="text-xs text-muted mt-0.5 truncate">${items}</p>
      <p class="text-sm font-bold text-accent-deep mt-2">${ordersEscape(stage.detail)}</p>
    </a>
  `;
}

function renderPastOrderRow(order) {
  // Same vocabulary as my-orders.js — a student shouldn't meet two
  // different words for the same outcome on two different screens.
  const label = order.status !== "rejected"
    ? "Completed"
    : order.auto_declined
      ? "Not accepted — refunded"
      : order.payment_status === "refunded"
        ? "Declined — refunded"
        : "Declined by outlet";
  return `
    <a href="order-status.html?code=${encodeURIComponent(order.order_code)}"
       class="flex items-center justify-between gap-3 py-2.5 border-b border-line last:border-b-0 hover:opacity-80 transition-opacity duration-150">
      <span class="text-sm font-semibold text-ink truncate">${ordersEscape(order.restaurant_name)}</span>
      <span class="flex items-center gap-3 flex-shrink-0">
        <span class="text-xs text-muted">${ordersEscape(ordersFormatPrice(order.total_amount))}</span>
        <span class="text-xs font-bold uppercase tracking-wide text-muted">${label}</span>
      </span>
    </a>
  `;
}

function renderOrdersPanel(orders) {
  const el = document.getElementById("active-orders");
  if (!el) return;

  const active = orders.filter(
    (o) => o.payment_status === "paid" && ACTIVE_ORDER_STATUSES.includes(o.status)
  );
  const past = orders
    .filter((o) => PAST_ORDER_STATUSES.includes(o.status))
    .slice(0, MAX_PAST_SHOWN);

  // Nothing worth showing — stay out of the way entirely rather than
  // rendering an empty "Orders" heading above the hero.
  if (active.length === 0 && past.length === 0) {
    el.innerHTML = "";
    return;
  }

  el.innerHTML = `
    <section class="mb-10 sm:mb-12">
      <div class="flex items-center justify-between gap-3 mb-3">
        <h2 class="text-xs font-bold uppercase tracking-widest text-muted">Orders</h2>
        <a href="my-orders.html" class="text-xs font-bold uppercase tracking-wide text-accent-deep hover:underline">View all &rarr;</a>
      </div>
      ${active.length ? `<div class="flex flex-col gap-3">${active.map(renderActiveOrderCard).join("")}</div>` : ""}
      ${past.length ? `
        <div class="${active.length ? "mt-4" : ""} bg-cream-alt border border-line rounded-2xl px-5 py-1">
          ${past.map(renderPastOrderRow).join("")}
        </div>
      ` : ""}
    </section>
  `;

  // Keep the stage/ETA honest while the page sits open, but only while
  // there's actually something in progress.
  clearInterval(ordersPanelTimer);
  if (active.length > 0) {
    ordersPanelTimer = setInterval(loadOrdersPanel, ORDERS_POLL_MS);
  }
}

async function loadOrdersPanel() {
  const el = document.getElementById("active-orders");
  if (!el || !isStudentLoggedIn()) return;
  try {
    const response = await fetch(`${API_BASE_URL}/api/students/orders/`, {
      headers: studentAuthHeaders(),
    });
    if (response.status === 401) {
      clearStudentSession();
      el.innerHTML = "";
      return;
    }
    if (!response.ok) return;
    renderOrdersPanel(await response.json());
  } catch (err) {
    // Silent by design — this is a convenience panel, not the page's
    // reason for existing. The outlets below still load fine without it.
    console.error(err);
  }
}

// This file is loaded last on its pages, so DOMContentLoaded may already
// have fired by the time it runs — in which case the listener would never
// fire and the panel would silently never render. Check readyState first.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadOrdersPanel);
} else {
  loadOrdersPanel();
}

// Same reasoning as order-status.js: a backgrounded tab has no reader, so
// polling it spends requests for nothing. Coming back refreshes at once
// rather than showing stale state until the next tick.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearInterval(ordersPanelTimer);
  } else {
    loadOrdersPanel();
  }
});
