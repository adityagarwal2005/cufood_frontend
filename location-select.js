const API_BASE_URL = "https://cufood-backend.onrender.com";

const locationList = document.getElementById("location-list");

const LOCATION_ICONS = {
  fr: "🍔",
  pentagon: "🍕",
};
const DEFAULT_LOCATION_ICON = "🍽️";

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

  locations.forEach((location) => {
    const icon = LOCATION_ICONS[location.slug] || DEFAULT_LOCATION_ICON;

    const card = document.createElement("a");
    card.className =
      "flex flex-col items-center gap-3.5 bg-white border border-line rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1.5 active:translate-y-0 transition-all duration-300 px-8 py-10 sm:px-10 sm:py-12 text-inherit no-underline";
    card.href = `index.html?location=${encodeURIComponent(location.slug)}`;
    card.innerHTML = `
      <span class="text-5xl leading-none">${icon}</span>
      <span class="text-lg font-bold text-ink">${escapeHtml(location.name)}</span>
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
