import { mkdir, writeFile } from 'node:fs/promises';

const URLS = {
  usgs: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',
  eonet: 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=250',
  iss: 'https://api.wheretheiss.at/v1/satellites/25544',
  kp: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
  mag: 'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json',
  plasma: 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json',
  aurora: 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',
  gdacs: 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC;FL;VO;DR;WF&alertlevel=Green;Orange;Red',
  tsunamiPaaq: 'https://www.tsunami.gov/events/xml/PAAQAtom.xml',
  tsunamiPheb: 'https://www.tsunami.gov/events/xml/PHEBAtom.xml',
  air: 'https://air-quality-api.open-meteo.com/v1/air-quality'
};

async function get(url, text = false) {
  const response = await fetch(url, {
    headers: { Accept: text ? 'application/atom+xml,text/xml' : 'application/json', 'User-Agent': 'SeuMundoMonitor/3.0 GitHub Actions' }
  });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return text ? response.text() : response.json();
}

const number = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const settled = result => result.status === 'fulfilled' ? result.value : null;
const quakeRisk = magnitude => magnitude >= 6.5 ? 'critical' : magnitude >= 5.5 ? 'high' : magnitude >= 4.5 ? 'medium' : 'low';
const alertRisk = level => level === 'Red' ? 'critical' : level === 'Orange' ? 'high' : 'medium';
const naturalCategory = value => {
  const text = String(value || '').toLowerCase();
  if (text.includes('wildfire')) return 'wildfires';
  if (text.includes('storm') || text.includes('cyclone') || text.includes('severe')) return 'storms';
  if (text.includes('volcano')) return 'volcanoes';
  if (text.includes('flood')) return 'floods';
  return 'other';
};
const last = table => {
  if (!Array.isArray(table) || !table.length) return null;
  if (table[0] && typeof table[0] === 'object' && !Array.isArray(table[0])) {
    return table.reduce((latest, row) => !latest || new Date(row.time_tag || 0) > new Date(latest.time_tag || 0) ? row : latest, null);
  }
  return table.length > 1 && Array.isArray(table[0]) ? Object.fromEntries(table[0].map((header, index) => [header, table.at(-1)[index]])) : null;
};
const xmlText = value => String(value || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const xmlTag = (entry, tag) => xmlText(entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] || '');

function parseTsunami(xml, center) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].flatMap(([, entry]) => {
    const summary = xmlTag(entry, 'summary');
    const category = summary.match(/Category:\s*(Warning|Watch|Advisory|Threat)/i)?.[1];
    const lat = number(xmlTag(entry, 'geo:lat'));
    const lon = number(xmlTag(entry, 'geo:long'));
    if (!category || lat === null || lon === null) return [];
    const href = entry.match(/<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)/i)?.[1] || 'https://www.tsunami.gov/';
    const updated = xmlTag(entry, 'updated') || new Date().toISOString();
    return [{
      id: `tsunami-${center}-${updated}`,
      category: 'other',
      severity: /warning|threat/i.test(category) ? 'critical' : 'high',
      title: `Alerta de tsunami: ${category}`,
      location: center === 'PAAQ' ? 'Pacífico e Alasca' : 'Pacífico, Caribe e Atlântico',
      summary: summary.slice(0, 360) || `Boletim ${category} publicado pelo centro de alerta de tsunamis.`,
      metric: category.toUpperCase(), timestamp: updated, source: `NOAA ${center}`, lat, lon, url: href
    }];
  });
}

async function loadAirQuality() {
  const coordinates = [];
  for (let lat = -75; lat <= 75; lat += 15) for (let lon = -180; lon < 180; lon += 15) coordinates.push({ lat, lon });
  const batches = [];
  for (let index = 0; index < coordinates.length; index += 80) batches.push(coordinates.slice(index, index + 80));
  const results = await Promise.allSettled(batches.map(async batch => {
    const url = new URL(URLS.air);
    url.searchParams.set('latitude', batch.map(point => point.lat).join(','));
    url.searchParams.set('longitude', batch.map(point => point.lon).join(','));
    url.searchParams.set('current', 'us_aqi,pm2_5');
    url.searchParams.set('timezone', 'GMT');
    const raw = await get(url);
    return (Array.isArray(raw) ? raw : [raw]).flatMap(row => {
      const aqi = number(row.current?.us_aqi);
      const pm25 = number(row.current?.pm2_5);
      return aqi === null ? [] : [{ lat: row.latitude, lon: row.longitude, aqi, pm25, time: row.current?.time }];
    });
  }));
  const points = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  if (!points.length) throw new Error('Open-Meteo Air Quality sem leituras');
  return points;
}

const results = await Promise.allSettled([
  get(URLS.usgs), get(URLS.eonet), get(URLS.iss), get(URLS.kp), get(URLS.mag), get(URLS.plasma),
  get(URLS.aurora), get(URLS.gdacs), get(URLS.tsunamiPaaq, true), get(URLS.tsunamiPheb, true), loadAirQuality()
]);
const [quakes, eonet, iss, kp, mag, plasma, aurora, gdacs, tsunamiPaaq, tsunamiPheb, air] = results;
const events = [];

if (quakes.status === 'fulfilled') events.push(...(quakes.value.features || []).map(feature => {
  const magnitude = number(feature.properties.mag) || 0;
  return {
    id: `usgs-${feature.id}`, category: 'earthquakes', severity: quakeRisk(magnitude), title: `Terremoto ${magnitude.toFixed(1)}`,
    location: feature.properties.place || 'Local não informado', summary: `Evento sísmico publicado pelo USGS. Profundidade aproximada de ${number(feature.geometry.coordinates[2])?.toFixed(1) ?? '—'} km.`,
    metric: `M ${magnitude.toFixed(1)}`, timestamp: new Date(feature.properties.time).toISOString(), source: 'USGS',
    lat: feature.geometry.coordinates[1], lon: feature.geometry.coordinates[0], url: feature.properties.url
  };
}));

if (eonet.status === 'fulfilled') events.push(...(eonet.value.events || []).flatMap(item => {
  const geometry = item.geometry?.at(-1);
  if (!geometry || geometry.type !== 'Point') return [];
  const category = naturalCategory(item.categories?.[0]?.title);
  if (category === 'earthquakes') return [];
  return [{
    id: `eonet-${item.id}`, category, severity: ['volcanoes', 'storms'].includes(category) ? 'high' : ['wildfires', 'floods'].includes(category) ? 'medium' : 'low',
    title: { wildfires: 'Incêndio ativo', storms: 'Tempestade monitorada', volcanoes: 'Atividade vulcânica', floods: 'Inundação ativa', other: 'Evento natural' }[category],
    location: item.title, summary: item.description || 'Evento aberto acompanhado pelo NASA EONET.',
    metric: geometry.magnitudeValue ? `${geometry.magnitudeValue} ${geometry.magnitudeUnit || ''}` : 'ATIVO', timestamp: geometry.date,
    source: 'NASA EONET', lat: geometry.coordinates[1], lon: geometry.coordinates[0], url: item.sources?.[0]?.url || item.link
  }];
}));

if (gdacs.status === 'fulfilled') events.push(...(gdacs.value.features || []).flatMap(feature => {
  const properties = feature.properties || {};
  const coordinates = feature.geometry?.type === 'Point' ? feature.geometry.coordinates : null;
  if (!coordinates || String(properties.iscurrent) !== 'true') return [];
  const type = properties.eventtype;
  const category = { TC: 'storms', FL: 'floods', VO: 'volcanoes', WF: 'wildfires', DR: 'other' }[type] || 'other';
  return [{
    id: `gdacs-${type}-${properties.eventid}-${properties.episodeid}`, category, severity: alertRisk(properties.alertlevel),
    title: { TC: 'Ciclone tropical', FL: 'Inundação GDACS', VO: 'Atividade vulcânica', WF: 'Incêndio GDACS', DR: 'Desastre monitorado' }[type] || 'Desastre monitorado',
    location: [properties.name, properties.country].filter(Boolean).join(' · ') || 'Local não informado',
    summary: properties.severitydata?.severitytext || properties.description || 'Evento atual publicado pelo sistema global GDACS.',
    metric: String(properties.alertlevel || 'ATIVO').toUpperCase(), timestamp: properties.datemodified || properties.fromdate || new Date().toISOString(),
    source: 'GDACS', lat: coordinates[1], lon: coordinates[0], url: properties.url?.report || 'https://www.gdacs.org/'
  }];
}));

if (tsunamiPaaq.status === 'fulfilled') events.push(...parseTsunami(tsunamiPaaq.value, 'PAAQ'));
if (tsunamiPheb.status === 'fulfilled') events.push(...parseTsunami(tsunamiPheb.value, 'PHEB'));

const kpRow = kp.status === 'fulfilled' ? last(kp.value) : null;
const magRow = mag.status === 'fulfilled' ? last(mag.value) : null;
const plasmaRow = plasma.status === 'fulfilled' ? last(plasma.value) : null;
const auroraPoints = aurora.status === 'fulfilled' ? (aurora.value.coordinates || []).flatMap(point => {
  const rawLon = number(point[0]); const lat = number(point[1]); const intensity = number(point[2]);
  if (rawLon === null || lat === null || intensity === null || intensity < 3) return [];
  const lon = rawLon > 180 ? rawLon - 360 : rawLon;
  return Math.abs(Math.round(lat)) % 2 || Math.abs(Math.round(lon)) % 2 ? [] : [{ lat, lon, intensity }];
}) : [];

const snapshot = {
  generatedAt: new Date().toISOString(),
  events: events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
  iss: iss.status === 'fulfilled' ? { lat: iss.value.latitude, lon: iss.value.longitude, altitude: iss.value.altitude, velocity: iss.value.velocity, timestamp: new Date(iss.value.timestamp * 1000).toISOString() } : null,
  space: { kp: number(kpRow?.Kp ?? kpRow?.kp), bz: number(magRow?.bz_gsm ?? magRow?.bz), wind: number(plasmaRow?.proton_speed ?? plasmaRow?.speed), time: kpRow?.time_tag || magRow?.time_tag || plasmaRow?.time_tag || new Date().toISOString() },
  aurora: auroraPoints,
  airQuality: settled(air) || [],
  sources: Object.fromEntries(['usgs', 'eonet', 'iss', 'kp', 'mag', 'plasma', 'ovation', 'gdacs', 'tsunamiPaaq', 'tsunamiPheb', 'airQuality'].map((name, index) => [name, results[index].status]))
};

await mkdir('data', { recursive: true });
await writeFile('data/snapshot.json', JSON.stringify(snapshot));
console.log(`snapshot: ${snapshot.events.length} events, ${snapshot.aurora.length} aurora cells, ${snapshot.airQuality.length} air-quality points`);
