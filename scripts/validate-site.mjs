import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const errors = [];
const checks = [];
const supportedLanguages = ['pt-BR', 'en', 'es'];
const allowedCategories = new Set(['earthquakes', 'wildfires', 'storms', 'volcanoes', 'floods', 'tsunamis', 'landslides', 'damFailures', 'other', 'hazmat', 'nuclear']);
const allowedSeverities = new Set(['critical', 'high', 'medium', 'low']);

function fail(message) { errors.push(message); }
function pass(message) { checks.push(message); }
function assert(condition, message) { if (!condition) fail(message); }
async function text(file) { return readFile(path.join(root, file), 'utf8'); }
async function json(file) {
  try { return JSON.parse(await text(file)); }
  catch (error) { fail(`${file}: JSON inválido (${error.message})`); return null; }
}

async function validateRequiredFiles() {
  const required = [
    'index.html', 'metodologia.html', 'app.js', 'bootstrap.js', 'i18n.js', 'methodology.js',
    'styles.css', 'enhancements.css', 'methodology.css', 'favicon.svg', 'manifest.webmanifest',
    'robots.txt', 'sitemap.xml', 'data/snapshot.json', 'data/admin1.json', 'assets/earth-night.jpg',
    'assets/earth-topology.png', 'scripts/update-data.mjs', 'scripts/update-temperature.py'
  ];
  for (const file of required) {
    try { await access(path.join(root, file), constants.R_OK); }
    catch { fail(`Arquivo essencial ausente: ${file}`); }
  }
  pass(`${required.length} arquivos essenciais verificados`);
}

function validateJavaScriptSyntax(files) {
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) fail(`${file}: erro de sintaxe\n${(result.stderr || result.stdout).trim()}`);
  }
  pass(`${files.length} arquivos JavaScript verificados`);
}

function htmlIds(source, file) {
  const ids = [...source.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) fail(`${file}: id duplicado “${id}”`);
    seen.add(id);
  }
  return seen;
}

async function validateHtml() {
  const index = await text('index.html');
  const methodology = await text('metodologia.html');
  const indexIds = htmlIds(index, 'index.html');
  htmlIds(methodology, 'metodologia.html');
  const requiredIds = [
    'map', 'globe', 'view-button', 'category-list', 'event-feed', 'source-list', 'language-select',
    'temperature-toggle', 'aurora-toggle', 'air-toggle', 'regions-toggle', 'conflicts-toggle',
    'daylight-toggle', 'satellite-toggle', 'iss-toggle', 'my-world-dialog', 'event-dialog',
    'analytics-consent'
  ];
  for (const id of requiredIds) assert(indexIds.has(id), `index.html: elemento essencial ausente #${id}`);
  assert(/<meta\s+name=["']description["']/i.test(index), 'index.html: descrição SEO ausente');
  assert(/<link\s+rel=["']canonical["']/i.test(index), 'index.html: canonical ausente');
  assert(/app\.js\?v=\d+/.test(index), 'index.html: versão de cache do app.js ausente');
  assert(/Content-Security-Policy/i.test(index), 'index.html: política de segurança ausente');
  pass('Estrutura HTML, IDs críticos e metadados verificados');
  return { index, methodology };
}

function loadTranslations(source) {
  const instrumented = source.replace('const translations = {', 'globalThis.__translations = {');
  const sandbox = {
    window: { dispatchEvent() {} },
    document: { documentElement: {}, title: '', querySelector: () => null, querySelectorAll: () => [], getElementById: () => null },
    localStorage: { getItem: () => 'pt-BR', setItem() {} },
    navigator: { language: 'pt-BR' },
    CustomEvent: class CustomEvent {}
  };
  vm.runInNewContext(instrumented, sandbox, { filename: 'i18n.js' });
  return sandbox.__translations;
}

async function validateTranslations(index) {
  let translations;
  try { translations = loadTranslations(await text('i18n.js')); }
  catch (error) { fail(`i18n.js: não foi possível carregar traduções (${error.message})`); return; }
  for (const language of supportedLanguages) assert(translations?.[language], `i18n.js: idioma ausente ${language}`);
  if (!supportedLanguages.every(language => translations?.[language])) return;
  const reference = new Set(Object.keys(translations['pt-BR']));
  for (const language of ['en', 'es']) {
    const keys = new Set(Object.keys(translations[language]));
    for (const key of reference) if (!keys.has(key)) fail(`i18n.js: chave “${key}” ausente em ${language}`);
    for (const key of keys) if (!reference.has(key)) fail(`i18n.js: chave extra “${key}” em ${language}`);
  }
  const markupKeys = new Set([
    ...index.matchAll(/\bdata-i18n\s*=\s*["']([^"']+)["']/gi),
    ...index.matchAll(/\bdata-i18n-placeholder\s*=\s*["']([^"']+)["']/gi)
  ].map(match => match[1]));
  const app = await text('app.js');
  const staticAppKeys = new Set([...app.matchAll(/\bt\(\s*["']([^"']+)["']/g)].map(match => match[1]));
  for (const key of new Set([...markupKeys, ...staticAppKeys])) {
    for (const language of supportedLanguages) if (!(key in translations[language])) fail(`Tradução “${key}” ausente em ${language}`);
  }
  pass(`${reference.size} traduções equivalentes em três idiomas verificadas`);
}

async function validateNewsControl() {
  const app = await text('app.js');
  assert(/\$\('#regions-button'\)\.onclick\s*=\s*\(\)\s*=>\s*toggleRegions\(true\)/.test(app), 'app.js: botão Notícias não pode ocultar a camada ao ser clicado');
  assert(!/\$\('#regions-button'\)\.onclick\s*=\s*\(\)\s*=>\s*toggleRegions\(!state\.showRegions\)/.test(app), 'app.js: regressão — botão Notícias voltou a alternar e ocultar marcadores');
  pass('Controle de Notícias protegido contra ocultação acidental');
}

async function validateLocalReferences(files) {
  const locallyMissing = new Set();
  for (const [file, source] of Object.entries(files)) {
    for (const match of source.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
      const raw = match[1];
      if (!raw || /^(?:https?:|data:|blob:|mailto:|tel:|#)/i.test(raw)) continue;
      const clean = decodeURIComponent(raw.split(/[?#]/)[0]);
      if (!clean) continue;
      const target = path.resolve(root, path.dirname(file), clean);
      if (!target.startsWith(root + path.sep) && target !== root) { fail(`${file}: referência sai do projeto (${raw})`); continue; }
      try { await access(target, constants.R_OK); }
      catch { locallyMissing.add(`${file} → ${clean}`); }
    }
  }
  const incompleteLocalCheckout = process.env.LOCAL_INCOMPLETE_CHECKOUT === '1';
  for (const missing of locallyMissing) {
    const knownLocalOmission = /logo vdmtx(?: monocromático branco)?\.png$/i.test(missing);
    if (!(incompleteLocalCheckout && knownLocalOmission)) fail(`Referência local quebrada: ${missing}`);
  }
  pass('Referências locais de HTML verificadas');
}

function validDate(value) { return typeof value === 'string' && !Number.isNaN(new Date(value).getTime()); }
function validCoordinate(point) { return Number.isFinite(point?.lat) && point.lat >= -90 && point.lat <= 90 && Number.isFinite(point?.lon) && point.lon >= -180 && point.lon <= 180; }

async function validateSnapshot() {
  const snapshot = await json('data/snapshot.json');
  if (!snapshot) return;
  assert(validDate(snapshot.generatedAt), 'snapshot: generatedAt inválido');
  assert(Array.isArray(snapshot.events) && snapshot.events.length > 0, 'snapshot: lista de ocorrências vazia');
  const ids = new Set();
  for (const [index, event] of (snapshot.events || []).entries()) {
    const label = `snapshot.events[${index}]`;
    assert(typeof event.id === 'string' && event.id.length > 2, `${label}: id inválido`);
    if (ids.has(event.id)) fail(`${label}: id duplicado “${event.id}”`); else ids.add(event.id);
    assert(allowedCategories.has(event.category), `${label}: categoria inválida “${event.category}”`);
    assert(allowedSeverities.has(event.severity), `${label}: gravidade inválida “${event.severity}”`);
    assert(typeof event.title === 'string' && event.title.trim(), `${label}: título ausente`);
    assert(typeof event.location === 'string' && event.location.trim(), `${label}: localização ausente`);
    assert(typeof event.source === 'string' && event.source.trim(), `${label}: fonte ausente`);
    assert(validDate(event.timestamp), `${label}: horário inválido`);
    assert(validCoordinate(event), `${label}: coordenadas inválidas`);
    assert(/^https?:\/\//i.test(event.url || ''), `${label}: URL da fonte inválida`);
    if (/^NOAA PA(?:AQ|HEB)/.test(event.source || '')) assert(event.category === 'tsunamis', `${label}: alerta NOAA de tsunami em categoria incorreta`);
    if (event.category === 'tsunamis') assert(/^NOAA PA(?:AQ|HEB)/.test(event.source || ''), `${label}: tsunami sem centro oficial NOAA aceito`);
    if (event.category === 'nuclear' || event.category === 'hazmat') assert(event.source !== 'COBERTURA JORNALÍSTICA MULTIFONTE', `${label}: incidente sensível não pode vir apenas de notícias`);
  }
  for (const [name, rows] of [['aurora', snapshot.aurora], ['airQuality', snapshot.airQuality]]) {
    assert(Array.isArray(rows), `snapshot: ${name} não é uma lista`);
    for (const [index, point] of (rows || []).entries()) assert(validCoordinate(point), `snapshot.${name}[${index}]: coordenadas inválidas`);
  }
  for (const [index, point] of (snapshot.aurora || []).entries()) assert(Number.isFinite(point.intensity) && point.intensity >= 0 && point.intensity <= 100, `snapshot.aurora[${index}]: intensidade inválida`);
  const requireGeneratedSnapshot = process.env.REQUIRE_GENERATED_SNAPSHOT === '1';
  const grid = snapshot.temperatureGrid || (requireGeneratedSnapshot ? null : await json('data/temperature.json'));
  assert(grid && Array.isArray(grid.values), requireGeneratedSnapshot ? 'snapshot: publicação sem grade térmica consolidada' : 'dados: grade térmica ausente');
  if (grid?.values) {
    assert(Number.isInteger(grid.rows) && Number.isInteger(grid.columns), 'snapshot: dimensões térmicas inválidas');
    assert(grid.rows * grid.columns === grid.values.length, `snapshot: grade térmica esperava ${grid.rows * grid.columns} valores e recebeu ${grid.values.length}`);
    assert(grid.values.some(Number.isFinite), 'snapshot: grade térmica sem valores válidos');
    assert(validDate(grid.observedAt), 'snapshot: horário da grade térmica inválido');
  }
  for (const [index, article] of (snapshot.news || []).entries()) {
    assert(supportedLanguages.includes(article.language), `snapshot.news[${index}]: idioma inválido`);
    assert(/^https?:\/\//i.test(article.url || ''), `snapshot.news[${index}]: URL inválida`);
    assert(validDate(article.seendate), `snapshot.news[${index}]: horário inválido`);
  }
  pass(`${snapshot.events?.length || 0} ocorrências e camadas ambientais verificadas`);
}

async function validateAutomation() {
  for (const workflow of ['.github/workflows/update-live-data.yml', '.github/workflows/update-temperature.yml']) {
    const source = await text(workflow);
    assert(source.includes('node scripts/validate-site.mjs'), `${workflow}: barreira de qualidade ausente`);
  }
  pass('Barreira de qualidade presente nas duas publicações automáticas');
}

await validateRequiredFiles();
validateJavaScriptSyntax(['app.js', 'bootstrap.js', 'i18n.js', 'methodology.js', 'scripts/update-data.mjs', 'scripts/validate-site.mjs']);
const html = await validateHtml();
await validateTranslations(html.index);
await validateNewsControl();
await validateLocalReferences({ 'index.html': html.index, 'metodologia.html': html.methodology });
await validateSnapshot();
await validateAutomation();

if (errors.length) {
  console.error(`\nVALIDAÇÃO REPROVADA · ${errors.length} problema(s)\n`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`\nVALIDAÇÃO APROVADA · ${checks.length} grupos\n`);
for (const check of checks) console.log(`✓ ${check}`);
