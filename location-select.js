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

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderLocations(locations) {
  locationList.innerHTML = "";

  if (locations.length === 0) {
    locationList.innerHTML =
      '<p class="col-span-2 text-sm font-medium text-muted">No locations available yet.</p>';
    return;
  }

  locations.forEach((location, index) => {
    const icon = LOCATION_ICONS[location.slug] || DEFAULT_LOCATION_ICON;
    const theme = CARD_THEMES[index % CARD_THEMES.length];

    const card = document.createElement("a");
    card.className =
      `group relative flex flex-col items-center gap-4 overflow-hidden bg-gradient-to-br ${theme} rounded-3xl shadow-lg hover:shadow-2xl hover:-translate-y-2 active:translate-y-0 transition-all duration-300 px-8 py-12 sm:px-10 sm:py-14 text-inherit no-underline`;
    card.href = `index.html?location=${encodeURIComponent(location.slug)}`;
    card.innerHTML = `
      <span class="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-white/10 blur-2xl transition-transform duration-500 group-hover:scale-125"></span>
      <span class="absolute -bottom-14 -left-10 w-40 h-40 rounded-full bg-white/10 blur-2xl"></span>
      <span class="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-white/15 border border-white/25 backdrop-blur text-4xl leading-none shadow-inner transition-transform duration-300 group-hover:scale-110">${icon}</span>
      <span class="relative flex flex-col items-center gap-1">
        <span class="text-xl font-extrabold text-white tracking-tight">${escapeHtml(location.name)}</span>
        <span class="inline-flex items-center gap-1 text-xs font-semibold text-white/80 uppercase tracking-wide">
          Explore outlets
          <span class="transition-transform duration-300 group-hover:translate-x-1">&rarr;</span>
        </span>
      </span>
    `;
    locationList.appendChild(card);
  });
}

async function loadLocations() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/locations/`);
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const locations = await response.json();
    renderLocations(locations);
  } catch (err) {
    locationList.innerHTML =
      '<p class="col-span-2 text-sm font-medium text-muted">Could not load locations. Is the backend running?</p>';
    console.error(err);
  }
}

loadLocations();
