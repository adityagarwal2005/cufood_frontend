// Superuser-only sales report over a date range (see AdminReportView).
// admin-dashboard.html answers "how is today going"; this answers "how did
// outlet X do between two dates".
//
// The whole report arrives in one response, so opening an outlet or a day
// is pure show/hide — no refetch, no spinner. That's what makes drilling
// in feel instant, and it's why everything starts collapsed: the point is
// to see one outlet at a time, not a wall of numbers.

const API_BASE_URL = "https://cufood-backend-832534179056.asia-south1.run.app";
const ADMIN_TOKEN_KEY = "cufood_admin_token";

const pageContent = document.getElementById("page-content");
const startInput = document.getElementById("start-date");
const endInput = document.getElementById("end-date");

function getToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

function authHeaders() {
  return { Authorization: `Token ${getToken()}` };
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : text;
  return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatPrice(price) {
  const value = parseFloat(price);
  if (Number.isNaN(value)) return "₹0";
  return Number.isInteger(value) ? `₹${value}` : `₹${value.toFixed(2)}`;
}

// "2026-08-27" -> "Thu 27 Aug". Built from the parts rather than
// new Date(str) so it can't shift a day in a non-IST browser.
function formatDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function toIsoDate(dt) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function statTile(label, value, tone) {
  const toneClass = tone === "accent" ? "text-accent-deep" : tone === "error" ? "text-error" : "text-ink";
  return `
    <div class="flex-1 min-w-[130px] bg-cream-alt border border-line rounded-2xl px-5 py-4">
      <p class="text-2xl font-black ${toneClass} leading-none tabular-nums">${escapeHtml(value)}</p>
      <p class="text-xs font-semibold text-muted uppercase tracking-wide mt-1.5">${escapeHtml(label)}</p>
    </div>
  `;
}

function renderItemRows(items) {
  if (!items.length) {
    return '<p class="text-xs text-muted py-2">No items recorded.</p>';
  }
  return `
    <table class="w-full border-collapse">
      <tbody>
        ${items
          .map(
            (item) => `
          <tr class="border-b border-line last:border-b-0">
            <td class="py-2 pr-3 text-sm text-ink">${escapeHtml(item.name)}</td>
            <td class="py-2 px-3 text-sm font-bold text-ink text-right tabular-nums whitespace-nowrap">${item.quantity}&times;</td>
            <td class="py-2 pl-3 text-sm text-muted text-right tabular-nums whitespace-nowrap">${escapeHtml(formatPrice(item.revenue))}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderDay(day, restaurantIndex, dayIndex) {
  const id = `day-${restaurantIndex}-${dayIndex}`;
  const orderWord = day.orders === 1 ? "order" : "orders";
  return `
    <div class="border-b border-line last:border-b-0">
      <button type="button" data-toggle="${id}"
        class="w-full flex items-center justify-between gap-3 py-3 text-left hover:opacity-80 transition-opacity duration-150">
        <span class="flex items-center gap-2 min-w-0">
          <span class="w-3.5 h-3.5 text-muted flex-shrink-0 transition-transform duration-150" data-chevron="${id}">${ICONS.chevronDown}</span>
          <span class="text-sm font-bold text-ink truncate">${escapeHtml(formatDay(day.date))}</span>
        </span>
        <span class="flex items-center gap-3 flex-shrink-0">
          <span class="text-xs text-muted tabular-nums">${day.orders} ${orderWord}</span>
          <span class="text-sm font-bold text-ink tabular-nums">${escapeHtml(formatPrice(day.sales))}</span>
        </span>
      </button>
      <div id="${id}" class="hidden pb-3 pl-6">${renderItemRows(day.items)}</div>
    </div>
  `;
}

// What to send this outlet for the range, and where. The amount comes from
// the server (accepted orders less the platform fee) so it can never
// disagree with the sales figures around it.
function renderPayout(rest) {
  const upi = rest.upi_id || "";
  return `
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent-soft px-5 py-4 mb-5">
      <div class="min-w-0">
        <p class="text-xs font-bold uppercase tracking-widest text-accent-deep">Pay this outlet</p>
        <p class="text-2xl font-black text-ink tabular-nums leading-tight mt-1">${escapeHtml(formatPrice(rest.payout))}</p>
        <p class="text-xs mt-1 break-all ${upi ? "text-muted" : "text-error"}">${
          upi ? escapeHtml(upi) : "No UPI ID on file. Ask the outlet to add one in their dashboard."
        }</p>
      </div>
      ${upi ? `<button type="button" data-copy="${escapeHtml(upi)}" class="btn-secondary btn-sm">Copy UPI ID</button>` : ""}
    </div>
  `;
}

function renderRestaurant(rest, index) {
  const id = `rest-${index}`;
  // Rejections get a badge only when there are any — a "0 rejected" chip on
  // every row is noise that makes the real ones harder to spot.
  const rejectedBadge = rest.rejected_orders
    ? `<span class="badge-error">${rest.rejected_orders} rejected</span>`
    : "";
  const awaitingBadge = rest.awaiting_decision
    ? `<span class="badge-muted">${rest.awaiting_decision} undecided</span>`
    : "";
  return `
    <div class="bg-cream-alt border border-line rounded-2xl overflow-hidden mb-3">
      <button type="button" data-toggle="${id}"
        class="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-cream transition-colors duration-150">
        <span class="flex items-center gap-3 min-w-0">
          <span class="w-4 h-4 text-muted flex-shrink-0 transition-transform duration-150" data-chevron="${id}">${ICONS.chevronDown}</span>
          <span class="flex flex-col min-w-0">
            <span class="text-lg font-black tracking-tight text-ink truncate">${escapeHtml(rest.restaurant_name)}</span>
            <span class="text-xs text-muted truncate">${escapeHtml(rest.location_name)}</span>
          </span>
        </span>
        <span class="flex items-center gap-3 flex-shrink-0">
          ${awaitingBadge}
          ${rejectedBadge}
          <span class="flex flex-col items-end">
            <span class="text-lg font-black text-ink tabular-nums leading-none">${escapeHtml(formatPrice(rest.total_sales))}</span>
            <span class="text-xs text-muted mt-1 tabular-nums">${rest.successful_orders} successful</span>
          </span>
        </span>
      </button>

      <div id="${id}" class="hidden border-t border-line px-5 py-4">
        ${renderPayout(rest)}
        <div class="flex flex-wrap gap-3 mb-5">
          ${statTile("Successful", String(rest.successful_orders), "accent")}
          ${statTile("Picked up", String(rest.picked_up))}
          ${statTile("Rejected", String(rest.rejected_orders), rest.rejected_orders ? "error" : undefined)}
          ${statTile("Sales", formatPrice(rest.total_sales))}
          ${statTile("Platform fee", formatPrice(rest.platform_revenue), "accent")}
        </div>
        <h4 class="text-xs font-bold uppercase tracking-widest text-muted mb-1">Day by day</h4>
        ${
          rest.days.length
            ? `<div>${rest.days.map((d, i) => renderDay(d, index, i)).join("")}</div>`
            : '<p class="text-sm text-muted py-3">No successful orders in this range.</p>'
        }
      </div>
    </div>
  `;
}

function render(data) {
  const t = data.totals;
  if (!data.restaurants.length) {
    pageContent.innerHTML = `
      <div class="state-shell">
        <span class="state-icon">${ICONS.plate}</span>
        <p class="text-muted text-base">No orders between ${escapeHtml(formatDay(data.start))} and ${escapeHtml(formatDay(data.end))}.</p>
      </div>
    `;
    return;
  }

  pageContent.innerHTML = `
    <section class="mb-6">
      <h2 class="text-xs font-bold uppercase tracking-widest text-muted mb-3">
        ${escapeHtml(formatDay(data.start))} &ndash; ${escapeHtml(formatDay(data.end))}
      </h2>
      <div class="flex flex-wrap gap-3">
        ${statTile("Successful orders", String(t.successful_orders), "accent")}
        ${statTile("Total sales", formatPrice(t.total_sales))}
        ${statTile("Owed to outlets", formatPrice(t.payout))}
        ${statTile("Platform fee", formatPrice(t.platform_revenue), "accent")}
        ${statTile("Rejected", String(t.rejected_orders), t.rejected_orders ? "error" : undefined)}
        ${statTile("Refunded", formatPrice(t.refunded_amount), t.rejected_orders ? "error" : undefined)}
      </div>
      ${
        t.awaiting_decision
          ? `<p class="text-xs text-muted mt-3">${t.awaiting_decision} paid ${
              t.awaiting_decision === 1 ? "order is" : "orders are"
            } still waiting on the outlet to accept or reject, so ${
              t.awaiting_decision === 1 ? "it isn't" : "they aren't"
            } counted above.</p>`
          : ""
      }
    </section>

    <h3 class="text-xs font-bold uppercase tracking-widest text-muted mb-3">By outlet</h3>
    ${data.restaurants.map(renderRestaurant).join("")}
  `;
}

// One delegated listener for every accordion on the page, rather than
// rebinding after each render.
pageContent.addEventListener("click", (event) => {
  const copyBtn = event.target.closest("[data-copy]");
  if (copyBtn) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(copyBtn.dataset.copy).then(() => {
      copyBtn.textContent = "Copied";
      setTimeout(() => (copyBtn.textContent = "Copy UPI ID"), 1500);
    }).catch(() => {});
    return;
  }
  const btn = event.target.closest("[data-toggle]");
  if (!btn) return;
  const id = btn.dataset.toggle;
  const panel = document.getElementById(id);
  if (!panel) return;
  const nowOpen = panel.classList.toggle("hidden") === false;
  const chevron = document.querySelector(`[data-chevron="${CSS.escape(id)}"]`);
  if (chevron) chevron.classList.toggle("rotate-180", nowOpen);
});

function errorState(message) {
  pageContent.innerHTML = `
    <div class="state-shell">
      <span class="state-icon">${ICONS.warning}</span>
      <p class="text-muted text-base">${escapeHtml(message)}</p>
    </div>
  `;
}

async function loadReport() {
  const start = startInput.value;
  const end = endInput.value;
  pageContent.innerHTML = '<div class="h-28 skel rounded-2xl mb-4"></div><div class="h-20 skel rounded-2xl"></div>';
  try {
    const qs = `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    const response = await fetch(`${API_BASE_URL}/api/admin/report/${qs}`, { headers: authHeaders() });
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      window.location.href = "admin-login.html";
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      errorState(data.detail || "Could not load the report. Please try again.");
      return;
    }
    render(data);
  } catch (err) {
    errorState("Could not reach the server. Please try again.");
    console.error(err);
  }
}

function setRange(startDate, endDate) {
  startInput.value = toIsoDate(startDate);
  endInput.value = toIsoDate(endDate);
}

document.getElementById("presets").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-days], [data-month]");
  if (!btn) return;
  const today = new Date();
  if (btn.dataset.month) {
    setRange(new Date(today.getFullYear(), today.getMonth(), 1), today);
  } else {
    const from = new Date(today);
    from.setDate(from.getDate() - Number(btn.dataset.days));
    setRange(from, today);
  }
  document.querySelectorAll("#presets .chip").forEach((c) => c.classList.remove("chip-active"));
  btn.classList.add("chip-active");
  loadReport();
});

document.getElementById("apply-btn").addEventListener("click", () => {
  // A hand-picked range is no longer one of the presets.
  document.querySelectorAll("#presets .chip").forEach((c) => c.classList.remove("chip-active"));
  loadReport();
});

document.getElementById("logout-btn").addEventListener("click", () => {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  window.location.href = "admin-login.html";
});

if (!getToken()) {
  window.location.href = "admin-login.html";
} else {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 6);
  setRange(weekAgo, today);
  document.querySelector('#presets [data-days="6"]').classList.add("chip-active");
  loadReport();
}
