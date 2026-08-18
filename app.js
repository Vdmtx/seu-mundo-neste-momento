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
const state = {
  events: [], sources: new Map(), iss: null, issTrail: [], space: null, temperature: [], aurora: [], airQuality: [], news: [], admin1: [],
  selected: null, selectedRegion: null, category: 'all', priority: false, showTemperature: false, showAurora: false,
  showAir: false, showIss: true, showRegions: false, showDaylight: true, showSatellite: false,
  view: 'globe', updatedAt: null, snapshot: null, notificationsReady: false
};
const categories = [['all', '00', 'cat.all'], ['earthquakes', '01', 'cat.earthquakes'], ['wildfires', '02', 'cat.wildfires'], ['storms', '03', 'cat.storms'], ['volcanoes', '04', 'cat.volcanoes'], ['floods', '05', 'cat.floods'], ['other', '06', 'cat.other'], ['hazmat', '!', 'cat.hazmat'], ['nuclear', '!!', 'cat.nuclear']];
const severityColors = { critical: '#ff455d', high: '#ff9e44', medium: '#f0d95f', low: '#63a9ff' };
const $ = selector => document.querySelector(selector);
const t = (key, variables = {}) => window.i18n?.t(key, variables) ?? key;
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function safeUrl(value) { try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) ? url.href : '#'; } catch { return '#'; } }
function timeoutFetch(url, options = {}, ms = 15000) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), ms); return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer)); }
async function json(url, ms = 15000) { const response = await timeoutFetch(url, { headers: { Accept: 'application/json' } }, ms); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }
function source(id, label, ok, count = 0, message = '') { state.sources.set(id, { id, label, ok, count, message, checkedAt: new Date().toISOString() }); renderSources(); }
function riskForQuake(magnitude) { return magnitude >= 6.5 ? 'critical' : magnitude >= 5.5 ? 'high' : magnitude >= 4.5 ? 'medium' : 'low'; }
function naturalCategory(raw = '') { const text = raw.toLowerCase(); if (text.includes('wildfire')) return 'wildfires'; if (text.includes('storm') || text.includes('cyclone') || text.includes('severe')) return 'storms'; if (text.includes('volcano')) return 'volcanoes'; if (text.includes('flood')) return 'floods'; return 'other'; }
function naturalRisk(category, date) { const hours = (Date.now() - new Date(date).getTime()) / 36e5; if (category === 'volcanoes' || category === 'storms') return hours < 48 ? 'high' : 'medium'; if (category === 'wildfires' || category === 'floods') return hours < 72 ? 'medium' : 'low'; return 'low'; }
function fmtTime(value, withDate = false) { const date = new Date(value); if (Number.isNaN(+date)) return '—'; return new Intl.DateTimeFormat(window.i18n.locale(), withDate ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' } : { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(date) + ' UTC'; }
function timeAgo(value) { const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000)); const relative = new Intl.RelativeTimeFormat(window.i18n.locale(), { numeric: 'always', style: 'narrow' }); if (seconds < 60) return relative.format(-seconds, 'second'); if (seconds < 3600) return relative.format(-Math.floor(seconds / 60), 'minute'); return relative.format(-Math.floor(seconds / 3600), 'hour'); }
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
    state.news = next.news || [];
    source('gdacs', 'GDACS', next.sources?.gdacs === 'fulfilled', next.events.filter(event => event.source === 'GDACS').length, t('sources.snapshot15'));
    source('tsunami', 'NOAA TSUNAMI', next.sources?.tsunamiPaaq === 'fulfilled' || next.sources?.tsunamiPheb === 'fulfilled', next.events.filter(event => /^NOAA PA|^NOAA PH/.test(event.source)).length, t('sources.activeOnly'));
    source('air', 'OPEN-METEO AR', state.airQuality.length > 0, state.airQuality.length, t('sources.grid15'));
    source('news-cache', 'GOOGLE NEWS RSS', state.news.length > 0, state.news.length, t('sources.newsCache'));
  } catch { if (!state.snapshot) state.snapshot = null; }
}

function snapshotOnlyEvents() { return (state.snapshot?.events || []).filter(event => event.source === 'GDACS' || /^NOAA PA|^NOAA PH/.test(event.source)); }
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
    source('usgs', 'USGS', true, rows.length);
  } else source('usgs', 'USGS', false, 0, tasks[0].reason?.message);
  if (tasks[1].status === 'fulfilled') {
    const rows = (tasks[1].value.events || []).flatMap(item => {
      const geometry = item.geometry?.at(-1); if (!geometry || !Array.isArray(geometry.coordinates) || geometry.type !== 'Point') return [];
      const category = naturalCategory(item.categories?.[0]?.title); if (category === 'earthquakes') return [];
      return [{ id: `eonet-${item.id}`, category, severity: naturalRisk(category, geometry.date), title: t({ wildfires: 'event.wildfire', storms: 'event.storm', volcanoes: 'event.volcano', floods: 'event.flood', other: 'event.other' }[category]), location: item.title, summary: item.description || t('event.eonetSummary'), metric: geometry.magnitudeValue ? `${geometry.magnitudeValue} ${geometry.magnitudeUnit || ''}` : t('event.active'), timestamp: geometry.date, source: `NASA EONET${item.sources?.[0]?.id ? ' / ' + item.sources[0].id : ''}`, lat: geometry.coordinates[1], lon: geometry.coordinates[0], url: item.sources?.[0]?.url || item.link }];
    });
    events.push(...rows); source('eonet', 'NASA EONET', true, rows.length);
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
    addIssTrail(state.iss); source('iss', 'ISS / WTIA', true, 1);
    $('#iss-status').textContent = `ISS: ${state.iss.lat.toFixed(2)}°, ${state.iss.lon.toFixed(2)}° · ${Math.round(state.iss.altitude)} KM`;
  } catch (error) {
    const fallback = state.snapshot?.iss;
    if (fallback) { state.iss = fallback; addIssTrail(fallback); source('iss', 'ISS / SNAPSHOT', true, 1, 'Contingência'); }
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
  state.space = { kp, bz, wind, time }; source('noaa-kp', 'NOAA KP', kp != null, kp == null ? 0 : 1); source('solar-wind', 'NOAA VENTO SOLAR', bz != null || wind != null, [bz, wind].filter(value => value != null).length);
  const scale = kpScale(kp); $('#kp-value').textContent = kp == null ? '—' : kp.toFixed(1); $('#kp-scale').textContent = `${scale[0]} · ${scale[1]}`; $('#bz-value').textContent = bz == null ? '—' : bz.toFixed(1); $('#wind-value').textContent = wind == null ? '—' : Math.round(wind); $('#space-time').textContent = t('space.latest', { time: fmtTime(time, true) });
  if (results[3].status === 'fulfilled') {
    const raw = results[3].value;
    state.aurora = (raw.coordinates || []).flatMap(point => { const rawLon = num(point[0]), lat = num(point[1]), intensity = num(point[2]); if (rawLon == null || lat == null || intensity == null || intensity < 3) return []; const lon = rawLon > 180 ? rawLon - 360 : rawLon; return Math.abs(Math.round(lat)) % 2 || Math.abs(Math.round(lon)) % 2 ? [] : [{ lat, lon, intensity }]; });
    source('ovation', 'NOAA OVATION', true, state.aurora.length);
  } else { state.aurora = state.snapshot?.aurora || []; source('ovation', 'NOAA OVATION', state.aurora.length > 0, state.aurora.length, results[3].reason?.message); }
  $('#aurora-status').textContent = state.showAurora ? t('layer.auroraCells', { count: state.aurora.length }) : t('status.auroraOff'); renderGlobeData();
}

async function loadTemperature() {
  if (!state.showTemperature) return;
  $('#temperature-status').textContent = t('layer.tempLoading');
  const coordinates = []; for (let lat = -80; lat <= 80; lat += 10) for (let lon = -180; lon < 180; lon += 10) coordinates.push({ lat, lon });
  const batches = []; for (let index = 0; index < coordinates.length; index += 90) batches.push(coordinates.slice(index, index + 90));
  const results = await Promise.allSettled(batches.map(async batch => { const url = new URL(API.weather); url.searchParams.set('latitude', batch.map(point => point.lat).join(',')); url.searchParams.set('longitude', batch.map(point => point.lon).join(',')); url.searchParams.set('current', 'temperature_2m'); url.searchParams.set('timezone', 'GMT'); const raw = await json(url, 20000); return (Array.isArray(raw) ? raw : [raw]).flatMap(row => Number.isFinite(row.current?.temperature_2m) ? [{ lat: row.latitude, lon: row.longitude, temperature: row.current.temperature_2m }] : []); }));
  state.temperature = results.flatMap(result => result.status === 'fulfilled' ? result.value : []); source('open-meteo', 'OPEN-METEO', state.temperature.length > 0, state.temperature.length);
  const values = state.temperature.map(point => point.temperature); $('#temperature-status').textContent = values.length ? t('layer.tempPoints', { count: values.length, min: Math.min(...values).toFixed(1), max: Math.max(...values).toFixed(1) }) : t('layer.tempUnavailable'); renderGlobeData();
}

async function loadAdmin1() {
  if (state.admin1.length) return state.admin1;
  $('#region-status').textContent = t('layer.regionsLoading');
  try {
    const data = await json('data/admin1.json', 30000);
    state.admin1 = (data.regions || []).map(([name, countryIndex, lat, lon], index) => ({ id: `region-${index}`, kind: 'region', name, country: data.countries[countryIndex], lat, lon, title: name, location: t('region.click', { country: data.countries[countryIndex] }), metric: t('region.metric'), color: '#60e6da' })); source('natural-earth', 'NATURAL EARTH', true, state.admin1.length, 'Administrative centers');
    $('#region-status').textContent = t('layer.regionsCount', { count: state.admin1.length }); renderGlobeData(); return state.admin1;
  } catch (error) { source('natural-earth', 'NATURAL EARTH', false, 0, error.message); $('#region-status').textContent = t('layer.regionsUnavailable'); return []; }
}

function filteredEvents() { return state.events.filter(event => (state.category === 'all' || event.category === state.category) && (!state.priority || ['critical', 'high'].includes(event.severity))); }
function displayEventTitle(event) {
  if (event.source === 'GDACS') return t({ wildfires: 'event.gdacsWildfire', floods: 'event.gdacsFlood', storms: 'event.gdacsStorm', volcanoes: 'event.gdacsVolcano', other: 'event.gdacsOther' }[event.category] || 'event.gdacsOther');
  if (/^NOAA PA|^NOAA PH/.test(event.source)) return t('event.tsunami');
  return event.title;
}
function renderCategories() { $('#category-list').innerHTML = categories.map(([id, code, labelKey]) => { const count = id === 'all' ? state.events.length : state.events.filter(event => event.category === id).length; if (['nuclear', 'hazmat'].includes(id) && count === 0) return ''; return `<button class="category ${state.category === id ? 'active' : ''}" data-category="${id}"><span class="code">${code}</span><span>${esc(t(labelKey))}</span><span class="count">${count}</span></button>`; }).join(''); document.querySelectorAll('.category').forEach(button => button.onclick = () => { state.category = button.dataset.category; state.selected = null; renderAll(); }); }
function renderSources() { const list = [...state.sources.values()]; $('#source-list').innerHTML = list.length ? list.map(item => `<div class="source-row ${item.ok ? 'ok' : ''}" title="${esc(item.message || '')}"><span><i></i>${esc(item.label)}</span><b>${item.ok ? esc(t('sources.ok', { count: item.count })) : esc(t('sources.fail'))}</b></div>`).join('') : `<span class="muted">${esc(t('sources.loading'))}</span>`; const ok = list.filter(item => item.ok).length; $('#source-count').textContent = ok; $('#online-dot').className = `live-dot ${ok === 0 ? 'offline' : ok < list.length ? 'partial' : ''}`; $('#system-status').textContent = ok === 0 ? t('system.offline') : ok < list.length ? t('system.partial') : t('system.online'); }
function renderFeed() { const rows = filteredEvents().slice(0, 12); $('#visible-count').textContent = filteredEvents().length; $('#feed-count').textContent = rows.length; $('#event-feed').innerHTML = rows.length ? rows.map(event => `<button class="event-item ${state.selected === event.id ? 'active' : ''}" data-id="${esc(event.id)}"><i class="${event.severity}"></i><span><strong>${esc(displayEventTitle(event))}</strong><small>${esc(event.location)} · ${fmtTime(event.timestamp)}</small></span><span>${esc(event.metric)}</span></button>`).join('') : `<p class="muted" style="padding:18px">${esc(t('event.none'))}</p>`; document.querySelectorAll('.event-item').forEach(button => button.onclick = () => selectEvent(button.dataset.id)); }
function selectEvent(id) { state.selected = id; const event = state.events.find(item => item.id === id); if (!event) return; renderSpotlight(event); renderFeed(); focusCoordinate(event.lat, event.lon, 1.6); loadWeather(event.lat, event.lon); loadNews(event.location, event.lat, event.lon); }
function renderSpotlight(event) { if (!event) event = filteredEvents()[0]; if (!event) return; $('#risk-chip').textContent = t(`risk.${event.severity}`); $('#risk-chip').style.borderColor = severityColors[event.severity]; $('#risk-chip').style.color = severityColors[event.severity]; $('#spot-title').textContent = displayEventTitle(event).toUpperCase(); $('#spot-location').textContent = event.location; $('#spot-summary').textContent = event.summary; $('#spot-metric').textContent = event.metric; $('#spot-source').textContent = event.source; $('#spot-time').textContent = fmtTime(event.timestamp, true); $('#spot-coordinates').textContent = `${event.lat.toFixed(2)}, ${event.lon.toFixed(2)}`; const link = $('#spot-link'); const verified = safeUrl(event.url); link.hidden = verified === '#'; if (verified !== '#') link.href = verified; renderCoordinate(event.lat, event.lon); }

let globe, map, baseMapLayer, satelliteLayer, regionLayer, issTrailLayer;
let mapMarkers = [], environmentMarkers = [];

function initVisuals() {
  try {
    map = L.map('map', { worldCopyJump: true, preferCanvas: true }).setView([18, 0], 2);
    baseMapLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 18 }).addTo(map);
  } catch { map = null; }
  try {
    globe = Globe()($('#globe')).backgroundColor('rgba(0,0,0,0)').globeImageUrl('assets/earth-night.jpg').bumpImageUrl('assets/earth-topology.png').showAtmosphere(true).atmosphereColor('#53d9de').atmosphereAltitude(.15).showGraticules(true)
      .pointLat('lat').pointLng('lon').pointRadius(point => point.kind === 'region' ? .07 : point.kind === 'temperature' ? .18 : point.kind === 'aurora' ? .12 : point.kind === 'air' ? .16 : point.kind === 'iss' ? .55 : state.selected === point.id ? .55 : .34)
      .pointAltitude(point => point.kind === 'iss' ? .09 : state.selected === point.id ? .07 : point.kind === 'event' ? .035 : .008).pointColor('color')
      .pointLabel(point => `<div class="globe-label"><span>${esc(point.metric || point.kind.toUpperCase())}</span><strong>${esc(point.title || '')}</strong><small>${esc(point.location || '')}</small></div>`)
      .onPointClick(point => { if (point.eventId) selectEvent(point.eventId); else if (point.kind === 'region') selectRegion(point); else loadWeather(point.lat, point.lon); }).onGlobeClick(({ lat, lng }) => { renderCoordinate(lat, lng); loadWeather(lat, lng); })
      .pathPoints('points').pathPointLat('lat').pathPointLng('lon').pathColor('color').pathStroke('stroke')
      .ringLat('lat').ringLng('lon').ringColor(point => point.color).ringMaxRadius(point => point.radius).ringPropagationSpeed(2).ringRepeatPeriod(1400);
    globe.controls().autoRotate = true; globe.controls().autoRotateSpeed = .16; globe.controls().enableDamping = true;
    window.addEventListener('resize', resizeGlobe); if (map) map.on('moveend zoomend', () => { if (state.showRegions) renderMapRegions(); }); resizeGlobe(); $('#visual-loading').hidden = true;
  } catch (error) {
    globe = null;
    if (map) { state.view = 'map'; $('#globe').hidden = true; $('#map').hidden = false; $('#view-button').textContent = t('stage.globe3d'); $('#visual-loading').hidden = true; setTimeout(() => map.invalidateSize(), 50); }
    else $('#visual-loading').innerHTML = `<strong>${esc(t('stage.unavailable'))}</strong><small>${esc(error.message)}</small>`;
  }
  renderGlobeData();
}

function resizeGlobe() { const box = $('#globe').getBoundingClientRect(); if (globe) globe.width(box.width).height(box.height); }
function tempColor(value) { if (value <= -25) return '#6d4dff'; if (value <= -10) return '#447dff'; if (value <= 0) return '#53c6ff'; if (value <= 10) return '#55e5c3'; if (value <= 20) return '#bddd4e'; if (value <= 30) return '#ffbc42'; if (value <= 38) return '#ff7043'; return '#e83e58'; }
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
function selectRegion(region) { state.selectedRegion = region; const name = regionName(region), country = regionCountry(region); $('#region-input').value = `${name}, ${country}`; $('#region-status').textContent = t('layer.regionSelected', { name: name.toUpperCase() }); focusCoordinate(region.lat, region.lon, 1.35); loadWeather(region.lat, region.lon); loadNews(name, region.lat, region.lon, country); renderGlobeData(); }

function environmentPoints() {
  if (state.showTemperature) return sample(state.temperature, 600).map((point, index) => ({ ...point, id: `temp-${index}`, kind: 'temperature', color: tempColor(point.temperature), metric: `${point.temperature.toFixed(1)} °C`, title: t('temperature.approx'), location: 'Open-Meteo' }));
  if (state.showAurora) return sample(state.aurora, 1400).map((point, index) => ({ ...point, id: `aurora-${index}`, kind: 'aurora', color: point.lat > 0 ? `rgba(73,255,155,${Math.min(.95, .2 + point.intensity / 100)})` : `rgba(178,92,255,${Math.min(.95, .2 + point.intensity / 100)})`, metric: `${point.intensity}%`, title: point.lat > 0 ? t('aurora.north') : t('aurora.south'), location: t('aurora.probability') }));
  if (state.showAir) return state.airQuality.map((point, index) => ({ ...point, id: `air-${index}`, kind: 'air', color: airColor(point.aqi), metric: `AQI ${Math.round(point.aqi)}`, title: t('air.title'), location: `PM2.5 ${point.pm25 == null ? '—' : point.pm25.toFixed(1)} µg/m³` }));
  return [];
}

function renderMapRegions() {
  if (!map) return;
  if (regionLayer) { regionLayer.remove(); regionLayer = null; }
  if (!state.showRegions || !state.admin1.length) return;
  const bounds = map.getBounds().pad(.12), zoom = map.getZoom(), stride = zoom <= 2 ? 12 : zoom === 3 ? 6 : zoom === 4 ? 2 : 1;
  const visible = state.admin1.filter((region, index) => index % stride === 0 && bounds.contains([region.lat, region.lon])).slice(0, 300);
  regionLayer = L.layerGroup(visible.map(region => L.circleMarker([region.lat, region.lon], { renderer: L.canvas(), radius: region === state.selectedRegion ? 5 : 2.3, color: region === state.selectedRegion ? '#c7ff4a' : '#60e6da', weight: region === state.selectedRegion ? 1.3 : .45, fillColor: '#174958', fillOpacity: .7 }).bindTooltip(`${esc(regionName(region))} · ${esc(regionCountry(region))}`).on('click', () => selectRegion(region)))).addTo(map);
}

function renderGlobeData() {
  const events = filteredEvents();
  const points = events.map(event => ({ ...event, title: displayEventTitle(event), eventId: event.id, kind: 'event', color: state.selected === event.id ? '#c7ff4a' : severityColors[event.severity] }));
  if (state.showIss && state.iss) points.push({ ...state.iss, id: 'iss', kind: 'iss', color: '#60e6da', title: t('iss.title'), location: t('iss.altitude', { altitude: Math.round(state.iss.altitude) }), metric: 'ISS' });
  const environmental = environmentPoints(); points.push(...environmental); if (state.showRegions) points.push(...sample(state.admin1, 1200).map(region => ({ ...region, color: region === state.selectedRegion ? '#c7ff4a' : '#60e6da' })));
  if (globe) {
    globe.pointsData(points);
    const paths = []; if (state.showDaylight) paths.push(terminatorPath()); if (state.showIss && state.issTrail.length > 1) paths.push({ points: state.issTrail, color: '#60e6da', stroke: .55 }); globe.pathsData(paths);
    globe.ringsData(events.filter(event => event.category === 'earthquakes' && Number(String(event.metric).replace(/[^0-9.]/g, '')) >= 4.5).slice(0, 30).map(event => ({ lat: event.lat, lon: event.lon, color: severityColors[event.severity], radius: Math.max(1.2, Number(String(event.metric).replace(/[^0-9.]/g, '')) * .55) })));
  }
  if (map) {
    mapMarkers.forEach(marker => marker.remove()); environmentMarkers.forEach(marker => marker.remove());
    mapMarkers = events.map(event => L.circleMarker([event.lat, event.lon], { radius: event.id === state.selected ? 8 : 5, color: severityColors[event.severity], fillOpacity: .9, weight: 1 }).bindTooltip(`${esc(displayEventTitle(event))} · ${esc(event.metric)}`).on('click', () => selectEvent(event.id)).addTo(map));
    environmentMarkers = environmental.map(point => L.circleMarker([point.lat, point.lon], { radius: point.kind === 'aurora' ? 2.5 : 3.5, stroke: false, fillColor: point.color, fillOpacity: .7 }).bindTooltip(`${esc(point.title)} · ${esc(point.metric)} · ${esc(point.location)}`).addTo(map));
    if (issTrailLayer) issTrailLayer.remove(); issTrailLayer = state.showIss && state.issTrail.length > 1 ? L.polyline(state.issTrail.map(point => [point.lat, point.lon]), { color: '#60e6da', weight: 1, opacity: .65, dashArray: '3 6' }).addTo(map) : null;
    renderMapRegions();
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
function renderNews(articles, label, query) { currentNews = articles; const list = $('#news-list'); const google = `https://news.google.com/search?q=${encodeURIComponent(query)}`; const note = `<p class="muted">${esc(t('news.coverage'))}</p>`; list.innerHTML = note + (articles.length ? articles.map((article, index) => `<button class="news-item news-preview-button" type="button" data-news-index="${index}"><strong>${esc(article.title)}</strong><small>${esc(article.domain || t('news.source'))} · ${esc(article.seendate ? fmtTime(article.seendate, true) : t('news.noTime'))}</small></button>`).join('') : `<p class="muted">${esc(t('news.none', { term: label }))} <a href="${esc(google)}" target="_blank" rel="noopener noreferrer">${esc(t('news.google'))}</a></p>`); list.querySelectorAll('[data-news-index]').forEach(button => button.onclick = () => openNewsPreview(currentNews[Number(button.dataset.newsIndex)])); }
function normalizedText(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
async function loadNews(term, lat = null, lon = null, country = '') {
  const list = $('#news-list'); const clean = String(term || '').replace(/[<>\[\]{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100); const cleanCountry = String(country || '').replace(/[<>\[\]{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80); if (!clean) return;
  list.innerHTML = `<p class="muted">${esc(t('news.loading'))}</p>`; if (lat != null) $('#camera-link').href = `https://www.windy.com/-Webcams/webcams?lat=${lat}&lon=${lon}&zoom=8`;
  const query = [clean, cleanCountry].filter(Boolean).join(' '); const phrase = normalizedText(clean); const tokens = normalizedText(query).split(/\s+/).filter(token => token.length >= 3);
  const articles = state.news.map(article => { const haystack = normalizedText(`${article.title} ${article.domain || ''}`); const score = (phrase && haystack.includes(phrase) ? 8 : 0) + tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0); return { article, score }; }).filter(row => row.score > 0).sort((a, b) => b.score - a.score || new Date(b.article.seendate) - new Date(a.article.seendate)).slice(0, 18).map(row => row.article);
  renderNews(articles, clean, query); source('news-cache', 'GOOGLE NEWS RSS', state.news.length > 0, state.news.length, t('sources.newsCache'));
}

function setEnvironment(kind, active) {
  const keys = ['temperature', 'aurora', 'air'];
  for (const key of keys) { state[`show${key[0].toUpperCase()}${key.slice(1)}`] = active && key === kind; $(`#${key}-toggle`).checked = active && key === kind; }
  if (!state.showTemperature) $('#temperature-status').textContent = t('status.temperatureOff');
  if (!state.showAurora) $('#aurora-status').textContent = t('status.auroraOff');
  if (!state.showAir) $('#air-status').textContent = t('status.airOff');
  if (state.showTemperature && !state.temperature.length) loadTemperature();
  if (state.showAurora) $('#aurora-status').textContent = t('layer.auroraCells', { count: state.aurora.length });
  if (state.showAir) $('#air-status').textContent = state.airQuality.length ? t('layer.airPoints', { count: state.airQuality.length }) : t('layer.airUnavailable');
  renderGlobeData();
}

function satelliteDate() { const date = new Date(Date.now() - 86400000); return date.toISOString().slice(0, 10); }
function gibsGlobeUrl(date) { const url = new URL('https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi'); Object.entries({ SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.3.0', LAYERS: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', STYLES: '', FORMAT: 'image/jpeg', TRANSPARENT: 'false', HEIGHT: '1024', WIDTH: '2048', CRS: 'EPSG:4326', BBOX: '-90,-180,90,180', TIME: date }).forEach(([key, value]) => url.searchParams.set(key, value)); return url.href; }
function toggleSatellite(active) {
  state.showSatellite = active; const date = satelliteDate();
  if (globe) globe.globeImageUrl(active ? gibsGlobeUrl(date) : 'assets/earth-night.jpg');
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
  $('#regions-button').textContent = state.showRegions ? t('stage.hideRegions') : t('stage.regions');
  $('#view-button').textContent = state.view === 'globe' ? t('stage.map2d') : t('stage.globe3d');
  if (!state.showTemperature) $('#temperature-status').textContent = t('status.temperatureOff');
  else if (state.temperature.length) { const values = state.temperature.map(point => point.temperature); $('#temperature-status').textContent = t('layer.tempPoints', { count: values.length, min: Math.min(...values).toFixed(1), max: Math.max(...values).toFixed(1) }); }
  if (!state.showAurora) $('#aurora-status').textContent = t('status.auroraOff'); else $('#aurora-status').textContent = t('layer.auroraCells', { count: state.aurora.length });
  if (!state.showAir) $('#air-status').textContent = t('status.airOff'); else $('#air-status').textContent = state.airQuality.length ? t('layer.airPoints', { count: state.airQuality.length }) : t('layer.airUnavailable');
  if (!state.showRegions) $('#region-status').textContent = t('status.regionsOff'); else if (state.selectedRegion) $('#region-status').textContent = t('layer.regionSelected', { name: regionName(state.selectedRegion).toUpperCase() }); else $('#region-status').textContent = t('layer.regionsCount', { count: state.admin1.length });
  toggleSatellite(state.showSatellite); renderSources(); renderAll(); clock();
  if (state.space) { const scale = kpScale(state.space.kp); $('#kp-scale').textContent = `${scale[0]} · ${scale[1]}`; $('#space-time').textContent = t('space.latest', { time: fmtTime(state.space.time, true) }); }
  $('#notification-button').textContent = state.notificationsReady ? t('notifications.active') : t('intel.notifications');
}
function bind() {
  $('#priority-toggle').onchange = event => { state.priority = event.target.checked; state.selected = null; renderAll(); };
  $('#iss-toggle').onchange = event => { state.showIss = event.target.checked; renderGlobeData(); };
  $('#temperature-toggle').onchange = event => setEnvironment('temperature', event.target.checked);
  $('#aurora-toggle').onchange = event => setEnvironment('aurora', event.target.checked);
  $('#air-toggle').onchange = event => setEnvironment('air', event.target.checked);
  const toggleRegions = async active => { state.showRegions = active; $('#regions-toggle').checked = active; $('#regions-button').textContent = active ? t('stage.hideRegions') : t('stage.regions'); if (active) await loadAdmin1(); else $('#region-status').textContent = t('status.regionsOff'); renderGlobeData(); };
  $('#regions-toggle').onchange = event => toggleRegions(event.target.checked); $('#regions-button').onclick = () => toggleRegions(!state.showRegions);
  $('#daylight-toggle').onchange = event => { state.showDaylight = event.target.checked; renderGlobeData(); };
  $('#satellite-toggle').onchange = event => toggleSatellite(event.target.checked);
  $('#view-button').onclick = () => { if (state.view === 'map' && !globe) { alert(t('alert.webgl')); return; } if (state.view === 'globe' && !map) return; state.view = state.view === 'globe' ? 'map' : 'globe'; $('#globe').hidden = state.view === 'map'; $('#map').hidden = state.view === 'globe'; $('#view-button').textContent = state.view === 'globe' ? t('stage.map2d') : t('stage.globe3d'); if (state.view === 'map') setTimeout(() => map.invalidateSize(), 50); else resizeGlobe(); };
  $('#refresh-button').onclick = async () => { await loadSnapshot(); await Promise.allSettled([loadWorld(), loadIss(), loadSpace()]); if (state.showTemperature) loadTemperature(); };
  $('#locate-button').onclick = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition(position => { focusCoordinate(position.coords.latitude, position.coords.longitude, 1.5); loadWeather(position.coords.latitude, position.coords.longitude); loadNews($('#region-input').placeholder, position.coords.latitude, position.coords.longitude); }, () => alert(t('alert.locationDenied'))) : alert(t('alert.locationUnavailable'));
  $('#intel-form').onsubmit = event => { event.preventDefault(); loadNews($('#region-input').value); };
  $('#notification-button').onclick = enableNotifications;
  $('#about-button').onclick = () => $('#about-dialog').showModal(); $('#about-close').onclick = () => $('#about-dialog').close(); $('#news-close').onclick = () => $('#news-dialog').close();
  $('#language-select').onchange = event => window.i18n.set(event.target.value);
  window.addEventListener('languagechange', () => { state.admin1.forEach(region => { region.location = t('region.click', { country: region.country }); region.metric = t('region.metric'); }); refreshLanguageUI(); loadWorld(); });
}
function clock() { const now = new Date(); $('#utc-clock').textContent = now.toLocaleString(window.i18n.locale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' }).toUpperCase() + ' UTC'; if (state.updatedAt) $('#sync-age').textContent = t('system.sync', { time: timeAgo(state.updatedAt) }); }
async function refreshSnapshot() { await loadSnapshot(); await loadWorld(); if (state.showAir || state.showAurora) renderGlobeData(); }
async function start() { bind(); try { if ('Notification' in window && Notification.permission === 'granted' && localStorage.getItem('browser-alerts-enabled') === 'true') { state.notificationsReady = true; $('#notification-button').textContent = t('notifications.active'); } } catch { /* armazenamento pode estar desativado */ } clock(); setInterval(clock, 1000); await loadSnapshot(); initVisuals(); await Promise.allSettled([loadWorld(), loadIss(), loadSpace()]); setInterval(loadWorld, refresh.world); setInterval(refreshSnapshot, refresh.snapshot); setInterval(loadIss, refresh.iss); setInterval(loadSpace, refresh.space); setInterval(() => { if (state.showTemperature) loadTemperature(); }, refresh.temperature); setInterval(() => { if (state.showDaylight) renderGlobeData(); }, 60000); }
start();
