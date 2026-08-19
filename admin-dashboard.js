const API_BASE_URL = "https://cufood-backend-832534179056.asia-south1.run.app";
const ADMIN_TOKEN_KEY = "cufood_admin_token";

const pageContent = document.getElementById("page-content");

function getToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

function authHeaders() {
  return { Authorization: `Token ${getToken()}` };
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatPrice(price) {
  if (price === null || price === undefined) return "₹0";
  const value = parseFloat(price);
  if (Number.isNaN(value)) return "₹0";
  return Number.isInteger(value) ? `₹${value}` : `₹${value.toFixed(2)}`;
}

function statTile(label, value, accent) {
  return `
    <div class="flex-1 min-w-[140px] bg-cream-alt border border-line rounded-2xl px-5 py-4">
      <p class="text-2xl font-black ${accent ? "text-accent-deep" : "text-ink"} leading-none tabular-nums">${escapeHtml(value)}</p>
      <p class="text-xs font-semibold text-muted uppercase tracking-wide mt-1.5">${escapeHtml(label)}</p>
    </div>
  `;
}

function renderPeriodBlock(title, stats) {
  return `
    <div>
      <h3 class="text-xs font-bold uppercase tracking-widest text-muted mb-3">${escapeHtml(title)}</h3>
      <div class="flex flex-wrap gap-3">
        ${statTile("Orders", stats.orders)}
        ${statTile("Total sales", formatPrice(stats.total_sales))}
        ${statTile("Platform revenue", formatPrice(stats.platform_revenue), true)}
      </div>
    </div>
  `;
}

function renderRestaurantTable(rows) {
  if (rows.length === 0) {
    return `<p class="text-sm text-muted py-4">No paid orders on this day yet.</p>`;
  }
  const body = rows.map((r) => `
    <tr class="border-b border-line last:border-b-0">
      <td class="py-3 pr-4">
        <p class="text-sm font-bold text-ink">${escapeHtml(r.restaurant_name)}</p>
        <p class="text-xs text-muted">${escapeHtml(r.location_name)}</p>
      </td>
      <td class="py-3 pr-4 text-sm text-ink text-right tabular-nums">${r.orders}</td>
      <td class="py-3 pr-4 text-sm text-ink text-right tabular-nums">${escapeHtml(formatPrice(r.total_sales))}</td>
      <td class="py-3 text-sm font-bold text-accent-deep text-right tabular-nums">${escapeHtml(formatPrice(r.platform_revenue))}</td>
    </tr>
  `).join("");
  return `
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="border-b border-line">
            <th class="text-left text-xs font-bold uppercase tracking-wide text-muted pb-2">Restaurant</th>
            <th class="text-right text-xs font-bold uppercase tracking-wide text-muted pb-2">Orders</th>
            <th class="text-right text-xs font-bold uppercase tracking-wide text-muted pb-2">Sales</th>
            <th class="text-right text-xs font-bold uppercase tracking-wide text-muted pb-2">Platform rev.</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function renderLocationRow(rows) {
  if (rows.length === 0) return "";
  return `
    <div class="flex flex-wrap gap-3 mt-3">
      ${rows.map((r) => `
        <div class="flex-1 min-w-[160px] bg-cream border border-line rounded-xl px-4 py-3">
          <p class="text-sm font-bold text-ink">${escapeHtml(r.location_name)}</p>
          <p class="text-xs text-muted mt-0.5">${r.orders} orders &middot; ${escapeHtml(formatPrice(r.total_sales))}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function render(data) {
  pageContent.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-4 mb-8">
      <h1 class="text-2xl sm:text-3xl font-black tracking-tightest text-ink">Platform analytics</h1>
      <input type="date" id="date-input" value="${escapeHtml(data.date)}" max="${new Date().toISOString().slice(0, 10)}"
        class="rounded-xl border-2 border-line bg-cream-alt px-3 py-2 text-sm font-semibold text-ink focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft transition-all duration-150">
    </div>

    <div class="mb-8">
      ${statTile("Total registered students", data.total_registered_students, true)}
    </div>

    <div class="flex flex-col gap-6 mb-10">
      ${renderPeriodBlock("Today", data.today)}
      ${renderPeriodBlock("Yesterday", data.yesterday)}
      ${renderPeriodBlock("All time", data.all_time)}
    </div>

    <div class="bg-cream-alt border border-line rounded-2xl p-6 sm:p-7 mb-6">
      <h2 class="text-xs font-bold uppercase tracking-widest text-muted mb-4">Refunds &middot; all time</h2>
      <div class="flex flex-wrap gap-3">
        ${statTile("Refunded orders", data.refunds.count)}
        ${statTile("Refunded amount", formatPrice(data.refunds.total_amount))}
      </div>
    </div>

    <div class="bg-cream-alt border border-line rounded-2xl p-6 sm:p-7">
      <h2 class="text-xs font-bold uppercase tracking-widest text-muted mb-1">By restaurant &middot; ${escapeHtml(data.date)}</h2>
      ${renderRestaurantTable(data.by_restaurant)}
      ${renderLocationRow(data.by_location)}
    </div>
  `;

  document.getElementById("date-input").addEventListener("change", (e) => {
    if (e.target.value) loadStats(e.target.value);
  });
}

function errorState(message) {
  pageContent.innerHTML = `
    <div class="state-shell">
      <span class="state-icon">${ICONS.warning}</span>
      <p class="text-muted text-base">${escapeHtml(message)}</p>
    </div>
  `;
}

async function loadStats(dateStr) {
  try {
    const qs = dateStr ? `?date=${encodeURIComponent(dateStr)}` : "";
    const response = await fetch(`${API_BASE_URL}/api/admin/stats/${qs}`, { headers: authHeaders() });
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      window.location.href = "admin-login.html";
      return;
    }
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const data = await response.json();
    render(data);
  } catch (err) {
    errorState("Could not load analytics. Please try again.");
    console.error(err);
  }
}

document.getElementById("logout-btn").addEventListener("click", () => {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  window.location.href = "admin-login.html";
});

if (!getToken()) {
  window.location.href = "admin-login.html";
} else {
  loadStats();
}
