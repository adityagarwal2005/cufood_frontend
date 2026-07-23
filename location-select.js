const API_BASE_URL = "https://cufood-backend.onrender.com";

const locationList = document.getElementById("location-list");

const LOCATION_ICONS = {
  fr: "🍔",
  pentagon: "🍕",
};
const DEFAULT_LOCATION_ICON = "🍽️";

// Alternating gradient treatments so the grid doesn't look flat/repetitive.
const CARD_THEMES = [
  "from-accent to-accent-deep",
  "from-[#3d372f] to-ink",
];

// Escapes for both HTML text-node and attribute-value contexts — the
// div.textContent/innerHTML round-trip alone only escapes &, <, > and
// leaves quotes untouched, which is unsafe when the result is later
// concatenated into a quoted HTML attribute.
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Fetches one location's outlet counts and fills its card's live status/stat.
// Returns {total, open} so the caller can build the aggregate hero stat bar.
async function loadLocationStat(slug, card) {
  const statusEl = card.querySelector("[data-location-status]");
  const statEl = card.querySelector("[data-location-stat]");
  try {
    const response = await fetch(`${API_BASE_URL}/api/restaurants/?location=${encodeURIComponent(slug)}`);
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const restaurants = await response.json();
    const total = restaurants.length;
    const open = restaurants.filter((r) => r.is_open_today).length;

    const outletWord = total === 1 ? "outlet" : "outlets";
    statEl.textContent = `${total} ${outletWord}`;

    if (open > 0) {
      statusEl.innerHTML = `
        <span class="relative flex w-2 h-2">
          <span class="absolute inline-flex w-full h-full rounded-full bg-emerald-300 opacity-75 animate-ping"></span>
          <span class="relative inline-flex w-2 h-2 rounded-full bg-emerald-300"></span>
        </span>
        ${open} open now`;
      statusEl.className =
        "inline-flex items-center gap-1.5 rounded-full bg-white/15 border border-white/25 backdrop-blur px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white";
    } else {
      statusEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-white/50"></span>Closed`;
      statusEl.className =
        "inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white/70";
    }
    return { total, open };
  } catch (err) {
    statEl.textContent = "";
    statusEl.remove();
    console.error(err);
    return { total: 0, open: 0 };
  }
}

function updateStatBar(locationCount, totals) {
  const el = (id) => document.getElementById(id);
  if (el("stat-locations")) el("stat-locations").textContent = locationCount;
  if (el("stat-outlets")) el("stat-outlets").textContent = totals.total;
  if (el("stat-open")) el("stat-open").textContent = totals.open;
}

function renderLocations(locations) {
  locationList.innerHTML = "";

  if (locations.length === 0) {
    locationList.innerHTML =
      '<p class="col-span-full text-sm font-medium text-muted">No locations available yet.</p>';
    return [];
  }

  return locations.map((location, index) => {
    const icon = LOCATION_ICONS[location.slug] || DEFAULT_LOCATION_ICON;
    const theme = CARD_THEMES[index % CARD_THEMES.length];
    const hasPhoto = !!location.photo;

    const card = document.createElement("a");
    card.className =
      `group relative flex flex-col overflow-hidden ${hasPhoto ? "bg-stone-800" : `bg-gradient-to-br ${theme}`} rounded-3xl shadow-lg ring-1 ring-black/5 hover:shadow-2xl hover:-translate-y-1.5 active:translate-y-0 transition-all duration-300 p-5 sm:p-6 h-40 sm:h-44 text-inherit no-underline`;
    card.href = `index.html?location=${encodeURIComponent(location.slug)}`;

    const photoLayer = hasPhoto
      ? `
        <span class="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110" style="background-image:url('${escapeHtml(location.photo)}')"></span>
        <span class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/10"></span>
      `
      : `
        <span class="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-white/10 blur-2xl transition-transform duration-500 group-hover:scale-125"></span>
        <span class="absolute -bottom-16 -left-10 w-44 h-44 rounded-full bg-white/10 blur-2xl"></span>
      `;

    card.innerHTML = `
      ${photoLayer}
      <span class="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12"></span>

      <span class="relative flex items-start justify-between gap-3">
        <span class="flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-white/15 border border-white/25 backdrop-blur text-xl sm:text-2xl leading-none shadow-inner transition-transform duration-300 group-hover:scale-110">${icon}</span>
        <span data-location-status class="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white/70">
          <span class="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse"></span>Loading
        </span>
      </span>

      <span class="relative mt-auto pt-4 flex items-end justify-between gap-3">
        <span class="flex flex-col min-w-0">
          <span class="text-lg sm:text-xl font-extrabold text-white tracking-tight leading-tight truncate">${escapeHtml(location.name)}</span>
          <span class="text-xs sm:text-sm font-semibold text-white/70 mt-0.5" data-location-stat>Loading&hellip;</span>
        </span>
        <span class="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/15 border border-white/25 backdrop-blur text-white transition-all duration-300 group-hover:bg-white group-hover:text-accent-deep group-hover:translate-x-0.5 flex-shrink-0">
          <span class="w-4 h-4">${ICONS.arrowRight}</span>
        </span>
      </span>
    `;
    locationList.appendChild(card);
    return { location, card };
  });
}

async function loadLocations() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/locations/`);
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const locations = await response.json();
    const rendered = renderLocations(locations);

    const results = await Promise.all(
      rendered.map(({ location, card }) => loadLocationStat(location.slug, card))
    );
    const totals = results.reduce(
      (acc, r) => ({ total: acc.total + r.total, open: acc.open + r.open }),
      { total: 0, open: 0 }
    );
    updateStatBar(locations.length, totals);
  } catch (err) {
    locationList.innerHTML =
      '<p class="col-span-full text-sm font-medium text-muted">Could not load locations. Is the backend running?</p>';
    console.error(err);
  }
}

loadLocations();
