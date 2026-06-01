// ============================================================
//  CAIRO MINIBUS FINDER — app.js v2
// ============================================================

// ---- CONFIG — change ADMIN_EMAIL to your real email ----
const ADMIN_EMAIL = 'your@email.com';
const DB_NAME     = 'cairoBusDB';
const DB_VERSION  = 2;   // bumped from v1 to trigger migration
const STORE       = 'routes';

// ---- STATE ----
let db        = null;
let allRoutes = [];
let routeMap  = null;  // Leaflet map for full route view
let nearMap   = null;  // Leaflet map for near-you section

// ============================================================
//  BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  db        = await openDB();
  await loadSeedData();
  allRoutes = await getAllRoutes();
  setupUI();
  applyTheme(localStorage.getItem('theme') || 'dark');
  document.getElementById('suggestLink').href =
    `mailto:${ADMIN_EMAIL}?subject=Cairo Minibus — New Line Suggestion`;
  updateRouteCount();
});

// ============================================================
//  INDEXEDDB
// ============================================================
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE)) {
        d.createObjectStore(STORE, { keyPath: 'id' });
      }
      // Migrate v1 data to v2 format on upgrade
      if (e.oldVersion > 0 && e.oldVersion < 2) {
        const store = e.target.transaction.objectStore(STORE);
        const all   = store.getAll();
        all.onsuccess = () => {
          all.result.forEach(r => store.put(normalizeRoute(r)));
        };
      }
    };

    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = () => reject(req.error);
  });
}

// Seed data: always refreshes seed routes; never touches user-added ones
async function loadSeedData() {
  try {
    const res   = await fetch('./src/data.json?cb=' + Date.now());
    const seeds = await res.json();
    const tx    = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);

    for (const raw of seeds) {
      const route    = normalizeRoute(raw);
      const existing = await idbGet(store, route.id);
      if (!existing || existing.source === 'seed') {
        store.put(route);
      }
    }
    await txDone(tx);
  } catch (e) {
    console.warn('Seed load failed:', e);
  }
}

// Converts any old or new format route into the current v2 format
function normalizeRoute(r) {
  const route = { ...r };

  // Pricing type: old 'variablePricing' boolean → new 'pricingType' string
  if (!route.pricingType) {
    route.pricingType = route.variablePricing ? 'staged' : 'flat';
  }
  delete route.variablePricing;

  // Old 'zones' array → new 'stages' array
  if (!Array.isArray(route.stages)) {
    if (Array.isArray(route.zones) && route.zones.length) {
      route.stages = route.zones.map(z => ({ label: z.range + ' stops', price: z.price }));
    } else {
      route.stages = [];
    }
  }
  delete route.zones;

  // Stations: plain strings → objects with name/lat/lng
  if (!Array.isArray(route.stations)) route.stations = [];
  route.stations = route.stations.map(s =>
    typeof s === 'string' ? { name: s, lat: null, lng: null } : s
  );

  return route;
}

// ---- DB helpers ----
function idbGet(store, key) {
  return new Promise(res => {
    const r = store.get(key);
    r.onsuccess = () => res(r.result || null);
    r.onerror   = () => res(null);
  });
}

function txDone(tx) {
  return new Promise(res => { tx.oncomplete = res; tx.onerror = res; });
}

function getAllRoutes() {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function putRoute(route) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(route);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

function deleteRoute(id) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

function clearAll() {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ============================================================
//  SEARCH
// ============================================================
function searchByBusNumber(q) {
  return allRoutes.filter(r => r.id.toLowerCase() === q.trim().toLowerCase());
}

function searchByStation(q) {
  const n = q.trim().toLowerCase();
  if (!n) return [];
  return allRoutes.filter(r =>
    r.stations.some(s => s.name.toLowerCase().includes(n))
  );
}

// Finds routes where 'from' station index < 'to' station index
function searchFromTo(from, to) {
  const f = from.trim().toLowerCase();
  const t = to.trim().toLowerCase();
  if (!f || !t) return [];
  return allRoutes.filter(r => {
    const names = r.stations.map(s => s.name.toLowerCase());
    const fi    = names.findIndex(n => n.includes(f));
    const ti    = names.findIndex(n => n.includes(t));
    return fi !== -1 && ti !== -1 && fi < ti;
  });
}

// ============================================================
//  RENDER RESULTS
// ============================================================
function renderResults(routes, highlight = [], containerId = 'results') {
  const el = document.getElementById(containerId);
  el.innerHTML = '';

  if (!routes.length) {
    el.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🚌</div>
        <p>No bus lines found.</p>
        <p class="hint" style="margin-top:4px">Try different spelling or a nearby landmark.</p>
      </div>`;
    return;
  }

  const hl = highlight.map(h => h.toLowerCase()).filter(Boolean);

  routes.forEach(r => {
    // Build pricing display
    let priceHtml = '';
    if (r.pricingType === 'staged' && r.stages.length) {
      priceHtml = r.stages.map(s =>
        `<span class="price-stage">${escHtml(s.label)} — <strong>${s.price} EGP</strong></span>`
      ).join('');
    } else if (r.flatPrice != null) {
      priceHtml = `<span class="price-flat">${r.flatPrice} EGP flat</span>`;
    }

    // Build station tags (highlight matched stops)
    const stationTags = r.stations.map(s => {
      const isMatch = hl.some(h => s.name.toLowerCase().includes(h));
      return `<span class="station-tag${isMatch ? ' match' : ''}">${escHtml(s.name)}</span>`;
    }).join('');

    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="card-header">
        <span class="bus-badge">Bus ${escHtml(r.id)}</span>
        <span class="company-name">${escHtml(r.company || 'Unknown Company')}</span>
        ${r.source === 'user' ? '<span class="source-tag user-tag">local</span>' : ''}
      </div>
      <div class="pricing-row">${priceHtml}</div>
      <div class="stations-wrap">${stationTags}</div>
      <div class="card-actions">
        <button class="map-btn" data-id="${escHtml(r.id)}">🗺 Show on Map</button>
      </div>`;

    card.querySelector('.map-btn').addEventListener('click', () => showMap(r.id));
    el.appendChild(card);
  });
}

// ============================================================
//  MAP — full route display
// ============================================================
async function showMap(routeId) {
  const route = allRoutes.find(r => r.id === routeId);
  if (!route) return;

  const section = document.getElementById('mapSection');
  const status  = document.getElementById('mapStatus');
  section.classList.remove('hidden');
  section.scrollIntoView({ behavior: 'smooth' });

  // Init map once
  if (!routeMap) {
    routeMap = L.map('map').setView([30.0444, 31.2357], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>'
    }).addTo(routeMap);
  } else {
    routeMap.eachLayer(l => {
      if (l instanceof L.Marker || l instanceof L.Polyline) routeMap.removeLayer(l);
    });
  }

  const coords   = [];
  const stations = route.stations;

  for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    status.textContent = `Locating: ${s.name} (${i + 1}/${stations.length})`;

    let coord = null;

    // Prefer manually set coordinates; fall back to Nominatim
    if (s.lat && s.lng) {
      coord = [s.lat, s.lng];
    } else {
      coord = await geocodeStation(s.name);
      if (i < stations.length - 1) await sleep(1100); // Nominatim rate limit: 1 req/sec
    }

    if (coord) {
      coords.push(coord);
      const num = i + 1;
      L.marker(coord, {
        icon: L.divIcon({
          className: '',
          html: `<div class="map-marker">${num}</div>`,
          iconSize: [28, 28], iconAnchor: [14, 14]
        })
      }).addTo(routeMap)
        .bindPopup(`<div dir="rtl" style="font-family:Cairo,sans-serif;font-size:13px">${escHtml(s.name)}</div>`);
    }
  }

  if (coords.length > 1) {
    L.polyline(coords, { color: '#c0392b', weight: 3, opacity: 0.75 }).addTo(routeMap);
    routeMap.fitBounds(L.latLngBounds(coords), { padding: [30, 30] });
  }

  status.textContent = `Bus ${route.id}: ${coords.length}/${stations.length} stops located`;
}

// Geocode a station name via Nominatim, with localStorage caching
async function geocodeStation(name) {
  const key    = 'gc::' + name;
  const cached = localStorage.getItem(key);
  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }
  try {
    const url  = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name + '، القاهرة')}&format=json&limit=1`;
    const res  = await fetch(url, { headers: { 'Accept-Language': 'ar,en' } });
    const data = await res.json();
    if (data.length) {
      const coord = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      localStorage.setItem(key, JSON.stringify(coord));
      return coord;
    }
  } catch {}
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================
//  NEAR YOU — home section
// ============================================================
async function detectNearby() {
  const btn = document.getElementById('detectBtn');
  if (!navigator.geolocation) {
    showToast('Geolocation not supported by your browser.', 'err');
    return;
  }

  btn.textContent = '…';
  btn.disabled    = true;

  navigator.geolocation.getCurrentPosition(
    async pos => {
      const { latitude: lat, longitude: lon } = pos.coords;

      // Init mini map
      if (!nearMap) {
        document.getElementById('nearMap').classList.remove('hidden');
        nearMap = L.map('nearMap').setView([lat, lon], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap'
        }).addTo(nearMap);
      } else {
        nearMap.setView([lat, lon], 14);
        nearMap.eachLayer(l => { if (l instanceof L.Marker) nearMap.removeLayer(l); });
      }

      // Drop "you" pin on the mini map
      L.marker([lat, lon], {
        icon: L.divIcon({
          className: '',
          html: '<div class="map-marker you-marker">YOU</div>',
          iconSize: [36, 28], iconAnchor: [18, 14]
        })
      }).addTo(nearMap).bindPopup('Your location').openPopup();

      // Reverse geocode → get area names → match against stations
      const areaInfo = await reverseGeocode(lat, lon);
      const terms    = Object.values(areaInfo || {}).filter(Boolean).map(v => v.toLowerCase());

      const nearRoutes = terms.length
        ? allRoutes.filter(r =>
            r.stations.some(s =>
              terms.some(t => s.name.toLowerCase().includes(t) || t.includes(s.name.toLowerCase()))
            )
          )
        : [];

      if (nearRoutes.length) {
        renderResults(nearRoutes, terms, 'nearResults');
        showToast(`Found ${nearRoutes.length} bus line${nearRoutes.length > 1 ? 's' : ''} near you.`, 'ok');
      } else {
        document.getElementById('nearResults').innerHTML =
          `<p class="hint" style="padding:10px 0">No bus lines found for your area yet. Add some via Settings.</p>`;
      }

      btn.textContent = '📍 Detect';
      btn.disabled    = false;
    },
    () => {
      showToast('Could not get your location.', 'err');
      btn.textContent = '📍 Detect';
      btn.disabled    = false;
    }
  );
}

// Get area name components from GPS coordinates via Nominatim
async function reverseGeocode(lat, lon) {
  try {
    const url  = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ar`;
    const res  = await fetch(url);
    const data = await res.json();
    return {
      suburb:        data.address?.suburb,
      neighbourhood: data.address?.neighbourhood,
      quarter:       data.address?.quarter,
      road:          data.address?.road,
      district:      data.address?.city_district
    };
  } catch { return null; }
}

// ============================================================
//  GEOLOCATION — pre-fill "From" field in From→To search
// ============================================================
function requestGeoForSearch() {
  const btn = document.getElementById('geoBtn');
  if (!navigator.geolocation) {
    showToast('Geolocation not supported.', 'err');
    return;
  }

  btn.textContent = '…';
  btn.disabled    = true;

  navigator.geolocation.getCurrentPosition(
    async pos => {
      const area = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      const name = area?.suburb || area?.neighbourhood || area?.road;

      if (name) {
        const inp   = document.getElementById('fromInput');
        inp.value   = name;
        inp.style.borderColor = '#c0392b';
        showToast(`Location: ${name}`, 'ok');
      } else {
        showToast('Area not found — type it manually.', '');
      }
      btn.textContent = '📍';
      btn.disabled    = false;
    },
    () => {
      showToast('Could not get location.', 'err');
      btn.textContent = '📍';
      btn.disabled    = false;
    }
  );
}

// ============================================================
//  FORM — build dynamic rows
// ============================================================

// Creates a draggable/reorderable station row with optional coords
function buildStationRow(station = { name: '', lat: null, lng: null }) {
  const row = document.createElement('div');
  row.className = 'station-row';
  row.innerHTML = `
    <div class="station-row-main">
      <input type="text" class="s-name"
             placeholder="Station name / اسم المحطة"
             value="${escHtml(station.name)}" dir="rtl">
      <div class="station-actions">
        <button type="button" class="station-btn up"  title="Move up">↑</button>
        <button type="button" class="station-btn down" title="Move down">↓</button>
        <button type="button" class="station-btn del"  title="Remove">✕</button>
      </div>
    </div>
    <button type="button" class="coords-toggle">▸ Set custom map coordinates (optional)</button>
    <div class="station-coords hidden">
      <div>
        <label>Latitude</label>
        <input type="number" class="s-lat" step="0.00001"
               placeholder="e.g. 30.0444" value="${station.lat || ''}">
      </div>
      <div>
        <label>Longitude</label>
        <input type="number" class="s-lng" step="0.00001"
               placeholder="e.g. 31.2357" value="${station.lng || ''}">
      </div>
    </div>`;

  // Toggle coordinates section
  row.querySelector('.coords-toggle').addEventListener('click', function () {
    const block = row.querySelector('.station-coords');
    const open  = !block.classList.contains('hidden');
    block.classList.toggle('hidden');
    this.textContent = open
      ? '▸ Set custom map coordinates (optional)'
      : '▾ Custom map coordinates';
  });

  // If coords are pre-filled, expand automatically
  if (station.lat || station.lng) {
    row.querySelector('.station-coords').classList.remove('hidden');
    row.querySelector('.coords-toggle').textContent = '▾ Custom map coordinates';
  }

  // Move up/down
  row.querySelector('.up').addEventListener('click', () => {
    const prev = row.previousElementSibling;
    if (prev) row.parentElement.insertBefore(row, prev);
  });
  row.querySelector('.down').addEventListener('click', () => {
    const next = row.nextElementSibling;
    if (next) row.parentElement.insertBefore(next, row);
  });

  // Delete
  row.querySelector('.del').addEventListener('click', () => row.remove());

  return row;
}

// Creates a fare stage row
function buildStageRow(stage = { label: '', price: '' }) {
  const row = document.createElement('div');
  row.className = 'stage-row';
  row.innerHTML = `
    <input type="text"   class="sg-label" placeholder="e.g. Up to 5 stops"
           value="${escHtml(stage.label)}">
    <input type="number" class="sg-price" placeholder="EGP" min="0" step="0.5"
           value="${stage.price || ''}">
    <button type="button" title="Remove stage">✕</button>`;
  row.querySelector('button').addEventListener('click', () => row.remove());
  return row;
}

// Read current station list from form
function getStationsFromForm() {
  return [...document.querySelectorAll('#stationsList .station-row')].map(row => ({
    name: row.querySelector('.s-name').value.trim(),
    lat:  parseFloat(row.querySelector('.s-lat').value)  || null,
    lng:  parseFloat(row.querySelector('.s-lng').value)  || null
  })).filter(s => s.name);
}

// Read current stages list from form
function getStagesFromForm() {
  return [...document.querySelectorAll('#stagesList .stage-row')].map(row => ({
    label: row.querySelector('.sg-label').value.trim(),
    price: parseFloat(row.querySelector('.sg-price').value) || 0
  })).filter(s => s.label);
}

// Reset form to blank state with 3 empty station rows
function clearForm() {
  document.getElementById('editingId').value     = '';
  document.getElementById('fBusId').value        = '';
  document.getElementById('fCompany').value      = '';
  document.getElementById('fFlatPrice').value    = '';
  document.getElementById('stagesList').innerHTML   = '';
  document.getElementById('stationsList').innerHTML = '';
  document.querySelector('input[name="pricingType"][value="flat"]').checked = true;
  document.getElementById('flatPriceRow').classList.remove('hidden');
  document.getElementById('stagesBlock').classList.add('hidden');
  document.getElementById('saveLineBtn').textContent = 'Save Line';
  document.getElementById('cancelEditBtn').classList.add('hidden');
  document.getElementById('formMsg').textContent     = '';
  document.getElementById('formMsg').className       = 'form-msg';
  // Pre-add 3 empty station rows to guide the user
  const list = document.getElementById('stationsList');
  for (let i = 0; i < 3; i++) list.appendChild(buildStationRow());
}

// Pre-fill form with an existing route for editing
function populateForm(route) {
  document.getElementById('editingId').value  = route.id;
  document.getElementById('fBusId').value     = route.id;
  document.getElementById('fCompany').value   = route.company || '';

  const type = route.pricingType || 'flat';
  document.querySelector(`input[name="pricingType"][value="${type}"]`).checked = true;
  document.getElementById('flatPriceRow').classList.toggle('hidden', type !== 'flat');
  document.getElementById('stagesBlock').classList.toggle('hidden', type !== 'staged');

  if (type === 'flat') {
    document.getElementById('fFlatPrice').value = route.flatPrice ?? '';
  } else {
    const list = document.getElementById('stagesList');
    list.innerHTML = '';
    (route.stages || []).forEach(s => list.appendChild(buildStageRow(s)));
  }

  const stList = document.getElementById('stationsList');
  stList.innerHTML = '';
  (route.stations || []).forEach(s => stList.appendChild(buildStationRow(s)));

  document.getElementById('saveLineBtn').textContent = 'Update Line';
  document.getElementById('cancelEditBtn').classList.remove('hidden');
  document.getElementById('formMsg').textContent = '';
  document.getElementById('formMsg').className   = 'form-msg';
}

// ============================================================
//  SETTINGS — All Lines tab
// ============================================================
function renderLinesList() {
  const filterBus  = document.getElementById('filterBus').value.toLowerCase();
  const filterComp = document.getElementById('filterCompany').value.toLowerCase();
  const list       = document.getElementById('linesList');

  const filtered = allRoutes.filter(r => {
    const matchBus  = !filterBus  || r.id.toLowerCase().includes(filterBus);
    const matchComp = !filterComp || (r.company || '').toLowerCase() === filterComp;
    return matchBus && matchComp;
  });

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-lines">No bus lines match your filter.</div>';
    return;
  }

  list.innerHTML = '';

  filtered.forEach(r => {
    const item = document.createElement('div');
    item.className = 'line-item';

    const stationNames = r.stations.map(s => s.name).join(' › ');
    const priceLabel   = r.pricingType === 'flat'
      ? `${r.flatPrice} EGP flat`
      : `${r.stages.length} fare stage${r.stages.length !== 1 ? 's' : ''}`;

    item.innerHTML = `
      <div class="line-item-info">
        <h4>
          <span class="bus-badge">Bus ${escHtml(r.id)}</span>
          ${escHtml(r.company || 'No company')}
        </h4>
        <div class="line-meta">${priceLabel} · ${r.stations.length} stops · ${escHtml(stationNames)}</div>
      </div>
      <div class="line-item-actions">
        <button class="edit-btn">Edit</button>
        <button class="del-btn">Delete</button>
      </div>`;

    // Edit: populate form and switch to form tab
    item.querySelector('.edit-btn').addEventListener('click', () => {
      populateForm(r);
      switchMTab('form');
      document.querySelector('.modal-body').scrollTop = 0;
    });

    // Delete: confirm then remove
    item.querySelector('.del-btn').addEventListener('click', async () => {
      if (!confirm(`Delete Bus ${r.id}? This cannot be undone.`)) return;
      await deleteRoute(r.id);
      allRoutes = await getAllRoutes();
      renderLinesList();
      updateCompanyFilter();
      updateRouteCount();
      showToast(`Bus ${r.id} deleted.`, 'ok');
    });

    list.appendChild(item);
  });
}

function updateCompanyFilter() {
  const sel       = document.getElementById('filterCompany');
  const current   = sel.value;
  const companies = [...new Set(allRoutes.map(r => r.company).filter(Boolean))].sort();

  sel.innerHTML = '<option value="">All companies</option>';
  companies.forEach(c => {
    const opt      = document.createElement('option');
    opt.value      = c.toLowerCase();
    opt.textContent = c;
    if (c.toLowerCase() === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

function updateRouteCount() {
  const el = document.getElementById('routeCount');
  if (el) el.textContent = allRoutes.length;
}

// ============================================================
//  THEME
// ============================================================
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeToggle').textContent = theme === 'dark' ? '☀' : '🌙';
  localStorage.setItem('theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ============================================================
//  MODAL HELPERS
// ============================================================
function openSettings() {
  document.getElementById('settingsModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  renderLinesList();
  updateCompanyFilter();
  updateRouteCount();
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.add('hidden');
  document.body.style.overflow = '';
}

function switchMTab(name) {
  document.querySelectorAll('.mtab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.mtab-pane').forEach(p => p.classList.remove('active'));
  document.querySelector(`.mtab[data-mtab="${name}"]`).classList.add('active');
  document.getElementById(`mtab-${name}`).classList.add('active');
  if (name === 'lines') { renderLinesList(); updateCompanyFilter(); }
  if (name === 'data')   updateRouteCount();
}

// ============================================================
//  UI SETUP — wires all events
// ============================================================
function setupUI() {
  clearForm(); // pre-populate form with 3 empty station rows

  // ---- Header ----
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('settingsBtn').addEventListener('click', openSettings);

  // ---- Search tabs ----
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      document.getElementById('results').innerHTML = '';
      document.getElementById('mapSection').classList.add('hidden');
    });
  });

  // Bus number search
  const doBusSearch = () => {
    const q = document.getElementById('busInput').value.trim();
    if (!q) return;
    renderResults(searchByBusNumber(q));
  };
  document.getElementById('busSearchBtn').addEventListener('click', doBusSearch);
  document.getElementById('busInput').addEventListener('keydown', e => { if (e.key === 'Enter') doBusSearch(); });

  // Station search
  const doStationSearch = () => {
    const q = document.getElementById('stationInput').value.trim();
    if (!q) return;
    renderResults(searchByStation(q), [q]);
  };
  document.getElementById('stationSearchBtn').addEventListener('click', doStationSearch);
  document.getElementById('stationInput').addEventListener('keydown', e => { if (e.key === 'Enter') doStationSearch(); });

  // From → To search
  const doFromTo = () => {
    const from = document.getElementById('fromInput').value.trim();
    const to   = document.getElementById('toInput').value.trim();
    if (!from || !to) { showToast('Fill in both From and To fields.', 'err'); return; }
    renderResults(searchFromTo(from, to), [from, to]);
  };
  document.getElementById('fromToSearchBtn').addEventListener('click', doFromTo);
  document.getElementById('geoBtn').addEventListener('click', requestGeoForSearch);
  ['fromInput', 'toInput'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') doFromTo(); });
  });

  // Near You
  document.getElementById('detectBtn').addEventListener('click', detectNearby);

  // ---- Settings Modal ----
  document.getElementById('closeSettings').addEventListener('click', closeSettingsModal);
  // Click outside modal-box to close
  document.getElementById('settingsModal').addEventListener('click', e => {
    if (e.target === document.getElementById('settingsModal')) closeSettingsModal();
  });

  document.querySelectorAll('.mtab').forEach(btn => {
    btn.addEventListener('click', () => switchMTab(btn.dataset.mtab));
  });

  // ---- Pricing type radio ----
  document.querySelectorAll('input[name="pricingType"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const staged = radio.value === 'staged';
      document.getElementById('flatPriceRow').classList.toggle('hidden', staged);
      document.getElementById('stagesBlock').classList.toggle('hidden', !staged);
    });
  });

  // ---- Dynamic add buttons ----
  document.getElementById('addStageBtn').addEventListener('click', () => {
    document.getElementById('stagesList').appendChild(buildStageRow());
  });

  document.getElementById('addStationBtn').addEventListener('click', () => {
    document.getElementById('stationsList').appendChild(buildStationRow());
  });

  // ---- Form submit (save / update) ----
  document.getElementById('lineForm').addEventListener('submit', async e => {
    e.preventDefault();
    const msg       = document.getElementById('formMsg');
    const editingId = document.getElementById('editingId').value;
    const busId     = document.getElementById('fBusId').value.trim();
    const company   = document.getElementById('fCompany').value.trim();
    const type      = document.querySelector('input[name="pricingType"]:checked').value;
    const stations  = getStationsFromForm();
    const errors    = [];

    if (!busId)           errors.push('Bus number is required.');
    if (!stations.length) errors.push('Add at least one station.');

    let flatPrice = null;
    let stages    = [];

    if (type === 'flat') {
      flatPrice = parseFloat(document.getElementById('fFlatPrice').value);
      if (isNaN(flatPrice)) errors.push('Enter a valid price.');
    } else {
      stages = getStagesFromForm();
      if (!stages.length) errors.push('Add at least one fare stage.');
    }

    // Duplicate ID check (only for new lines, not edits)
    if (!editingId && allRoutes.find(r => r.id === busId)) {
      if (!confirm(`Bus ${busId} already exists. Overwrite it?`)) return;
    }

    if (errors.length) {
      msg.className = 'form-msg err';
      msg.innerHTML = errors.map(m => `• ${m}`).join('<br>');
      return;
    }

    // If bus number was changed during edit, delete the old record first
    if (editingId && editingId !== busId) {
      await deleteRoute(editingId);
    }

    const route = { id: busId, company, pricingType: type, flatPrice, stages, stations, source: 'user' };
    await putRoute(route);
    allRoutes = await getAllRoutes();
    updateCompanyFilter();
    updateRouteCount();

    msg.className   = 'form-msg ok';
    msg.textContent = editingId ? `Bus ${busId} updated.` : `Bus ${busId} saved.`;

    clearForm();
    showToast(editingId ? `Bus ${busId} updated.` : `Bus ${busId} saved.`, 'ok');
    setTimeout(() => switchMTab('lines'), 700);
  });

  document.getElementById('cancelEditBtn').addEventListener('click', clearForm);

  // ---- All Lines filters ----
  document.getElementById('filterBus').addEventListener('input', renderLinesList);
  document.getElementById('filterCompany').addEventListener('change', renderLinesList);

  // ---- Data tab ----
  document.getElementById('exportBtn').addEventListener('click', async () => {
    const routes = await getAllRoutes();
    const blob   = new Blob([JSON.stringify(routes, null, 2)], { type: 'application/json' });
    const a      = document.createElement('a');
    a.href       = URL.createObjectURL(blob);
    a.download   = 'cairo-bus-data.json';
    a.click();
    showToast(`Exported ${routes.length} routes.`, 'ok');
  });

  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });

  document.getElementById('importFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const raw    = JSON.parse(await file.text());
      const routes = Array.isArray(raw) ? raw : [];
      for (const r of routes) await putRoute(normalizeRoute(r));
      allRoutes = await getAllRoutes();
      updateCompanyFilter();
      updateRouteCount();
      renderLinesList();
      showToast(`Imported ${routes.length} routes.`, 'ok');
    } catch {
      showToast('Invalid JSON file.', 'err');
    }
    e.target.value = '';
  });

  document.getElementById('resetBtn').addEventListener('click', async () => {
    if (!confirm('Delete ALL local data and reload the official routes from data.json?')) return;
    await clearAll();
    await loadSeedData();
    allRoutes = await getAllRoutes();
    updateCompanyFilter();
    updateRouteCount();
    renderLinesList();
    document.getElementById('results').innerHTML = '';
    showToast(`Reset done. ${allRoutes.length} official routes loaded.`, 'ok');
  });
}

// ============================================================
//  HELPERS
// ============================================================
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3500);
}

// Safe HTML escaping to prevent XSS
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
