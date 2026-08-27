/* Seu Mundo Neste Momento — dados públicos reais; nenhuma leitura é simulada. */
const API = {
  usgs: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',
  eonet: 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=250',
  iss: 'https://api.wheretheiss.at/v1/satellites/25544',
  kp: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
  mag: 'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json',
  plasma: 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json',
  aurora: 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',
  weather: 'https://api.open-meteo.com/v1/forecast'
};
const refresh = { world: 300000, snapshot: 900000, iss: 10000, space: 300000, temperature: 1800000 };
const CARTO_BASEMAP_KEY = 'cb1_25k6_1_cf2c5e6bbca5260db3c5d1ac';
const NEWS_MAX_AGE = 24 * 60 * 60 * 1000;
const state = {
  events: [], sources: new Map(), iss: null, issTrail: [], space: null, temperature: [], temperatureGrid: null, aurora: [], airQuality: [], news: [], conflictNews: [], admin1: [], newsRegions: [], conflictRegions: [],
  selected: null, selectedRegion: null, category: 'all', priority: false, showTemperature: false, showAurora: false,
  showAir: false, showIss: true, showRegions: false, showConflicts: false, showDaylight: true, showSatellite: false,
  view: 'map', updatedAt: null, snapshot: null, notificationsReady: false, newsQuery: null, selectedConflict: null, expandedGlobeCluster: null,
  myWorld: readMyWorld(), myWorldActive: false, detailRegion: null
};
const categories = [['all', '00', 'cat.all'], ['earthquakes', '01', 'cat.earthquakes'], ['wildfires', '02', 'cat.wildfires'], ['storms', '03', 'cat.storms'], ['volcanoes', '04', 'cat.volcanoes'], ['floods', '05', 'cat.floods'], ['tsunamis', '06', 'cat.tsunamis'], ['landslides', '07', 'cat.landslides'], ['damFailures', '08', 'cat.damFailures'], ['other', '09', 'cat.other'], ['hazmat', '!', 'cat.hazmat'], ['nuclear', '!!', 'cat.nuclear']];
const myWorldCategoryIds = ['earthquakes', 'wildfires', 'storms', 'volcanoes', 'floods', 'tsunamis', 'landslides', 'damFailures', 'other'];
const MY_WORLD_KEY = 'my-world-preferences-v1';
const severityColors = { critical: '#ff455d', high: '#ff9e44', medium: '#f0d95f', low: '#63a9ff' };
const $ = selector => document.querySelector(selector);
const t = (key, variables = {}) => window.i18n?.t(key, variables) ?? key;
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function readMyWorld() {
  const fallback = { regions: [], categories: [], preferredView: 'map' };
  try {
    const stored = JSON.parse(localStorage.getItem('my-world-preferences-v1') || 'null');
    if (!stored || typeof stored !== 'object') return fallback;
    const regions = Array.isArray(stored.regions) ? stored.regions.filter(region => region && typeof region.id === 'string' && typeof region.name === 'string' && Number.isFinite(Number(region.lat)) && Number.isFinite(Number(region.lon))).slice(0, 20).map(region => ({ id: region.id, name: region.name, country: String(region.country || ''), lat: Number(region.lat), lon: Number(region.lon) })) : [];
    const allowed = new Set(['earthquakes', 'wildfires', 'storms', 'volcanoes', 'floods', 'tsunamis', 'landslides', 'damFailures', 'other']);
    const selectedCategories = Array.isArray(stored.categories) ? [...new Set(stored.categories.filter(category => allowed.has(category)))] : [];
    return { regions, categories: selectedCategories, preferredView: stored.preferredView === 'globe' ? 'globe' : 'map' };
  } catch { return fallback; }
}
function saveMyWorld() {
  try { localStorage.setItem(MY_WORLD_KEY, JSON.stringify(state.myWorld)); } catch { /* armazenamento local pode estar desativado */ }
  updateMyWorldButton();
}

function symbolKind(item = {}) {
  if (item.symbol) return item.symbol;
  if (item.kind === 'conflict-media') return 'conflict';
  if (item.kind === 'region') return 'news';
  if (item.kind === 'iss') return 'iss';
  if (item.kind === 'aurora') return 'aurora';
  if (item.kind === 'air') return 'air';
  if (/^NOAA PA|^NOAA PH/.test(item.source || '')) return 'tsunami';
  return item.category || item.kind || 'other';
}
function symbolGlyph(kind) {
  const glyphs = {
    all: '<path d="M7 7h4v4H7zM13 7h4v4h-4zM7 13h4v4H7zM13 13h4v4h-4z"/>',
    earthquakes: '<path d="M4.5 12h4l2-5 3 10 2-5h4"/>',
    wildfires: '<path d="M12.2 4.2c1.1 3.2-2.1 4.2-.8 7.1.8-1 1.8-1.9 2-3.2 3.2 2.8 4.5 5.7 2.8 8.7-1.7 3.1-6.8 3.2-8.6.2-1.7-2.8-.3-5.4 2.5-8.2-.2 2.1.4 3.4 1.2 4.1-.1-3 2.7-4.7.9-8.7z"/>',
    storms: '<path d="M18.8 9.3c-1.5-3.7-7.5-4.2-10.3-1.5-3.1 3-1.1 7.7 2.8 8.1 3.5.4 5.6-3.3 3.4-5.5-1.5-1.5-4.2-.4-3.9 1.5.2 1.1 1.5 1.5 2.2.8"/>',
    volcanoes: '<path d="M3.8 19 9.7 8.5l2.3 3.2 2.1-3.2L20.2 19zM11.2 6.4c-1.3-1-.8-2.2.1-2.8M14 6.2c1.4-1 .9-2.2 0-3"/>',
    floods: '<path d="M3.5 9.5c2.2-1.8 4.3 1.8 6.5 0s4.3 1.8 6.5 0 3.8.7 4 .9M3.5 14c2.2-1.8 4.3 1.8 6.5 0s4.3 1.8 6.5 0 3.8.7 4 .9M3.5 18.5c2.2-1.8 4.3 1.8 6.5 0s4.3 1.8 6.5 0 3.8.7 4 .9"/>',
    tsunami: '<path d="M3.5 16.8c3.8-6.5 8.1-7.8 11.7-5.7-2.1-.1-3.7 1-4 2.6 2.5-1.1 5.5-.7 8.3 1.7-4.2-.7-6.8 3.5-10.8 3.1-2.1-.2-3.8-.8-5.2-1.7z"/>',
    tsunamis: '<path d="M3.5 16.8c3.8-6.5 8.1-7.8 11.7-5.7-2.1-.1-3.7 1-4 2.6 2.5-1.1 5.5-.7 8.3 1.7-4.2-.7-6.8 3.5-10.8 3.1-2.1-.2-3.8-.8-5.2-1.7z"/>',
    landslides: '<path d="M4 18h16M5 16l5-9 3 5 2-3 4 7M10 13l2 2M14 14l2 2"/>',
    damFailures: '<path d="M5 6v12M19 6v12M5 9h14M9 9v9M15 9v9M3 19h18"/>',
    hazmat: '<circle cx="12" cy="12" r="2"/><circle cx="12" cy="7" r="3"/><circle cx="7.7" cy="14.6" r="3"/><circle cx="16.3" cy="14.6" r="3"/>',
    nuclear: '<circle cx="12" cy="12" r="1.5"/><path d="M12 10 9.2 5.1A7.8 7.8 0 0 1 14.8 5zM10.2 13 4.6 13a7.8 7.8 0 0 0 2.8 4.8zM13.8 13l2.8 4.8a7.8 7.8 0 0 0 2.8-4.8z"/>',
    conflict: '<rect x="5" y="5" width="14" height="14" rx="1"/><path d="M8 8h5M8 11h8M8 14h5M16.5 14v3M16.5 18.5v.1"/>',
    news: '<path d="M5 6h11.5A2.5 2.5 0 0 1 19 8.5V18H7a2 2 0 0 1-2-2zM8 9h6M8 12h8M8 15h5"/>',
    iss: '<path d="M9 9h6v6H9zM3 6l5 2-2 4-4-2zM21 18l-5-2 2-4 4 2zM12 3v4M12 17v4"/>',
    aurora: '<path d="M4 16c3.2-7.5 6.4-7.5 9.6 0M9 17c3.2-7.5 6.4-7.5 9.6 0"/>',
    air: '<path d="M4 9h10c3.2 0 3.2-4 0-4-1.4 0-2.3.8-2.5 1.8M4 13h14c3.2 0 3.2 4 0 4-1.4 0-2.3-.8-2.5-1.8M4 17h7"/>',
    other: '<path d="M12 4.5 19.5 12 12 19.5 4.5 12zM12 8v5M12 16v.1"/>'
  };
  return glyphs[kind] || glyphs.other;
}
function symbolSvg(kind, color = '#60e6da', selected = false) {
  const accent = selected ? '#c7ff4a' : color;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.4" fill="#071017" fill-opacity=".92" stroke="${accent}" stroke-width="${selected ? 2 : 1.35}"/><g fill="none" stroke="#eef7f5" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">${symbolGlyph(kind)}</g></svg>`;
}
function symbolMarkup(kind, color, selected = false) { return `<span class="event-symbol" aria-hidden="true">${symbolSvg(kind, color, selected)}</span>`; }
const leafletIconCache = new Map();
function leafletSymbolIcon(kind, color, selected = false, size = 28, count = 1) {
  const key = `${kind}-${color}-${selected}-${size}-${count}`;
  const badge = count > 1 ? `<b class="map-symbol-count">${count > 99 ? '99+' : count}</b>` : '';
  if (!leafletIconCache.has(key)) leafletIconCache.set(key, L.divIcon({ className: 'map-symbol-host', html: `<span class="map-symbol ${selected ? 'selected' : ''}">${symbolSvg(kind, color, selected)}${badge}</span>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2], tooltipAnchor: [0, -size / 2] }));
  return leafletIconCache.get(key);
}
function symbolLabel(kind) {
  const keys = { earthquakes: 'cat.earthquakes', wildfires: 'cat.wildfires', storms: 'cat.storms', volcanoes: 'cat.volcanoes', floods: 'cat.floods', tsunamis: 'cat.tsunamis', landslides: 'cat.landslides', damFailures: 'cat.damFailures', hazmat: 'cat.hazmat', nuclear: 'cat.nuclear', other: 'cat.other', tsunami: 'cat.tsunamis' };
  return t(keys[kind] || 'cat.other');
}

function safeUrl(value) { try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) ? url.href : '#'; } catch { return '#'; } }
function timeoutFetch(url, options = {}, ms = 15000) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), ms); return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer)); }
async function json(url, ms = 15000) { const response = await timeoutFetch(url, { headers: { Accept: 'application/json' } }, ms); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }
function source(id, label, ok, count = 0, message = '', publishedAt = null, staleAfterMs = null) { state.sources.set(id, { id, label, ok, count, message, publishedAt, staleAfterMs, checkedAt: new Date().toISOString() }); renderSources(); }
function riskForQuake(magnitude) { return magnitude >= 6.5 ? 'critical' : magnitude >= 5.5 ? 'high' : magnitude >= 4.5 ? 'medium' : 'low'; }
function naturalCategory(raw = '') { const text = raw.toLowerCase(); if (text.includes('wildfire')) return 'wildfires'; if (text.includes('storm') || text.includes('cyclone') || text.includes('severe')) return 'storms'; if (text.includes('volcano')) return 'volcanoes'; if (text.includes('tsunami')) return 'tsunamis'; if (text.includes('landslide')) return 'landslides'; if (text.includes('flood')) return 'floods'; return 'other'; }
function naturalRisk(category, date) { const hours = (Date.now() - new Date(date).getTime()) / 36e5; if (category === 'volcanoes' || category === 'storms') return hours < 48 ? 'high' : 'medium'; if (category === 'wildfires' || category === 'floods') return hours < 72 ? 'medium' : 'low'; return 'low'; }
function fmtTime(value, withDate = false) { const date = new Date(value); if (Number.isNaN(+date)) return '—'; return new Intl.DateTimeFormat(window.i18n.locale(), withDate ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' } : { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(date) + ' UTC'; }
function timeAgo(value) { const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000)); const relative = new Intl.RelativeTimeFormat(window.i18n.locale(), { numeric: 'always', style: 'narrow' }); if (seconds < 60) return relative.format(-seconds, 'second'); if (seconds < 3600) return relative.format(-Math.floor(seconds / 60), 'minute'); return relative.format(-Math.floor(seconds / 3600), 'hour'); }
function sourceFreshness(item) { const publishedDate = new Date(item.publishedAt); const hasPublication = item.publishedAt && !Number.isNaN(+publishedDate); const reference = hasPublication ? item.publishedAt : item.checkedAt; const age = Date.now() - new Date(reference).getTime(); const stale = item.ok && item.staleAfterMs != null && Number.isFinite(age) && age > item.staleAfterMs; return { stale, text: `${t(hasPublication ? 'sources.published' : 'sources.checked')} ${timeAgo(reference)}` }; }
function tableLast(raw) { if (!Array.isArray(raw) || !raw.length) return null; if (raw[0] && typeof raw[0] === 'object' && !Array.isArray(raw[0])) return raw.reduce((latest, row) => !latest || new Date(row.time_tag || 0) > new Date(latest.time_tag || 0) ? row : latest, null); if (raw.length < 2 || !Array.isArray(raw[0])) return null; const headers = raw[0]; for (let index = raw.length - 1; index > 0; index--) if (Array.isArray(raw[index])) return Object.fromEntries(headers.map((key, column) => [key, raw[index][column]])); return null; }
function num(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function utcTimestamp(value) { const text = String(value || '').trim(); if (!text) return new Date().toISOString(); const normalized = /(Z|[+-]\d\d:?\d\d)$/i.test(text) ? text : `${text}Z`; const date = new Date(normalized); return Number.isNaN(+date) ? new Date().toISOString() : date.toISOString(); }
function sample(rows, maximum) { if (rows.length <= maximum) return rows; const step = rows.length / maximum; return Array.from({ length: maximum }, (_, index) => rows[Math.floor(index * step)]); }
function kpScale(kp) { if (kp == null || kp < 5) return ['G0', t('kp.none')]; if (kp < 6) return ['G1', t('kp.minor')]; if (kp < 7) return ['G2', t('kp.moderate')]; if (kp < 8) return ['G3', t('kp.strong')]; if (kp < 9) return ['G4', t('kp.severe')]; return ['G5', t('kp.extreme')]; }

async function loadSnapshot() {
  try {
    const next = await json(`data/snapshot.json?t=${Date.now()}`, 8000);
    next.events = (next.events || []).map(event => ({ ...event, timestamp: utcTimestamp(event.timestamp) }));
    state.snapshot = next;
    state.airQuality = next.airQuality || [];
    state.temperatureGrid = next.temperatureGrid || null;
    state.temperature = [];
    state.news = next.news || [];
    state.conflictNews = next.conflictNews || [];
    if (state.admin1.length) { rebuildNewsRegions(); rebuildConflictRegions(); }
    source('gdacs', 'GDACS', next.sources?.gdacs === 'fulfilled', next.events.filter(event => event.source === 'GDACS').length, t('sources.snapshot15'), next.generatedAt, 45 * 60000);
    source('tsunami', 'NOAA TSUNAMI', next.sources?.tsunamiPaaq === 'fulfilled' || next.sources?.tsunamiPheb === 'fulfilled', next.events.filter(event => /^NOAA PA|^NOAA PH/.test(event.source)).length, t('sources.activeOnly'), next.generatedAt, 45 * 60000);
    source('air', 'OPEN-METEO AR', state.airQuality.length > 0, state.airQuality.length, t('sources.grid15'), next.generatedAt, 45 * 60000);
    source('temperature-grid', state.temperatureGrid?.source || 'NOAA GFS', Boolean(state.temperatureGrid), state.temperatureGrid?.values?.filter(Number.isFinite).length || 0, '', state.temperatureGrid?.observedAt || null, 8 * 3600000);
    source('news-cache', 'GOOGLE NEWS RSS', state.news.length > 0, state.news.length, t('sources.newsCache'), next.generatedAt, 45 * 60000);
    source('conflict-media', 'GOOGLE NEWS / CONFLITOS', state.conflictNews.length > 0, state.conflictNews.length, t('sources.conflictMedia'), next.generatedAt, 45 * 60000);
  } catch { if (!state.snapshot) state.snapshot = null; }
}

function snapshotOnlyEvents() { return (state.snapshot?.events || []).filter(event => event.source === 'GDACS' || /^NOAA PA|^NOAA PH/.test(event.source) || event.source === 'COBERTURA JORNALÍSTICA MULTIFONTE'); }
function dedupeEvents(events) { return [...new Map(events.map(event => [event.id, event])).values()]; }

async function loadWorld() {
  const tasks = await Promise.allSettled([json(API.usgs), json(API.eonet)]);
  let events = [...snapshotOnlyEvents()];
  if (tasks[0].status === 'fulfilled') {
    const rows = tasks[0].value.features || [];
    events.push(...rows.map(feature => ({
      id: `usgs-${feature.id}`, category: 'earthquakes', severity: riskForQuake(num(feature.properties.mag) || 0), title: t('event.quake', { magnitude: num(feature.properties.mag)?.toFixed(1) ?? '—' }),
      location: feature.properties.place || t('event.unknownLocation'), summary: t('event.quakeSummary', { depth: num(feature.geometry.coordinates[2])?.toFixed(1) ?? '—' }),
      metric: `M ${num(feature.properties.mag)?.toFixed(1) ?? '—'}`, timestamp: new Date(feature.properties.time).toISOString(), source: 'USGS',
      lat: feature.geometry.coordinates[1], lon: feature.geometry.coordinates[0], url: feature.properties.url
    })));
    source('usgs', 'USGS', true, rows.length, '', rows[0]?.properties?.time ? new Date(rows[0].properties.time).toISOString() : null);
  } else source('usgs', 'USGS', false, 0, tasks[0].reason?.message);
  if (tasks[1].status === 'fulfilled') {
    const rows = (tasks[1].value.events || []).flatMap(item => {
      const geometry = item.geometry?.at(-1); if (!geometry || !Array.isArray(geometry.coordinates) || geometry.type !== 'Point') return [];
      const category = naturalCategory(item.categories?.[0]?.title); if (category === 'earthquakes') return [];
      return [{ id: `eonet-${item.id}`, category, severity: naturalRisk(category, geometry.date), title: t({ wildfires: 'event.wildfire', storms: 'event.storm', volcanoes: 'event.volcano', floods: 'event.flood', other: 'event.other' }[category]), location: item.title, summary: item.description || t('event.eonetSummary'), metric: geometry.magnitudeValue ? `${geometry.magnitudeValue} ${geometry.magnitudeUnit || ''}` : t('event.active'), timestamp: geometry.date, source: `NASA EONET${item.sources?.[0]?.id ? ' / ' + item.sources[0].id : ''}`, lat: geometry.coordinates[1], lon: geometry.coordinates[0], url: item.sources?.[0]?.url || item.link }];
    });
    events.push(...rows); source('eonet', 'NASA EONET', true, rows.length, '', rows[0]?.timestamp || null);
  } else source('eonet', 'NASA EONET', false, 0, tasks[1].reason?.message);
  if (!events.length && state.snapshot?.events?.length) { events = state.snapshot.events; source('snapshot', 'SNAPSHOT ACTIONS', true, events.length, 'Contingência'); }
  state.events = dedupeEvents(events).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  processCriticalNotifications();
  state.updatedAt = new Date().toISOString(); renderAll();
}

function addIssTrail(point) {
  const previous = state.issTrail.at(-1);
  if (!previous || Math.abs(previous.lat - point.lat) + Math.abs(previous.lon - point.lon) > 0.01) state.issTrail.push({ lat: point.lat, lon: point.lon });
  if (state.issTrail.length > 90) state.issTrail.splice(0, state.issTrail.length - 90);
}
async function loadIss() {
  try {
    const data = await json(API.iss, 9000);
    state.iss = { lat: data.latitude, lon: data.longitude, altitude: data.altitude, velocity: data.velocity, timestamp: new Date(data.timestamp * 1000).toISOString() };
    addIssTrail(state.iss); source('iss', 'ISS / WTIA', true, 1, '', state.iss.timestamp, 60000);
    $('#iss-status').textContent = `ISS: ${state.iss.lat.toFixed(2)}°, ${state.iss.lon.toFixed(2)}° · ${Math.round(state.iss.altitude)} KM`;
  } catch (error) {
    const fallback = state.snapshot?.iss;
    if (fallback) { state.iss = fallback; addIssTrail(fallback); source('iss', 'ISS / SNAPSHOT', true, 1, 'Contingência', fallback.timestamp, 30 * 60000); }
    else source('iss', 'ISS / WTIA', false, 0, error.message);
    $('#iss-status').textContent = fallback ? t('iss.snapshot') : t('iss.unavailable');
  }
  renderGlobeData();
}

async function loadSpace() {
  const results = await Promise.allSettled([json(API.kp), json(API.mag), json(API.plasma), json(API.aurora, 25000)]);
  const kpRow = results[0].status === 'fulfilled' ? tableLast(results[0].value) : null;
  const magRow = results[1].status === 'fulfilled' ? tableLast(results[1].value) : null;
  const plasmaRow = results[2].status === 'fulfilled' ? tableLast(results[2].value) : null;
  let kp = num(kpRow?.Kp ?? kpRow?.kp), bz = num(magRow?.bz_gsm ?? magRow?.bz), wind = num(plasmaRow?.proton_speed ?? plasmaRow?.speed), time = kpRow?.time_tag || magRow?.time_tag || plasmaRow?.time_tag || new Date().toISOString();
  if (kp == null && state.snapshot?.space) ({ kp, bz, wind, time } = state.snapshot.space);
  state.space = { kp, bz, wind, time }; source('noaa-kp', 'NOAA KP', kp != null, kp == null ? 0 : 1, '', time, 30 * 60000); source('solar-wind', 'NOAA VENTO SOLAR', bz != null || wind != null, [bz, wind].filter(value => value != null).length, '', time, 30 * 60000);
  const scale = kpScale(kp); $('#kp-value').textContent = kp == null ? '—' : kp.toFixed(1); $('#kp-scale').textContent = `${scale[0]} · ${scale[1]}`; $('#bz-value').textContent = bz == null ? '—' : bz.toFixed(1); $('#wind-value').textContent = wind == null ? '—' : Math.round(wind); $('#space-time').textContent = t('space.latest', { time: fmtTime(time, true) });
  if (results[3].status === 'fulfilled') {
    const raw = results[3].value;
    state.aurora = (raw.coordinates || []).flatMap(point => { const rawLon = num(point[0]), lat = num(point[1]), intensity = num(point[2]); if (rawLon == null || lat == null || intensity == null || intensity < 3) return []; const lon = rawLon > 180 ? rawLon - 360 : rawLon; return Math.abs(Math.round(lat)) % 2 || Math.abs(Math.round(lon)) % 2 ? [] : [{ lat, lon, intensity }]; });
    source('ovation', 'NOAA OVATION', true, state.aurora.length, '', raw['Observation Time'] || raw['Forecast Time'] || null, 90 * 60000);
  } else { state.aurora = state.snapshot?.aurora || []; source('ovation', 'NOAA OVATION', state.aurora.length > 0, state.aurora.length, results[3].reason?.message); }
  $('#aurora-status').textContent = state.showAurora ? t('layer.auroraCells', { count: state.aurora.length }) : t('status.auroraOff'); renderGlobeData();
}

async function loadTemperature() {
  if (!state.showTemperature) return;
  if (!state.temperatureGrid) { $('#temperature-status').textContent = t('layer.tempUnavailable'); renderGlobeData(); return; }
  $('#temperature-status').textContent = temperatureStatus(); renderGlobeData();
}

async function loadAdmin1(options = {}) {
  const silent = options.silent === true;
  if (state.admin1.length) { rebuildNewsRegions(); rebuildConflictRegions(); return state.newsRegions; }
  if (!silent) $('#region-status').textContent = t('layer.regionsLoading');
  try {
    const data = await json('data/admin1.json', 30000);
    state.admin1 = (data.regions || []).map(([name, countryIndex, lat, lon], index) => ({ id: `region-${index}`, kind: 'region', name, country: data.countries[countryIndex], lat, lon, title: name, location: t('region.click', { country: data.countries[countryIndex] }), metric: t('region.metric'), color: '#60e6da' })); source('natural-earth', 'NATURAL EARTH', true, state.admin1.length, 'Administrative centers');
    rebuildNewsRegions(); rebuildConflictRegions(); if (!silent) $('#region-status').textContent = t('layer.regionsCount', { count: state.newsRegions.length }); return state.newsRegions;
  } catch (error) { source('natural-earth', 'NATURAL EARTH', false, 0, error.message); if (!silent) $('#region-status').textContent = t('layer.regionsUnavailable'); return []; }
}

function myWorldMatches(event) {
  const categoryMatch = !state.myWorld.categories.length || state.myWorld.categories.includes(event.category);
  const regionMatch = !state.myWorld.regions.length || state.myWorld.regions.some(region => distanceKm(event.lat, event.lon, region.lat, region.lon) <= 700);
  return categoryMatch && regionMatch;
}
function filteredEvents() { return state.events.filter(event => (state.category === 'all' || event.category === state.category) && (!state.priority || ['critical', 'high'].includes(event.severity)) && (!state.myWorldActive || myWorldMatches(event))); }
function displayEventTitle(event) {
  if (event.source === 'GDACS') return t({ wildfires: 'event.gdacsWildfire', floods: 'event.gdacsFlood', storms: 'event.gdacsStorm', volcanoes: 'event.gdacsVolcano', other: 'event.gdacsOther' }[event.category] || 'event.gdacsOther');
  if (/^NOAA PA|^NOAA PH/.test(event.source)) return t('event.tsunami');
  return event.title;
}
function renderCategories() { $('#category-list').innerHTML = categories.map(([id, , labelKey]) => { const count = id === 'all' ? state.events.length : state.events.filter(event => event.category === id).length; if (['nuclear', 'hazmat'].includes(id) && count === 0) return ''; const active = state.category === id; return `<button class="category ${active ? 'active' : ''}" data-category="${id}">${symbolMarkup(id, active ? '#c7ff4a' : '#60e6da', active)}<span>${esc(t(labelKey))}</span><span class="count">${count}</span></button>`; }).join(''); document.querySelectorAll('.category').forEach(button => button.onclick = () => { state.category = button.dataset.category; state.selected = null; renderAll(); }); }
function renderSources() { const list = [...state.sources.values()]; const decorated = list.map(item => ({ ...item, freshness: sourceFreshness(item) })); $('#source-list').innerHTML = decorated.length ? decorated.map(item => `<div class="source-row ${item.ok ? 'ok' : ''} ${item.freshness.stale ? 'stale' : ''}" title="${esc(item.message || '')}"><span><i></i><span>${esc(item.label)}<small>${esc(item.freshness.text)}${item.freshness.stale ? ` · ${esc(t('sources.stale'))}` : ''}</small></span></span><b>${item.ok ? esc(t('sources.ok', { count: item.count })) : esc(t('sources.fail'))}</b></div>`).join('') : `<span class="muted">${esc(t('sources.loading'))}</span>`; const healthy = decorated.filter(item => item.ok && !item.freshness.stale).length; $('#source-count').textContent = healthy; $('#online-dot').className = `live-dot ${healthy === 0 ? 'offline' : healthy < decorated.length ? 'partial' : ''}`; $('#system-status').textContent = healthy === 0 ? t('system.offline') : healthy < decorated.length ? t('system.partial') : t('system.online'); }
function renderFeed() { const rows = filteredEvents().slice(0, 12); $('#visible-count').textContent = filteredEvents().length; $('#feed-count').textContent = rows.length; $('#event-feed').innerHTML = rows.length ? rows.map(event => { const selected = state.selected === event.id; return `<button class="event-item ${selected ? 'active' : ''}" data-id="${esc(event.id)}">${symbolMarkup(symbolKind(event), severityColors[event.severity], selected)}<span><strong>${esc(displayEventTitle(event))}</strong><small>${esc(event.location)} · ${fmtTime(event.timestamp)}</small></span><span>${esc(event.metric)}</span></button>`; }).join('') : `<p class="muted" style="padding:18px">${esc(t('event.none'))}</p>`; document.querySelectorAll('.event-item').forEach(button => button.onclick = () => selectEvent(button.dataset.id)); }
function selectEvent(id, openDetails = true) { state.selected = id; const event = state.events.find(item => item.id === id); if (!event) return; renderSpotlight(event); renderFeed(); focusCoordinate(event.lat, event.lon, 1.6); loadWeather(event.lat, event.lon); loadNews(event.location, event.lat, event.lon); if (openDetails) openEventDetail(event); }
function renderSpotlight(event) { if (!event) event = filteredEvents()[0]; if (!event) return; $('#risk-chip').textContent = t(`risk.${event.severity}`); $('#risk-chip').style.borderColor = severityColors[event.severity]; $('#risk-chip').style.color = severityColors[event.severity]; $('#spot-title').textContent = displayEventTitle(event).toUpperCase(); $('#spot-location').textContent = event.location; $('#spot-summary').textContent = event.summary; $('#spot-metric').textContent = event.metric; $('#spot-source').textContent = event.source; $('#spot-time').textContent = fmtTime(event.timestamp, true); $('#spot-coordinates').textContent = `${event.lat.toFixed(2)}, ${event.lon.toFixed(2)}`; const link = $('#spot-link'); const verified = safeUrl(event.url); link.hidden = verified === '#'; if (verified !== '#') link.href = verified; const details = $('#event-detail-button'); details.hidden = false; details.onclick = () => openEventDetail(event); renderCoordinate(event.lat, event.lon); }

function eventCategoryLabel(event) { return t(categories.find(([id]) => id === event.category)?.[2] || 'cat.other'); }
function coordinateLabel(value, positive, negative) { return `${Math.abs(Number(value)).toFixed(5)}° ${Number(value) >= 0 ? positive : negative}`; }
function distanceKm(lat1, lon1, lat2, lon2) {
  const radians = value => value * Math.PI / 180, radius = 6371;
  const dLat = radians(lat2 - lat1), dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function nearestAdminRegion(event) {
  return state.admin1.reduce((nearest, region) => {
    const distance = distanceKm(event.lat, event.lon, region.lat, region.lon);
    return !nearest || distance < nearest.distance ? { region, distance } : nearest;
  }, null);
}
function isFavoriteRegion(region) { return Boolean(region && state.myWorld.regions.some(item => item.id === region.id)); }
function updateEventFavoriteButton() {
  const button = $('#event-favorite-button'); if (!button) return;
  button.hidden = !state.detailRegion;
  if (state.detailRegion) button.textContent = t(isFavoriteRegion(state.detailRegion) ? 'myWorld.removeRegion' : 'myWorld.saveRegion');
}
function toggleFavoriteRegion(region) {
  if (!region) return;
  const existing = state.myWorld.regions.findIndex(item => item.id === region.id);
  if (existing >= 0) state.myWorld.regions.splice(existing, 1);
  else if (state.myWorld.regions.length < 20) state.myWorld.regions.push({ id: region.id, name: region.name, country: region.country, lat: region.lat, lon: region.lon });
  saveMyWorld(); renderMyWorld(); updateEventFavoriteButton(); if (state.myWorldActive) renderAll();
}
function myWorldResultLabel(region) { return `${region.name} · ${region.country}`; }
function renderMyWorldSearchResults(regions = null) {
  const container = $('#my-world-results'); if (!container) return;
  if (regions == null) { container.innerHTML = `<p class="muted">${esc(t('myWorld.searchStart'))}</p>`; return; }
  if (!regions.length) { container.innerHTML = `<p class="muted">${esc(t('myWorld.noResults'))}</p>`; return; }
  container.innerHTML = regions.map(region => `<div class="my-world-region-row"><span><strong>${esc(region.name)}</strong><small>${esc(region.country)}</small></span><button type="button" data-my-world-add="${esc(region.id)}">${esc(isFavoriteRegion(region) ? t('myWorld.remove') : t('myWorld.add'))}</button></div>`).join('');
  container.querySelectorAll('[data-my-world-add]').forEach(button => button.onclick = () => { const region = state.admin1.find(item => item.id === button.dataset.myWorldAdd); toggleFavoriteRegion(region); searchMyWorldRegions($('#my-world-search').value); });
}
function renderMyWorld() {
  const favorites = $('#my-world-favorites'), categoryBox = $('#my-world-categories'); if (!favorites || !categoryBox) return;
  favorites.innerHTML = `<h4>${esc(t('myWorld.favoritesTitle'))}</h4>${state.myWorld.regions.length ? state.myWorld.regions.map(region => `<div class="my-world-region-row saved"><span><strong>${esc(region.name)}</strong><small>${esc(region.country)}</small></span><span class="my-world-region-actions"><button type="button" data-my-world-focus="${esc(region.id)}">${esc(t('myWorld.focus'))}</button><button type="button" data-my-world-remove="${esc(region.id)}">${esc(t('myWorld.remove'))}</button></span></div>`).join('') : `<p class="muted">${esc(t('myWorld.favoritesEmpty'))}</p>`}`;
  favorites.querySelectorAll('[data-my-world-focus]').forEach(button => button.onclick = () => { const region = state.myWorld.regions.find(item => item.id === button.dataset.myWorldFocus); if (!region) return; $('#my-world-dialog').close(); focusCoordinate(region.lat, region.lon, 1.35); loadWeather(region.lat, region.lon); loadNews(region.name, region.lat, region.lon, region.country); });
  favorites.querySelectorAll('[data-my-world-remove]').forEach(button => button.onclick = () => toggleFavoriteRegion(state.myWorld.regions.find(item => item.id === button.dataset.myWorldRemove)));
  categoryBox.innerHTML = myWorldCategoryIds.map(id => { const key = categories.find(([category]) => category === id)?.[2] || 'cat.other'; return `<label><input type="checkbox" value="${id}" ${state.myWorld.categories.includes(id) ? 'checked' : ''}><span>${symbolMarkup(id, '#60e6da')} ${esc(t(key))}</span></label>`; }).join('');
  categoryBox.querySelectorAll('input').forEach(input => input.onchange = () => { state.myWorld.categories = [...categoryBox.querySelectorAll('input:checked')].map(item => item.value); saveMyWorld(); renderMyWorldSummary(); if (state.myWorldActive) renderAll(); });
  $('#my-world-view').value = state.myWorld.preferredView;
  $('#my-world-apply').textContent = t(state.myWorldActive ? 'myWorld.showAll' : 'myWorld.apply');
  renderMyWorldSummary(); updateMyWorldButton();
}
function renderMyWorldSummary() {
  const summary = $('#my-world-summary'); if (!summary) return;
  const count = state.events.filter(myWorldMatches).length;
  summary.textContent = t('myWorld.matches', { count });
}
function updateMyWorldButton() {
  const button = $('#my-world-button'); if (!button) return;
  const count = state.myWorld.regions.length + state.myWorld.categories.length;
  button.classList.toggle('active', state.myWorldActive);
  button.dataset.count = count ? String(count) : '';
  button.setAttribute('aria-pressed', String(state.myWorldActive));
}
async function searchMyWorldRegions(rawQuery) {
  const query = normalizedText(rawQuery).trim();
  if (query.length < 2) { renderMyWorldSearchResults(null); return; }
  $('#my-world-results').innerHTML = `<p class="muted">${esc(t('myWorld.searching'))}</p>`;
  await loadAdmin1({ silent: true });
  const results = state.admin1.map(region => { const name = normalizedText(region.name), country = normalizedText(region.country); const score = name.startsWith(query) ? 0 : country.startsWith(query) ? 1 : name.includes(query) ? 2 : country.includes(query) ? 3 : 9; return { region, score }; }).filter(item => item.score < 9).sort((a, b) => a.score - b.score || a.region.name.localeCompare(b.region.name, window.i18n.locale())).slice(0, 12).map(item => item.region);
  renderMyWorldSearchResults(results);
}
function openMyWorld() {
  renderMyWorld(); renderMyWorldSearchResults(null); $('#my-world-search').value = '';
  const dialog = $('#my-world-dialog'); if (!dialog.open) dialog.showModal();
}
const eventNewsStopwords = new Set(['about', 'active', 'activity', 'alert', 'area', 'coast', 'east', 'earthquake', 'event', 'flood', 'from', 'incendio', 'near', 'north', 'oeste', 'perto', 'regiao', 'region', 'south', 'storm', 'terremoto', 'tempestade', 'typhoon', 'west', 'wildfire']);
function eventNewsTokens(value) { return normalizedText(value).split(/[^\p{L}\p{N}]+/u).filter(token => token.length >= 4 && !eventNewsStopwords.has(token) && !/^\d+$/.test(token)); }
function relatedNewsForEvent(event, nearby) {
  const eventLocation = newsComparable(event.location), regionNameValue = nearby?.region?.name || '', country = nearby?.region?.country || '';
  const locationTokens = [...new Set(eventNewsTokens(`${event.location} ${event.title}`))];
  return recentNews().map(article => {
    const text = newsComparable(article.title), locationPhrase = eventLocation.trim().length >= 5 && text.includes(eventLocation);
    const regionPhrase = regionNameValue && newsHasPhrase(text, regionSearchName(regionNameValue));
    const matchedTokens = locationTokens.filter(token => text.includes(` ${token} `));
    const countryMatch = country && newsHasPhrase(text, country);
    const localMatch = locationPhrase || regionPhrase || matchedTokens.length > 0;
    const score = (locationPhrase ? 14 : 0) + (regionPhrase ? 9 : 0) + matchedTokens.length * 3 + (countryMatch ? 1 : 0);
    return { article, score, localMatch };
  }).filter(row => row.localMatch && row.score >= 3).sort((a, b) => b.score - a.score || new Date(b.article.seendate) - new Date(a.article.seendate)).slice(0, 5).map(row => row.article);
}
function renderEventRelatedNews(articles) {
  const container = $('#event-related-news');
  if (!articles.length) { container.innerHTML = `<p class="muted">${esc(t('eventDetail.noRelated'))}</p>`; return; }
  container.innerHTML = articles.map((article, index) => `<button type="button" class="event-related-item" data-event-news-index="${index}"><strong>${esc(article.title)}</strong><small>${esc(article.domain || t('news.source'))} · ${esc(article.seendate ? fmtTime(article.seendate, true) : t('news.noTime'))}</small></button>`).join('');
  container.querySelectorAll('[data-event-news-index]').forEach(button => button.onclick = () => openNewsPreview(articles[Number(button.dataset.eventNewsIndex)]));
}
async function enrichEventDetail(event) {
  await loadAdmin1({ silent: true });
  if (state.selected !== event.id || !$('#event-dialog').open) return;
  const nearby = nearestAdminRegion(event), withinRange = nearby && nearby.distance <= 600;
  state.detailRegion = withinRange ? nearby.region : null;
  $('#event-detail-near-region').textContent = withinRange ? `${nearby.region.name} · ${nearby.region.country}` : t('eventDetail.noNearbyRegion');
  $('#event-detail-distance').textContent = withinRange ? t('eventDetail.distanceApprox', { distance: Math.round(nearby.distance) }) : '';
  updateEventFavoriteButton();
  renderEventRelatedNews(relatedNewsForEvent(event, withinRange ? nearby : null));
}
function openEventDetail(event) {
  state.selected = event.id;
  state.detailRegion = null;
  const risk = $('#event-detail-risk'); risk.textContent = t(`risk.${event.severity}`); risk.style.color = severityColors[event.severity];
  $('#event-detail-title').textContent = displayEventTitle(event); $('#event-detail-location').textContent = event.location; $('#event-detail-summary').textContent = event.summary;
  $('#event-detail-category').textContent = eventCategoryLabel(event); $('#event-detail-metric').textContent = event.metric; $('#event-detail-source').textContent = event.source;
  $('#event-detail-time').textContent = fmtTime(event.timestamp, true); $('#event-detail-coordinates').textContent = `${coordinateLabel(event.lat, 'N', 'S')} · ${coordinateLabel(event.lon, 'E', 'W')}`; $('#event-detail-checked').textContent = state.updatedAt ? fmtTime(state.updatedAt, true) : '—';
  $('#event-detail-reported-location').textContent = event.location; $('#event-detail-near-region').textContent = t('eventDetail.locating'); $('#event-detail-distance').textContent = '';
  const mapUrl = new URL('https://www.openstreetmap.org/'); mapUrl.searchParams.set('mlat', event.lat); mapUrl.searchParams.set('mlon', event.lon); mapUrl.hash = `map=7/${event.lat}/${event.lon}`; $('#event-map-link').href = mapUrl.href;
  $('#event-related-news').innerHTML = `<p class="muted">${esc(t('eventDetail.relatedLoading'))}</p>`;
  updateEventFavoriteButton();
  const link = $('#event-detail-link'), verified = safeUrl(event.url); link.hidden = verified === '#'; if (verified !== '#') link.href = verified;
  $('#event-share-status').textContent = ''; const dialog = $('#event-dialog'); if (!dialog.open) dialog.showModal(); enrichEventDetail(event);
}
async function shareSelectedEvent() {
  const event = state.events.find(item => item.id === state.selected); if (!event) return;
  const url = new URL(location.href); url.search = ''; url.searchParams.set('event', event.id);
  const text = `${displayEventTitle(event)}\n${event.location}\n${event.metric} · ${fmtTime(event.timestamp, true)}\n${t('eventDetail.source')}: ${event.source}`;
  const status = $('#event-share-status');
  try {
    if (navigator.share) await navigator.share({ title: displayEventTitle(event), text, url: url.href });
    else { await navigator.clipboard.writeText(`${text}\n${url.href}`); status.textContent = t('eventDetail.copied'); }
  } catch (error) { if (error.name !== 'AbortError') status.textContent = t('eventDetail.shareFailed'); }
}

let globe, map, baseMapLayer, satelliteLayer, regionLayer, conflictLayer, issTrailLayer, temperatureLayer, auroraLayer, regionRenderFrame, activeGlobeTexture = '', fallbackTemperatureTexture = null, auroraTextureCache = null, auroraTextureRequest = 0;
let mapMarkers = [], environmentMarkers = [], issMapMarker = null;
function activateGlobePoint(point) {
  if (point.clusterEvents?.length) { state.expandedGlobeCluster = point.id; globe?.pointOfView({ lat: point.lat, lng: point.lon, altitude: .72 }, 700); renderGlobeData(); return; }
  if (point.eventId) selectEvent(point.eventId);
  else if (point.kind === 'conflict-media') selectConflictRegion(point);
  else if (point.kind === 'region') selectRegion(point);
  else loadWeather(point.lat, point.lon);
}
function globeHtmlElement(point) {
  const element = document.createElement('button'), count = point.clusterEvents?.length || 1;
  element.type = 'button'; element.className = `globe-map-symbol ${point.selected ? 'selected' : ''}`;
  element.innerHTML = `${symbolSvg(symbolKind(point), point.color || '#60e6da', point.selected)}${count > 1 ? `<b>${count > 99 ? '99+' : count}</b>` : ''}`;
  element.title = [point.title, point.metric, point.location].filter(Boolean).join(' · ');
  element.setAttribute('aria-label', element.title || symbolLabel(symbolKind(point)));
  element.onclick = event => { event.stopPropagation(); activateGlobePoint(point); };
  return element;
}

function currentTheme() { return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; }
function mapTileUrl() { return `https://{s}.basemaps.cartocdn.com/${currentTheme() === 'light' ? 'light_all' : 'dark_all'}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_BASEMAP_KEY)}`; }
function applyMapTheme() { if (!map) return; if (baseMapLayer) baseMapLayer.remove(); baseMapLayer = L.tileLayer(mapTileUrl(), { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>', subdomains: 'abcd', maxZoom: 18 }).addTo(map); baseMapLayer.bringToBack(); }
function setTheme(theme, persist = true) {
  const next = theme === 'light' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; document.documentElement.style.colorScheme = next;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = next === 'light' ? '#eaf1f0' : '#05090d';
  const button = $('#theme-button'); if (button) { button.textContent = t(next === 'light' ? 'theme.dark' : 'theme.light'); button.setAttribute('aria-pressed', String(next === 'light')); }
  if (persist) try { localStorage.setItem('site-theme', next); } catch { /* armazenamento pode estar desativado */ }
  applyMapTheme(); if (map) setTimeout(() => map.invalidateSize(), 30);
}

function initVisuals() {
  try {
    map = L.map('map', { worldCopyJump: true, preferCanvas: true }).setView([18, 0], 2);
    map.createPane('temperaturePane'); map.getPane('temperaturePane').style.zIndex = 250; map.getPane('temperaturePane').style.pointerEvents = 'none';
    map.createPane('auroraPane'); map.getPane('auroraPane').style.zIndex = 255; map.getPane('auroraPane').style.pointerEvents = 'none';
    applyMapTheme();
    temperatureLayer = createTemperatureFieldLayer();
    auroraLayer = createAuroraFieldLayer();
    map.on('mousemove', event => updateTemperatureReadout(event.latlng));
    map.on('mouseout', () => { const readout = $('#temperature-readout'); if (readout) readout.hidden = true; });
    map.on('moveend zoomend', scheduleMapOverlays);
    $('#globe').hidden = true; $('#map').hidden = false; $('#view-button').textContent = t('stage.globe3d'); $('#visual-loading').hidden = true;
    setTimeout(() => map.invalidateSize(), 50);
  } catch { map = null; }
  if (!map) $('#visual-loading').innerHTML = `<strong>${esc(t('stage.unavailable'))}</strong>`;
  renderGlobeData();
}

function initGlobe() {
  if (globe) return true;
  try {
    globe = Globe()($('#globe')).backgroundColor('rgba(0,0,0,0)').globeImageUrl(globeBaseUrl()).bumpImageUrl('assets/earth-topology.png').showAtmosphere(true).atmosphereColor('#53d9de').atmosphereAltitude(.15).showGraticules(true)
      .pointLat('lat').pointLng('lon').pointRadius(point => point.kind === 'conflict-media' ? .12 : point.kind === 'region' ? .07 : point.kind === 'temperature' ? .18 : point.kind === 'aurora' ? .12 : point.kind === 'air' ? .16 : point.kind === 'iss' ? .55 : state.selected === point.id ? .55 : .34)
      .pointAltitude(point => point.kind === 'iss' ? .09 : point.kind === 'conflict-media' ? .045 : state.selected === point.id ? .07 : point.kind === 'event' ? .035 : .008).pointColor('color')
      .pointLabel(point => `<div class="globe-label"><span>${esc(point.metric || point.kind.toUpperCase())}</span><strong>${esc(point.title || '')}</strong><small>${esc(point.location || '')}</small></div>`)
      .onPointClick(point => { if (point.eventId) selectEvent(point.eventId); else if (point.kind === 'conflict-media') selectConflictRegion(point); else if (point.kind === 'region') selectRegion(point); else loadWeather(point.lat, point.lon); }).onGlobeClick(({ lat, lng }) => { renderCoordinate(lat, lng); loadWeather(lat, lng); })
      .htmlLat('lat').htmlLng('lon').htmlAltitude(point => point.kind === 'iss' ? .075 : point.selected ? .055 : .035).htmlElement(globeHtmlElement).htmlTransitionDuration(0)
      .pathPoints('points').pathPointLat('lat').pathPointLng('lon').pathColor('color').pathStroke('stroke')
      .polygonGeoJsonGeometry('geometry').polygonCapColor('color').polygonSideColor(() => 'rgba(0,0,0,0)').polygonStrokeColor(() => null).polygonAltitude(cell => cell.altitude).polygonCapCurvatureResolution(2).polygonsTransitionDuration(0)
      .ringLat('lat').ringLng('lon').ringColor(point => point.color).ringMaxRadius(point => point.radius).ringPropagationSpeed(2).ringRepeatPeriod(1400);
    globe.controls().autoRotate = true; globe.controls().autoRotateSpeed = .16; globe.controls().enableDamping = true;
    window.addEventListener('resize', resizeGlobe); resizeGlobe(); renderGlobeData(); return true;
  } catch (error) {
    globe = null; return false;
  }
}

function resizeGlobe() { const box = $('#globe').getBoundingClientRect(); if (globe) globe.width(box.width).height(box.height); }
function tempColor(value) { if (value <= -25) return '#6d4dff'; if (value <= -10) return '#447dff'; if (value <= 0) return '#53c6ff'; if (value <= 10) return '#55e5c3'; if (value <= 20) return '#bddd4e'; if (value <= 30) return '#ffbc42'; if (value <= 38) return '#ff7043'; return '#e83e58'; }

const temperatureStops = [[-55, [68, 45, 180]], [-35, [78, 91, 232]], [-20, [64, 153, 238]], [-5, [70, 205, 225]], [10, [75, 207, 166]], [20, [187, 218, 78]], [30, [255, 190, 66]], [40, [255, 103, 61]], [55, [205, 36, 75]]];
function temperatureGridPoints(grid) {
  if (!grid?.values?.length || !Number.isFinite(grid.step)) return [];
  return grid.values.flatMap((temperature, index) => {
    if (!Number.isFinite(temperature)) return [];
    const row = Math.floor(index / grid.columns), column = index % grid.columns;
    return [{ lat: grid.latMin + row * grid.step, lon: grid.lonMin + column * grid.step, temperature }];
  });
}
function temperatureStatus() {
  const grid = state.temperatureGrid;
  if (!grid) return t('layer.tempUnavailable');
  return t('layer.tempField', { time: fmtTime(grid.observedAt), min: Number(grid.min).toFixed(1), max: Number(grid.max).toFixed(1) });
}
function interpolateTemperatureColor(value, alpha = 158) {
  if (!Number.isFinite(value)) return [0, 0, 0, 0];
  let lower = temperatureStops[0], upper = temperatureStops.at(-1);
  for (let index = 1; index < temperatureStops.length; index++) if (value <= temperatureStops[index][0]) { lower = temperatureStops[index - 1]; upper = temperatureStops[index]; break; }
  const ratio = Math.max(0, Math.min(1, (value - lower[0]) / Math.max(.001, upper[0] - lower[0])));
  return [...lower[1].map((channel, index) => Math.round(channel + (upper[1][index] - channel) * ratio)), alpha];
}
function temperatureAt(lat, lon) {
  const grid = state.temperatureGrid;
  if (!grid?.values?.length) return null;
  const boundedLat = Math.max(grid.latMin, Math.min(grid.latMax, lat));
  const wrappedLon = ((lon - grid.lonMin) % 360 + 360) % 360 + grid.lonMin;
  const row = (boundedLat - grid.latMin) / grid.step, column = (wrappedLon - grid.lonMin) / grid.step;
  const row0 = Math.floor(row), row1 = Math.min(grid.rows - 1, row0 + 1), col0 = Math.floor(column) % grid.columns, col1 = (col0 + 1) % grid.columns;
  const dy = row - row0, dx = column - Math.floor(column);
  const values = [grid.values[row0 * grid.columns + col0], grid.values[row0 * grid.columns + col1], grid.values[row1 * grid.columns + col0], grid.values[row1 * grid.columns + col1]];
  const valid = values.filter(Number.isFinite); if (!valid.length) return null; if (valid.length < 4) return valid[0];
  return values[0] * (1 - dx) * (1 - dy) + values[1] * dx * (1 - dy) + values[2] * (1 - dx) * dy + values[3] * dx * dy;
}
function createTemperatureFieldLayer() {
  const FieldLayer = L.Layer.extend({
    onAdd(currentMap) {
      this._map = currentMap; this._canvas = L.DomUtil.create('canvas', 'temperature-field-canvas'); this._canvas.setAttribute('aria-hidden', 'true');
      currentMap.getPane('temperaturePane').appendChild(this._canvas); currentMap.on('moveend zoomend resize', this._reset, this); this._reset();
    },
    onRemove(currentMap) { currentMap.off('moveend zoomend resize', this._reset, this); this._canvas?.remove(); },
    redraw() { if (this._map) this._reset(); },
    _reset() {
      const size = this._map.getSize(), topLeft = this._map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._canvas, topLeft); this._canvas.width = Math.max(1, size.x); this._canvas.height = Math.max(1, size.y); this._draw(size);
    },
    _draw(size) {
      if (!state.showTemperature || !state.temperatureGrid) return;
      const scale = 4, width = Math.max(1, Math.ceil(size.x / scale)), height = Math.max(1, Math.ceil(size.y / scale));
      const field = document.createElement('canvas'); field.width = width; field.height = height; const context = field.getContext('2d'), image = context.createImageData(width, height), temperatures = new Float32Array(width * height), zoom = this._map.getZoom(), origin = this._map.getPixelOrigin();
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const point = this._map.unproject([origin.x + x * scale, origin.y + y * scale], zoom), temperature = temperatureAt(point.lat, point.lng), color = interpolateTemperatureColor(temperature); temperatures[y * width + x] = Number.isFinite(temperature) ? temperature : Number.NaN;
        const offset = (y * width + x) * 4; image.data[offset] = color[0]; image.data[offset + 1] = color[1]; image.data[offset + 2] = color[2]; image.data[offset + 3] = color[3];
      }
      context.putImageData(image, 0, 0); const output = this._canvas.getContext('2d'); output.imageSmoothingEnabled = true; output.drawImage(field, 0, 0, size.x, size.y); drawTemperatureContours(output, temperatures, width, height, scale);
    }
  });
  return new FieldLayer();
}
function drawTemperatureContours(context, temperatures, width, height, scale) {
  const segmentCases = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 2], [0, 1]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]], 10: [[0, 3], [1, 2]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[3, 0]] };
  const edgePoint = (edge, x, y, level, a, b, c, d) => {
    const between = (first, second) => Math.max(0, Math.min(1, (level - first) / ((second - first) || .001)));
    if (edge === 0) return [(x + between(a, b)) * scale, y * scale];
    if (edge === 1) return [(x + 1) * scale, (y + between(b, c)) * scale];
    if (edge === 2) return [(x + between(d, c)) * scale, (y + 1) * scale];
    return [x * scale, (y + between(a, d)) * scale];
  };
  context.save(); context.lineWidth = .65; context.strokeStyle = currentTheme() === 'light' ? 'rgba(20,35,40,.34)' : 'rgba(255,255,255,.32)';
  for (let level = -40; level <= 50; level += 10) {
    context.beginPath();
    for (let y = 0; y < height - 1; y++) for (let x = 0; x < width - 1; x++) {
      const a = temperatures[y * width + x], b = temperatures[y * width + x + 1], c = temperatures[(y + 1) * width + x + 1], d = temperatures[(y + 1) * width + x];
      if (![a, b, c, d].every(Number.isFinite)) continue;
      const mask = (a >= level ? 1 : 0) | (b >= level ? 2 : 0) | (c >= level ? 4 : 0) | (d >= level ? 8 : 0);
      for (const pair of segmentCases[mask] || []) { const start = edgePoint(pair[0], x, y, level, a, b, c, d), end = edgePoint(pair[1], x, y, level, a, b, c, d); context.moveTo(start[0], start[1]); context.lineTo(end[0], end[1]); }
    }
    context.stroke();
  }
  context.restore();
}
function updateTemperatureReadout(latlng) {
  const readout = $('#temperature-readout'); if (!readout || !state.showTemperature || state.view !== 'map') { if (readout) readout.hidden = true; return; }
  const value = temperatureAt(latlng.lat, latlng.lng); if (!Number.isFinite(value)) { readout.hidden = true; return; }
  readout.textContent = t('temperature.readout', { value: value.toFixed(1), time: fmtTime(state.temperatureGrid.observedAt) }); readout.hidden = false;
}
function updateTemperaturePresentation() {
  const active = Boolean(state.showTemperature && state.temperatureGrid), mapActive = Boolean(map && state.view === 'map' && active);
  if (mapActive && !map.hasLayer(temperatureLayer)) temperatureLayer.addTo(map); else if (!mapActive && temperatureLayer && map.hasLayer(temperatureLayer)) temperatureLayer.remove();
  if (mapActive) temperatureLayer.redraw();
  const legend = $('#temperature-legend'); if (legend) legend.hidden = !active;
  const readout = $('#temperature-readout'); if (readout && !mapActive) readout.hidden = true;
  updateGlobeTexture();
}

function auroraAlpha(intensity) { return Math.max(.035, Math.min(.72, .025 + Number(intensity || 0) / 115)); }
function auroraSignature() {
  if (!state.aurora.length) return 'empty';
  const checksum = sample(state.aurora, 80).reduce((sum, point) => sum + Math.round(point.intensity * 10) + Math.round(point.lat * 3) + Math.round(point.lon), 0);
  return `${state.aurora.length}-${checksum}`;
}
function auroraColor(point) { return point.lat >= 0 ? [56, 255, 132] : [177, 80, 255]; }
function paintAuroraGlow(context, x, y, radius, point) {
  const [red, green, blue] = auroraColor(point), alpha = auroraAlpha(point.intensity);
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(${red},${green},${blue},${alpha})`);
  gradient.addColorStop(.42, `rgba(${red},${green},${blue},${alpha * .52})`);
  gradient.addColorStop(1, `rgba(${red},${green},${blue},0)`);
  context.fillStyle = gradient; context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}
function createAuroraFieldLayer() {
  const AuroraLayer = L.Layer.extend({
    onAdd(currentMap) {
      this._map = currentMap; this._canvas = L.DomUtil.create('canvas', 'aurora-field-canvas'); this._canvas.setAttribute('aria-hidden', 'true'); this._canvas.style.pointerEvents = 'none';
      currentMap.getPane('auroraPane').appendChild(this._canvas); currentMap.on('moveend zoomend resize', this._reset, this); this._reset();
    },
    onRemove(currentMap) { currentMap.off('moveend zoomend resize', this._reset, this); this._canvas?.remove(); },
    redraw() { if (this._map) this._reset(); },
    _reset() {
      const size = this._map.getSize(), topLeft = this._map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._canvas, topLeft); this._canvas.width = Math.max(1, size.x); this._canvas.height = Math.max(1, size.y);
      if (!state.showAurora || !state.aurora.length) return;
      const context = this._canvas.getContext('2d'), zoom = this._map.getZoom(), radius = Math.max(9, Math.min(58, 11 * Math.pow(1.55, zoom - 2)));
      context.clearRect(0, 0, size.x, size.y); context.save(); context.globalCompositeOperation = 'screen';
      for (const point of state.aurora) {
        const projected = this._map.latLngToContainerPoint([point.lat, point.lon]);
        if (projected.x < -radius || projected.x > size.x + radius || projected.y < -radius || projected.y > size.y + radius) continue;
        paintAuroraGlow(context, projected.x, projected.y, radius, point);
      }
      context.restore();
    }
  });
  return new AuroraLayer();
}
function updateAuroraPresentation() {
  if (!map || !auroraLayer) return;
  const active = state.showAurora && state.view === 'map' && state.aurora.length > 0;
  if (active && !map.hasLayer(auroraLayer)) auroraLayer.addTo(map); else if (!active && map.hasLayer(auroraLayer)) auroraLayer.remove();
  if (active) auroraLayer.redraw();
}

function auroraGlobeSurface() {
  if (!state.showAurora || !state.aurora.length) return [];
  const bins = new Map();
  for (const point of state.aurora) {
    const lat = Math.round(point.lat / 4) * 4, lon = Math.floor(normalizeLon(point.lon) / 4) * 4, key = `${lat}:${lon}`;
    const current = bins.get(key);
    if (!current || point.intensity > current.intensity) bins.set(key, { lat, lon, intensity: Number(point.intensity || 0) });
  }
  return [...bins.values()].filter(cell => cell.intensity >= 8).map(cell => {
    const halfLat = 2.8, halfLon = 2.8, south = Math.max(-89.5, cell.lat - halfLat), north = Math.min(89.5, cell.lat + halfLat), west = Math.max(-180, cell.lon - halfLon), east = Math.min(180, cell.lon + halfLon);
    const alpha = Math.max(.1, Math.min(.42, .06 + (cell.intensity - 7) / 20));
    return {
      geometry: { type: 'Polygon', coordinates: [[[west, south], [west, north], [east, north], [east, south], [west, south]]] },
      color: cell.lat >= 0 ? `rgba(35,255,118,${alpha})` : `rgba(170,70,255,${alpha})`,
      altitude: .003 + Math.min(.003, cell.intensity / 6000)
    };
  });
}

function globeBaseUrl() { return state.showSatellite ? gibsGlobeUrl(satelliteDate()) : 'assets/earth-night.jpg'; }
function loadTextureImage(url) {
  return new Promise((resolve, reject) => { const image = new Image(); image.crossOrigin = 'anonymous'; image.onload = () => resolve(image); image.onerror = reject; image.src = url; });
}
async function auroraGlobeUrl() {
  const key = `${globeBaseUrl()}-${auroraSignature()}`;
  if (auroraTextureCache?.key === key) return auroraTextureCache.url;
  let base;
  try { base = await loadTextureImage(globeBaseUrl()); } catch { base = await loadTextureImage('assets/earth-night.jpg'); }
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
  const context = canvas.getContext('2d'); context.drawImage(base, 0, 0, canvas.width, canvas.height); context.save(); context.globalCompositeOperation = 'screen';
  for (const point of state.aurora) {
    const x = (normalizeLon(point.lon) + 180) / 360 * canvas.width, y = (90 - point.lat) / 180 * canvas.height;
    const radius = 21 + Math.min(15, point.intensity * .18);
    paintAuroraGlow(context, x, y, radius, point);
    if (x < radius) paintAuroraGlow(context, x + canvas.width, y, radius, point);
    if (x > canvas.width - radius) paintAuroraGlow(context, x - canvas.width, y, radius, point);
  }
  context.restore(); auroraTextureCache = { key, url: canvas.toDataURL('image/jpeg', .9) }; return auroraTextureCache.url;
}
function browserTemperatureTexture() {
  const grid = state.temperatureGrid, key = grid?.observedAt || '';
  if (!grid) return null;
  if (fallbackTemperatureTexture?.key === key) return fallbackTemperatureTexture.url;
  const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 360;
  const context = canvas.getContext('2d'), image = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const lat = 90 - (y + .5) * 180 / canvas.height, lon = -180 + (x + .5) * 360 / canvas.width;
    const color = interpolateTemperatureColor(temperatureAt(lat, lon), 255), offset = (y * canvas.width + x) * 4;
    image.data[offset] = color[0]; image.data[offset + 1] = color[1]; image.data[offset + 2] = color[2]; image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0); fallbackTemperatureTexture = { key, url: canvas.toDataURL('image/jpeg', .86) };
  return fallbackTemperatureTexture.url;
}
function temperatureGlobeUrl() {
  const grid = state.temperatureGrid;
  if (!grid) return null;
  if (grid.texture) return `${grid.texture}?v=${encodeURIComponent(grid.modelRun || grid.observedAt || grid.generatedAt || '')}`;
  return browserTemperatureTexture();
}
async function updateGlobeTexture() {
  if (!globe) return;
  auroraTextureRequest++;
  const next = state.showTemperature ? temperatureGlobeUrl() : globeBaseUrl();
  if (next && next !== activeGlobeTexture) { activeGlobeTexture = next; globe.globeImageUrl(next); }
}
function airColor(value) { if (value <= 50) return '#55e58d'; if (value <= 100) return '#f0d95f'; if (value <= 150) return '#ff9e44'; if (value <= 200) return '#ff455d'; if (value <= 300) return '#a45cff'; return '#7b1734'; }
function normalizeLon(lon) { return ((lon + 540) % 360) - 180; }

function terminatorPath(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0); const day = Math.floor((date - start) / 86400000);
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60; const gamma = 2 * Math.PI / 365 * (day - 1 + (hour - 12) / 24);
  const declination = .006918 - .399912 * Math.cos(gamma) + .070257 * Math.sin(gamma) - .006758 * Math.cos(2 * gamma) + .000907 * Math.sin(2 * gamma) - .002697 * Math.cos(3 * gamma) + .00148 * Math.sin(3 * gamma);
  const equation = 229.18 * (.000075 + .001868 * Math.cos(gamma) - .032077 * Math.sin(gamma) - .014615 * Math.cos(2 * gamma) - .040849 * Math.sin(2 * gamma));
  const sunLon = normalizeLon((720 - (date.getUTCHours() * 60 + date.getUTCMinutes()) - equation) / 4);
  const lat1 = declination, lon1 = sunLon * Math.PI / 180, distance = Math.PI / 2;
  const points = [];
  for (let bearing = 0; bearing <= 360; bearing += 2) { const angle = bearing * Math.PI / 180; const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distance) + Math.cos(lat1) * Math.sin(distance) * Math.cos(angle)); const lon2 = lon1 + Math.atan2(Math.sin(angle) * Math.sin(distance) * Math.cos(lat1), Math.cos(distance) - Math.sin(lat1) * Math.sin(lat2)); points.push({ lat: lat2 * 180 / Math.PI, lon: normalizeLon(lon2 * 180 / Math.PI) }); }
  return { points, color: '#f0d95f', stroke: .42 };
}

function regionName(region) { return region?.name || '—'; }
function regionCountry(region) { return region?.country || '—'; }
function selectedNewsLanguage() { return window.i18n?.language || 'pt-BR'; }
function newsComparable(value) { return ` ${normalizedText(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `; }
function newsHasPhrase(comparable, value) { const phrase = newsComparable(value).trim(); return phrase.length >= 3 && comparable.includes(` ${phrase} `); }
function regionSearchName(name) { return String(name || '').replace(/^(?:de|da|do|das|dos)\s+/i, ''); }
function recentNews() {
  const now = Date.now();
  const language = selectedNewsLanguage();
  return state.news.filter(article => { const time = new Date(article.seendate).getTime(); return article.language === language && Number.isFinite(time) && time <= now + 15 * 60000 && now - time <= NEWS_MAX_AGE; }).sort((a, b) => new Date(b.seendate) - new Date(a.seendate));
}
function rebuildNewsRegions() {
  if (!state.admin1.length) { state.newsRegions = []; return []; }
  const articles = recentNews().map(article => ({ article, text: newsComparable(article.title) }));
  const nameCounts = new Map(), countryNames = new Set(state.admin1.map(region => newsComparable(region.country).trim()));
  state.admin1.forEach(region => { const key = newsComparable(regionSearchName(region.name)).trim(); if (key) nameCounts.set(key, (nameCounts.get(key) || 0) + 1); });
  state.newsRegions = state.admin1.flatMap(region => {
    const name = regionSearchName(region.name), key = newsComparable(name).trim(); if (key.length < 3) return [];
    const ambiguous = nameCounts.get(key) !== 1 || countryNames.has(key);
    const matches = articles.filter(row => newsHasPhrase(row.text, name) && (!ambiguous || newsHasPhrase(row.text, region.country))).slice(0, 5).map(row => row.article);
    if (!matches.length) return [];
    return [{ ...region, articles: matches, headline: matches[0], title: matches[0].title, metric: t('region.newsMetric'), location: `${region.name} · ${region.country}` }];
  });
  if (state.showRegions) $('#region-status').textContent = t('layer.regionsCount', { count: state.newsRegions.length });
  return state.newsRegions;
}
function selectRegion(region) { state.selectedRegion = region; const name = regionName(region), country = regionCountry(region); state.newsQuery = { term: name, lat: region.lat, lon: region.lon, country }; $('#region-input').value = `${name}, ${country}`; $('#region-status').textContent = t('layer.regionSelected', { name: name.toUpperCase() }); focusCoordinate(region.lat, region.lon, 1.35); loadWeather(region.lat, region.lon); if (region.articles?.length) renderNews(region.articles, name); else loadNews(name, region.lat, region.lon, country); renderGlobeData(); }

const conflictCountryAliases = {
  Ukraine: ['Ucrânia', 'Ucrania'], Russia: ['Rússia', 'Rusia'], Syria: ['Síria', 'Siria'], Lebanon: ['Líbano', 'Libano'],
  Yemen: ['Iêmen', 'Iemen', 'Yemén'], Sudan: ['Sudão', 'Sudán'], 'S. Sudan': ['Sudão do Sul', 'Sudán del Sur', 'South Sudan'],
  Myanmar: ['Mianmar', 'Birmania'], 'South Korea': ['Coreia do Sul', 'Corea del Sur'], 'North Korea': ['Coreia do Norte', 'Corea del Norte'],
  'Republic of the Congo': ['República do Congo', 'República del Congo'], 'Democratic Republic of the Congo': ['República Democrática do Congo', 'República Democrática del Congo'],
  'United States of America': ['Estados Unidos', 'EUA', 'EEUU', 'United States'], 'United Kingdom': ['Reino Unido'],
  Germany: ['Alemanha', 'Alemania'], France: ['França', 'Francia'], Spain: ['Espanha', 'España'], China: ['China'],
  Israel: ['Israel'], Iran: ['Irã', 'Irán'], Somalia: ['Somália', 'Somalia']
};
function recentConflictNews() {
  const now = Date.now(), language = selectedNewsLanguage();
  return state.conflictNews.filter(article => { const time = new Date(article.seendate).getTime(); return article.language === language && Number.isFinite(time) && time <= now + 15 * 60000 && now - time <= NEWS_MAX_AGE; }).sort((a, b) => new Date(b.seendate) - new Date(a.seendate));
}
function countryNames(country) { return [country, ...(conflictCountryAliases[country] || [])]; }
function countryCentres() {
  const groups = new Map();
  state.admin1.forEach(region => { const rows = groups.get(region.country) || []; rows.push(region); groups.set(region.country, rows); });
  return [...groups].map(([country, regions]) => ({ country, lat: regions.reduce((sum, region) => sum + region.lat, 0) / regions.length, lon: regions.reduce((sum, region) => sum + region.lon, 0) / regions.length }));
}
function rebuildConflictRegions() {
  if (!state.admin1.length) { state.conflictRegions = []; return []; }
  const adminNameCounts = new Map();
  state.admin1.forEach(region => { const key = newsComparable(regionSearchName(region.name)).trim(); if (key) adminNameCounts.set(key, (adminNameCounts.get(key) || 0) + 1); });
  const regionsBySpecificity = [...state.admin1].sort((a, b) => regionSearchName(b.name).length - regionSearchName(a.name).length);
  const countries = countryCentres().sort((a, b) => Math.max(...countryNames(b.country).map(name => name.length)) - Math.max(...countryNames(a.country).map(name => name.length)));
  const groups = new Map();
  for (const article of recentConflictNews()) {
    const text = newsComparable(article.title);
    let match = regionsBySpecificity.find(region => {
      const name = regionSearchName(region.name), key = newsComparable(name).trim();
      return key.length >= 4 && newsHasPhrase(text, name) && (adminNameCounts.get(key) === 1 || countryNames(region.country).some(country => newsHasPhrase(text, country)));
    });
    let key, point;
    if (match) {
      key = `admin1:${match.id}`;
      point = { id: `conflict-${match.id}`, kind: 'conflict-media', lat: match.lat, lon: match.lon, name: match.name, country: match.country, location: `${match.name} · ${match.country}`, referenceType: 'admin1' };
    } else {
      match = countries.find(country => countryNames(country.country).some(name => newsHasPhrase(text, name)));
      if (!match) continue;
      key = `country:${match.country}`;
      point = { id: `conflict-country-${normalizedText(match.country).replace(/\W+/g, '-')}`, kind: 'conflict-media', lat: match.lat, lon: match.lon, name: match.country, country: match.country, location: match.country, referenceType: 'country' };
    }
    const group = groups.get(key) || { ...point, articles: [] };
    if (group.articles.length < 5) group.articles.push(article);
    groups.set(key, group);
  }
  state.conflictRegions = [...groups.values()].slice(0, 30).map(point => ({ ...point, headline: point.articles[0], title: point.articles[0]?.title || point.location, metric: t('conflict.mediaMetric'), color: '#ff9e44' }));
  if (state.showConflicts) $('#conflict-status').textContent = state.conflictRegions.length ? t('layer.conflictsCount', { count: state.conflictRegions.length }) : t('layer.conflictsEmpty');
  return state.conflictRegions;
}
function renderConflictArticles(articles) {
  const rows = (articles || []).slice(0, 5), container = $('#conflict-news');
  container.innerHTML = rows.length ? rows.map((article, index) => `<button class="event-related-item" type="button" data-conflict-news="${index}"><strong>${esc(article.title)}</strong><small>${esc(article.domain || t('news.source'))} · ${esc(article.seendate ? fmtTime(article.seendate, true) : t('news.noTime'))}</small></button>`).join('') : `<p class="muted">${esc(t('conflict.noArticles'))}</p>`;
  container.querySelectorAll('[data-conflict-news]').forEach(button => button.onclick = () => openNewsPreview(rows[Number(button.dataset.conflictNews)]));
}
function selectConflictRegion(point) {
  state.selectedConflict = point;
  focusCoordinate(point.lat, point.lon, 1.5);
  $('#conflict-title').textContent = point.headline?.title || point.title;
  $('#conflict-location').textContent = point.location;
  $('#conflict-scope').textContent = point.location;
  $('#conflict-reference').textContent = t(point.referenceType === 'admin1' ? 'conflict.referenceAdmin1' : 'conflict.referenceCountry');
  $('#conflict-coordinates').textContent = `${coordinateLabel(point.lat, 'N', 'S')} · ${coordinateLabel(point.lon, 'E', 'W')}`;
  $('#conflict-time').textContent = point.headline?.seendate ? fmtTime(point.headline.seendate, true) : '—';
  renderConflictArticles(point.articles);
  const dialog = $('#conflict-dialog'); if (!dialog.open) dialog.showModal();
  renderGlobeData();
}

function environmentPoints() {
  if (state.showTemperature) return [];
  if (state.showAurora) return [];
  if (state.showAir) return state.airQuality.map((point, index) => ({ ...point, id: `air-${index}`, kind: 'air', color: airColor(point.aqi), metric: `AQI ${Math.round(point.aqi)}`, title: t('air.title'), location: `PM2.5 ${point.pm25 == null ? '—' : point.pm25.toFixed(1)} µg/m³` }));
  return [];
}

function renderMapEventMarkers() {
  if (!map) return;
  mapMarkers.forEach(marker => marker.remove()); mapMarkers = [];
  const zoom = map.getZoom(), bounds = map.getBounds().pad(.25);
  const visible = filteredEvents().filter(event => zoom <= 2 || bounds.contains([event.lat, event.lon]));
  const cellSize = zoom <= 2 ? 18 : zoom === 3 ? 10 : zoom === 4 ? 5 : 0;
  const severityRank = { critical: 4, high: 3, medium: 2, low: 1 };
  if (cellSize) {
    const groups = new Map();
    visible.forEach(event => {
      const kind = symbolKind(event), key = `${kind}:${Math.floor((event.lat + 90) / cellSize)}:${Math.floor((event.lon + 180) / cellSize)}`;
      const group = groups.get(key) || { kind, events: [], lat: 0, lon: 0, severity: 'low' };
      group.events.push(event); group.lat += event.lat; group.lon += event.lon;
      if (severityRank[event.severity] > severityRank[group.severity]) group.severity = event.severity;
      groups.set(key, group);
    });
    mapMarkers = [...groups.values()].map(group => {
      const count = group.events.length, lat = group.lat / count, lon = group.lon / count, color = severityColors[group.severity];
      if (count === 1) { const event = group.events[0], selected = event.id === state.selected; return L.marker([event.lat, event.lon], { icon: leafletSymbolIcon(group.kind, selected ? '#c7ff4a' : color, selected, selected ? 32 : 24), keyboard: true, title: displayEventTitle(event) }).bindTooltip(`${esc(displayEventTitle(event))} · ${esc(event.metric)}`).on('click', () => selectEvent(event.id)).addTo(map); }
      return L.marker([lat, lon], { icon: leafletSymbolIcon(group.kind, color, false, 27, count), keyboard: true, title: `${count} · ${symbolLabel(group.kind)}` }).bindTooltip(`<strong>${count} · ${esc(symbolLabel(group.kind))}</strong><br>${esc(t('map.clusterHint'))}`).on('click', () => map.flyTo([lat, lon], Math.min(6, zoom + 2), { duration: .7 })).addTo(map);
    });
    return;
  }
  mapMarkers = visible.map(event => { const selected = event.id === state.selected, color = selected ? '#c7ff4a' : severityColors[event.severity]; return L.marker([event.lat, event.lon], { icon: leafletSymbolIcon(symbolKind(event), color, selected, selected ? 34 : 28), keyboard: true, title: displayEventTitle(event) }).bindTooltip(`${esc(displayEventTitle(event))} · ${esc(event.metric)}`).on('click', () => selectEvent(event.id)).addTo(map); });
}

function renderMapRegions() {
  if (!map) return;
  if (regionLayer) { regionLayer.remove(); regionLayer = null; }
  if (!state.showRegions || !state.newsRegions.length) return;
  const bounds = map.getBounds().pad(.12);
  const visible = state.newsRegions.filter(region => bounds.contains([region.lat, region.lon])).slice(0, 40);
  regionLayer = L.layerGroup(visible.map(region => { const selected = region === state.selectedRegion; return L.marker([region.lat, region.lon], { icon: leafletSymbolIcon('news', selected ? '#c7ff4a' : '#60e6da', selected, selected ? 31 : 25), keyboard: true, title: `${regionName(region)} · ${regionCountry(region)}` }).bindTooltip(`<strong>${esc(regionName(region))}</strong> · ${esc(regionCountry(region))}<br>${esc(region.headline?.title || '')}`).on('click', () => selectRegion(region)); })).addTo(map);
}

function renderMapConflicts() {
  if (!map) return;
  if (conflictLayer) { conflictLayer.remove(); conflictLayer = null; }
  if (!state.showConflicts || !state.conflictRegions.length) return;
  const bounds = map.getBounds().pad(.12);
  const visible = state.conflictRegions.filter(point => bounds.contains([point.lat, point.lon])).slice(0, 30);
  conflictLayer = L.layerGroup(visible.map(point => { const selected = point === state.selectedConflict; return L.marker([point.lat, point.lon], { icon: leafletSymbolIcon('conflict', selected ? '#c7ff4a' : '#ff9e44', selected, selected ? 33 : 28), keyboard: true, title: point.location }).bindTooltip(`<strong>${esc(t('conflict.eyebrow'))}</strong><br>${esc(point.location)}<br>${esc(point.headline?.title || '')}`).on('click', () => selectConflictRegion(point)); })).addTo(map);
}

function scheduleMapOverlays() {
  cancelAnimationFrame(regionRenderFrame);
  regionRenderFrame = requestAnimationFrame(() => { renderMapEventMarkers(); renderMapRegions(); renderMapConflicts(); });
}

function clusterGlobeEvents(points) {
  const cellSize = 12, ranks = { critical: 4, high: 3, medium: 2, low: 1 }, groups = new Map();
  points.forEach(point => {
    const kind = symbolKind(point), key = `${kind}:${Math.floor((point.lat + 90) / cellSize)}:${Math.floor((point.lon + 180) / cellSize)}`;
    const group = groups.get(key) || { key, kind, points: [], lat: 0, lon: 0, severity: 'low' };
    group.points.push(point); group.lat += point.lat; group.lon += point.lon;
    if (ranks[point.severity] > ranks[group.severity]) group.severity = point.severity;
    groups.set(key, group);
  });
  return [...groups.values()].flatMap(group => {
    if (group.points.length === 1 || state.expandedGlobeCluster === group.key || group.points.some(point => point.selected)) return group.points;
    const count = group.points.length;
    return [{ id: group.key, kind: 'event-cluster', symbol: group.kind, clusterEvents: group.points, lat: group.lat / count, lon: group.lon / count, severity: group.severity, color: severityColors[group.severity], title: `${count} · ${symbolLabel(group.kind)}`, metric: t('map.clusterMetric'), location: t('map.clusterHint') }];
  });
}

function renderGlobeData() {
  const events = filteredEvents();
  const eventPoints = events.map(event => { const selected = state.selected === event.id; return { ...event, title: displayEventTitle(event), eventId: event.id, kind: 'event', selected, color: selected ? '#c7ff4a' : severityColors[event.severity] }; });
  const iconPoints = clusterGlobeEvents(eventPoints);
  if (state.showIss && state.iss) iconPoints.push({ ...state.iss, id: 'iss', kind: 'iss', color: '#60e6da', title: t('iss.title'), location: t('iss.altitude', { altitude: Math.round(state.iss.altitude) }), metric: 'ISS' });
  if (state.showRegions && globe) iconPoints.push(...state.newsRegions.slice(0, 80).map(region => ({ ...region, selected: region === state.selectedRegion, color: region === state.selectedRegion ? '#c7ff4a' : '#60e6da' })));
  if (state.showConflicts && globe) iconPoints.push(...state.conflictRegions.slice(0, 30).map(point => ({ ...point, selected: point === state.selectedConflict, color: point === state.selectedConflict ? '#c7ff4a' : '#ff9e44' })));
  const environmental = environmentPoints();
  if (globe) {
    updateGlobeTexture();
    globe.pointsData(environmental);
    globe.polygonsData(auroraGlobeSurface());
    globe.htmlElementsData(state.view === 'globe' ? iconPoints : []);
    const paths = []; if (state.showDaylight) paths.push(terminatorPath()); if (state.showIss && state.issTrail.length > 1) paths.push({ points: state.issTrail, color: '#60e6da', stroke: .55 }); globe.pathsData(paths);
    globe.ringsData(events.filter(event => event.category === 'earthquakes' && Number(String(event.metric).replace(/[^0-9.]/g, '')) >= 4.5).slice(0, 30).map(event => ({ lat: event.lat, lon: event.lon, color: severityColors[event.severity], radius: Math.max(1.2, Number(String(event.metric).replace(/[^0-9.]/g, '')) * .55) })));
  }
  if (map) {
    environmentMarkers.forEach(marker => marker.remove());
    renderMapEventMarkers();
    environmentMarkers = environmental.filter(point => point.kind !== 'temperature').map(point => L.circleMarker([point.lat, point.lon], { radius: point.kind === 'aurora' ? 2.5 : 3.5, stroke: false, fillColor: point.color, fillOpacity: .7 }).bindTooltip(`${esc(point.title)} · ${esc(point.metric)} · ${esc(point.location)}`).addTo(map));
    if (issMapMarker) { issMapMarker.remove(); issMapMarker = null; }
    if (state.showIss && state.iss) issMapMarker = L.marker([state.iss.lat, state.iss.lon], { icon: leafletSymbolIcon('iss', '#60e6da', false, 34), keyboard: true, title: t('iss.title') }).bindTooltip(`${esc(t('iss.title'))} · ${Math.round(state.iss.altitude)} KM`).on('click', () => loadWeather(state.iss.lat, state.iss.lon)).addTo(map);
    if (issTrailLayer) issTrailLayer.remove(); issTrailLayer = state.showIss && state.issTrail.length > 1 ? L.polyline(state.issTrail.map(point => [point.lat, point.lon]), { color: '#60e6da', weight: 1, opacity: .65, dashArray: '3 6' }).addTo(map) : null;
    updateTemperaturePresentation(); updateAuroraPresentation(); renderMapRegions(); renderMapConflicts();
  }
}

function focusCoordinate(lat, lon, altitude = 1.8) { if (state.view === 'globe' && globe) globe.pointOfView({ lat, lng: lon, altitude }, 900); if (state.view === 'map' && map) map.flyTo([lat, lon], 5, { duration: .8 }); renderCoordinate(lat, lon); }
function renderCoordinate(lat, lon) { $('#coordinate-readout').textContent = `LAT ${lat.toFixed(4)}° · LON ${lon.toFixed(4)}°`; $('#camera-link').href = `https://www.windy.com/-Webcams/webcams?lat=${lat}&lon=${lon}&zoom=8`; }

async function loadWeather(lat, lon) {
  const card = $('#weather-card'); card.hidden = false; card.textContent = t('weather.loading');
  try { const url = new URL(API.weather); url.searchParams.set('latitude', lat); url.searchParams.set('longitude', lon); url.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code'); url.searchParams.set('timezone', 'auto'); const data = await json(url); card.innerHTML = `<strong>${data.current.temperature_2m} °C</strong><br>${esc(t('weather.feels'))} ${data.current.apparent_temperature} °C · ${esc(t('weather.humidity'))} ${data.current.relative_humidity_2m}%<br>${esc(t('weather.wind'))} ${data.current.wind_speed_10m} km/h · ${esc(data.timezone_abbreviation || data.timezone)}`; source('weather', 'OPEN-METEO', true, 1); }
  catch (error) { card.textContent = t('weather.unavailable', { error: error.message }); source('weather', 'OPEN-METEO', false, 0, error.message); }
}

let currentNews = [];
function openNewsPreview(article) { const url = safeUrl(article.url); if (url === '#') return; $('#news-preview-title').textContent = article.title; $('#news-preview-meta').textContent = `${article.domain || t('news.source')} · ${article.seendate || t('news.noTime')}`; $('#news-preview-link').href = url; $('#news-dialog').showModal(); }
function renderNews(articles, label) { currentNews = articles.filter(article => article.language === selectedNewsLanguage()).slice(0, 6); const list = $('#news-list'); const note = `<p class="muted">${esc(t('news.coverage'))}</p>`; list.innerHTML = note + (currentNews.length ? currentNews.map((article, index) => `<button class="news-item news-preview-button" type="button" data-news-index="${index}"><strong>${esc(article.title)}</strong><small>${esc(article.domain || t('news.source'))} · ${esc(article.seendate ? fmtTime(article.seendate, true) : t('news.noTime'))}</small></button>`).join('') : `<p class="muted">${esc(t('news.none', { term: label }))}</p>`); list.querySelectorAll('[data-news-index]').forEach(button => button.onclick = () => openNewsPreview(currentNews[Number(button.dataset.newsIndex)])); }
function normalizedText(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
async function loadNews(term, lat = null, lon = null, country = '') {
  const list = $('#news-list'); const clean = String(term || '').replace(/[<>\[\]{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100); const cleanCountry = String(country || '').replace(/[<>\[\]{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80); if (!clean) return;
  state.newsQuery = { term: clean, lat, lon, country: cleanCountry };
  list.innerHTML = `<p class="muted">${esc(t('news.loading'))}</p>`; if (lat != null) $('#camera-link').href = `https://www.windy.com/-Webcams/webcams?lat=${lat}&lon=${lon}&zoom=8`;
  const query = [clean, cleanCountry].filter(Boolean).join(' '); const phrase = normalizedText(clean); const tokens = normalizedText(query).split(/\s+/).filter(token => token.length >= 3);
  const articles = recentNews().map(article => { const haystack = normalizedText(`${article.title} ${article.domain || ''}`); const score = (phrase && haystack.includes(phrase) ? 8 : 0) + tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0); return { article, score }; }).filter(row => row.score > 0).sort((a, b) => b.score - a.score || new Date(b.article.seendate) - new Date(a.article.seendate)).slice(0, 6).map(row => row.article);
  renderNews(articles, clean, query); source('news-cache', 'GOOGLE NEWS RSS', state.news.length > 0, state.news.length, t('sources.newsCache'), state.snapshot?.generatedAt || null, 45 * 60000);
}

function setEnvironment(kind, active) {
  const keys = ['temperature', 'aurora', 'air'];
  for (const key of keys) { state[`show${key[0].toUpperCase()}${key.slice(1)}`] = active && key === kind; $(`#${key}-toggle`).checked = active && key === kind; }
  if (!state.showTemperature) $('#temperature-status').textContent = t('status.temperatureOff');
  if (!state.showAurora) $('#aurora-status').textContent = t('status.auroraOff');
  if (!state.showAir) $('#air-status').textContent = t('status.airOff');
  if (state.showTemperature) loadTemperature();
  if (state.showAurora) $('#aurora-status').textContent = t('layer.auroraCells', { count: state.aurora.length });
  if (state.showAir) $('#air-status').textContent = state.airQuality.length ? t('layer.airPoints', { count: state.airQuality.length }) : t('layer.airUnavailable');
  renderGlobeData();
}

function satelliteDate() { const date = new Date(Date.now() - 86400000); return date.toISOString().slice(0, 10); }
function gibsGlobeUrl(date) { const url = new URL('https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi'); Object.entries({ SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.3.0', LAYERS: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', STYLES: '', FORMAT: 'image/jpeg', TRANSPARENT: 'false', HEIGHT: '1024', WIDTH: '2048', CRS: 'EPSG:4326', BBOX: '-90,-180,90,180', TIME: date }).forEach(([key, value]) => url.searchParams.set(key, value)); return url.href; }
function toggleSatellite(active) {
  state.showSatellite = active; const date = satelliteDate();
  updateGlobeTexture();
  if (map) { if (satelliteLayer) { satelliteLayer.remove(); satelliteLayer = null; } if (active) satelliteLayer = L.tileLayer.wms('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi', { layers: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', format: 'image/jpeg', transparent: false, time: date, attribution: 'NASA GIBS', opacity: .82, maxZoom: 9, className: 'satellite-tiles' }).addTo(map); }
  $('#satellite-status').textContent = active ? t('layer.satelliteOn', { date }) : t('status.satelliteOff');
}

function storedAlertIds() { try { return new Set(JSON.parse(localStorage.getItem('seen-critical-events') || '[]')); } catch { return new Set(); } }
function saveAlertIds(ids) { try { localStorage.setItem('seen-critical-events', JSON.stringify([...ids].slice(-200))); } catch { /* armazenamento pode estar desativado */ } }
function processCriticalNotifications() {
  const critical = state.events.filter(event => event.severity === 'critical');
  const seen = storedAlertIds();
  if (!state.notificationsReady) { critical.forEach(event => seen.add(event.id)); saveAlertIds(seen); return; }
  for (const event of critical) {
    if (!seen.has(event.id) && Notification.permission === 'granted') new Notification(displayEventTitle(event), { body: `${event.location} · ${event.metric}`, tag: event.id });
    seen.add(event.id);
  }
  saveAlertIds(seen);
}
async function enableNotifications() {
  const button = $('#notification-button');
  if (!('Notification' in window)) { button.textContent = t('notifications.unsupported'); button.disabled = true; return; }
  const permission = await Notification.requestPermission();
  if (permission === 'granted') { state.notificationsReady = true; try { localStorage.setItem('browser-alerts-enabled', 'true'); } catch { /* armazenamento pode estar desativado */ } saveAlertIds(new Set(state.events.filter(event => event.severity === 'critical').map(event => event.id))); button.textContent = t('notifications.active'); }
  else button.textContent = t('notifications.denied');
}

function renderAll() { document.body.classList.toggle('nuclear-alert', state.events.some(event => event.category === 'nuclear')); document.body.classList.toggle('hazmat-alert', !state.events.some(event => event.category === 'nuclear') && state.events.some(event => event.category === 'hazmat')); renderCategories(); renderFeed(); renderSpotlight(state.events.find(event => event.id === state.selected)); renderGlobeData(); $('#footer-sync').textContent = state.updatedAt ? t('system.sync', { time: fmtTime(state.updatedAt, true) }) : t('footer.sync'); }
function refreshLanguageUI() {
  setTheme(currentTheme(), false);
  $('#regions-button').textContent = state.showRegions ? t('stage.hideRegions') : t('stage.regions');
  $('#view-button').textContent = state.view === 'globe' ? t('stage.map2d') : t('stage.globe3d');
  if (!state.showTemperature) $('#temperature-status').textContent = t('status.temperatureOff');
  else $('#temperature-status').textContent = temperatureStatus();
  if (!state.showAurora) $('#aurora-status').textContent = t('status.auroraOff'); else $('#aurora-status').textContent = t('layer.auroraCells', { count: state.aurora.length });
  if (!state.showAir) $('#air-status').textContent = t('status.airOff'); else $('#air-status').textContent = state.airQuality.length ? t('layer.airPoints', { count: state.airQuality.length }) : t('layer.airUnavailable');
  if (!state.showRegions) $('#region-status').textContent = t('status.regionsOff'); else if (state.selectedRegion) $('#region-status').textContent = t('layer.regionSelected', { name: regionName(state.selectedRegion).toUpperCase() }); else $('#region-status').textContent = t('layer.regionsCount', { count: state.newsRegions.length });
  if (!state.showConflicts) $('#conflict-status').textContent = t('status.conflictsOff'); else $('#conflict-status').textContent = state.conflictRegions.length ? t('layer.conflictsCount', { count: state.conflictRegions.length }) : t('layer.conflictsEmpty');
  toggleSatellite(state.showSatellite); renderSources(); renderAll(); clock();
  if (state.space) { const scale = kpScale(state.space.kp); $('#kp-scale').textContent = `${scale[0]} · ${scale[1]}`; $('#space-time').textContent = t('space.latest', { time: fmtTime(state.space.time, true) }); }
  $('#notification-button').textContent = state.notificationsReady ? t('notifications.active') : t('intel.notifications');
  updateMyWorldButton(); if ($('#my-world-dialog')?.open) renderMyWorld(); updateEventFavoriteButton();
}
function switchView(nextView, silent = false) {
  if (nextView === state.view) return true;
  if (nextView === 'globe' && !initGlobe()) { if (!silent) alert(t('alert.webgl')); return false; }
  if (nextView === 'map' && !map) return false;
  state.view = nextView;
  $('#globe').hidden = state.view === 'map'; $('#map').hidden = state.view === 'globe';
  $('#view-button').textContent = state.view === 'globe' ? t('stage.map2d') : t('stage.globe3d');
  renderGlobeData();
  if (state.view === 'map') setTimeout(() => { map.invalidateSize(); updateTemperaturePresentation(); }, 50);
  else { resizeGlobe(); updateTemperaturePresentation(); }
  return true;
}
function bind() {
  $('#theme-button').onclick = () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  $('#priority-toggle').onchange = event => { state.priority = event.target.checked; state.selected = null; renderAll(); };
  $('#iss-toggle').onchange = event => { state.showIss = event.target.checked; renderGlobeData(); };
  $('#temperature-toggle').onchange = event => setEnvironment('temperature', event.target.checked);
  $('#aurora-toggle').onchange = event => setEnvironment('aurora', event.target.checked);
  $('#air-toggle').onchange = event => setEnvironment('air', event.target.checked);
  const toggleRegions = async active => { state.showRegions = active; $('#regions-toggle').checked = active; $('#regions-button').textContent = active ? t('stage.hideRegions') : t('stage.regions'); if (active) await loadAdmin1(); else $('#region-status').textContent = t('status.regionsOff'); renderGlobeData(); };
  $('#regions-toggle').onchange = event => toggleRegions(event.target.checked); $('#regions-button').onclick = () => toggleRegions(!state.showRegions);
  const toggleConflicts = async active => { state.showConflicts = active; $('#conflicts-toggle').checked = active; if (active) { $('#conflict-status').textContent = t('layer.conflictsLoading'); await loadAdmin1({ silent: true }); rebuildConflictRegions(); } else { state.selectedConflict = null; $('#conflict-status').textContent = t('status.conflictsOff'); if ($('#conflict-dialog').open) $('#conflict-dialog').close(); } renderGlobeData(); };
  $('#conflicts-toggle').onchange = event => toggleConflicts(event.target.checked);
  $('#daylight-toggle').onchange = event => { state.showDaylight = event.target.checked; renderGlobeData(); };
  $('#satellite-toggle').onchange = event => toggleSatellite(event.target.checked);
  $('#view-button').onclick = () => switchView(state.view === 'globe' ? 'map' : 'globe');
  $('#refresh-button').onclick = async () => { await loadSnapshot(); await Promise.allSettled([loadWorld(), loadIss(), loadSpace()]); if (state.showTemperature) loadTemperature(); };
  $('#locate-button').onclick = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition(position => { focusCoordinate(position.coords.latitude, position.coords.longitude, 1.5); loadWeather(position.coords.latitude, position.coords.longitude); loadNews($('#region-input').placeholder, position.coords.latitude, position.coords.longitude); }, () => alert(t('alert.locationDenied'))) : alert(t('alert.locationUnavailable'));
  $('#intel-form').onsubmit = event => { event.preventDefault(); loadNews($('#region-input').value); };
  $('#notification-button').onclick = enableNotifications;
  $('#my-world-button').onclick = openMyWorld; $('#my-world-close').onclick = () => $('#my-world-dialog').close();
  $('#my-world-search-form').onsubmit = event => { event.preventDefault(); searchMyWorldRegions($('#my-world-search').value); };
  let myWorldSearchTimer; $('#my-world-search').oninput = event => { clearTimeout(myWorldSearchTimer); myWorldSearchTimer = setTimeout(() => searchMyWorldRegions(event.target.value), 180); };
  $('#my-world-apply').onclick = () => { state.myWorldActive = !state.myWorldActive; state.selected = null; renderAll(); renderMyWorld(); };
  $('#my-world-view').onchange = event => { const requested = event.target.value === 'globe' ? 'globe' : 'map'; if (switchView(requested)) { state.myWorld.preferredView = requested; saveMyWorld(); } else event.target.value = state.myWorld.preferredView; };
  $('#event-favorite-button').onclick = () => toggleFavoriteRegion(state.detailRegion);
  $('#about-button').onclick = () => $('#about-dialog').showModal(); $('#about-close').onclick = () => $('#about-dialog').close(); $('#news-close').onclick = () => $('#news-dialog').close(); $('#event-close').onclick = () => $('#event-dialog').close(); $('#conflict-close').onclick = () => $('#conflict-dialog').close(); $('#event-share-button').onclick = shareSelectedEvent;
  $('#language-select').onchange = event => window.i18n.set(event.target.value);
  window.addEventListener('languagechange', () => { state.admin1.forEach(region => { region.location = t('region.click', { country: region.country }); region.metric = t('region.metric'); }); rebuildNewsRegions(); rebuildConflictRegions(); if ($('#conflict-dialog').open) $('#conflict-dialog').close(); state.selectedConflict = null; if (state.selectedRegion) { const updatedRegion = state.newsRegions.find(region => region.id === state.selectedRegion.id); if (updatedRegion) { state.selectedRegion = updatedRegion; renderNews(updatedRegion.articles || [], regionName(updatedRegion)); } else renderNews([], regionName(state.selectedRegion)); } else if (state.newsQuery) loadNews(state.newsQuery.term, state.newsQuery.lat, state.newsQuery.lon, state.newsQuery.country); refreshLanguageUI(); loadWorld(); const selected = state.events.find(item => item.id === state.selected); if (selected && $('#event-dialog').open) openEventDetail(selected); });
}
function clock() { const now = new Date(); $('#utc-clock').textContent = now.toLocaleString(window.i18n.locale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' }).toUpperCase() + ' UTC'; if (state.updatedAt) $('#sync-age').textContent = t('system.sync', { time: timeAgo(state.updatedAt) }); }
async function refreshSnapshot() { await loadSnapshot(); await loadWorld(); if (state.showAir || state.showAurora || state.showTemperature) renderGlobeData(); }
async function start() { bind(); setTheme(currentTheme(), false); updateMyWorldButton(); try { if ('Notification' in window && Notification.permission === 'granted' && localStorage.getItem('browser-alerts-enabled') === 'true') { state.notificationsReady = true; $('#notification-button').textContent = t('notifications.active'); } } catch { /* armazenamento pode estar desativado */ } clock(); setInterval(clock, 1000); await loadSnapshot(); initVisuals(); if (state.myWorld.preferredView === 'globe') switchView('globe', true); await Promise.allSettled([loadWorld(), loadIss(), loadSpace()]); const sharedEvent = new URL(location.href).searchParams.get('event'); if (sharedEvent) selectEvent(sharedEvent); setInterval(loadWorld, refresh.world); setInterval(refreshSnapshot, refresh.snapshot); setInterval(loadIss, refresh.iss); setInterval(loadSpace, refresh.space); setInterval(() => { if (state.showTemperature) loadTemperature(); }, refresh.temperature); setInterval(() => { renderSources(); if (state.showDaylight) renderGlobeData(); }, 60000); }
start();
