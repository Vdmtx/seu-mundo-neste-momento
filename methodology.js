(() => {
  const supported = ['pt-BR', 'en', 'es'];
  const ui = {
    'pt-BR': { language: 'IDIOMA', back: 'VOLTAR AO MONITOR', light: 'MODO CLARO', dark: 'MODO ESCURO', independent: 'MONITOR INDEPENDENTE · DADOS PÚBLICOS', description: 'Metodologia, fontes, intervalos de atualização, limitações e critérios de integridade do monitor Seu Mundo Neste Momento.' },
    en: { language: 'LANGUAGE', back: 'BACK TO MONITOR', light: 'LIGHT MODE', dark: 'DARK MODE', independent: 'INDEPENDENT MONITOR · PUBLIC DATA', description: 'Methodology, sources, update intervals, limitations and integrity criteria for Seu Mundo Neste Momento.' },
    es: { language: 'IDIOMA', back: 'VOLVER AL MONITOR', light: 'MODO CLARO', dark: 'MODO OSCURO', independent: 'MONITOR INDEPENDIENTE · DATOS PÚBLICOS', description: 'Metodología, fuentes, intervalos de actualización, limitaciones y criterios de integridad de Seu Mundo Neste Momento.' }
  };
  const read = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage may be disabled */ } };
  let language = read('site-language', 'pt-BR');
  if (!supported.includes(language)) language = 'pt-BR';
  let theme = read('site-theme', matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const applyTheme = () => { document.documentElement.dataset.theme = theme; document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#edf3f1' : '#05090d'; document.getElementById('method-theme').textContent = ui[language][theme === 'dark' ? 'light' : 'dark']; };
  const applyLanguage = () => {
    document.documentElement.lang = language;
    document.querySelectorAll('[data-language]').forEach(article => { article.hidden = article.dataset.language !== language; });
    document.querySelectorAll('[data-ui]').forEach(node => { node.textContent = ui[language][node.dataset.ui]; });
    document.querySelector('meta[name="description"]').content = ui[language].description;
    document.getElementById('method-language').value = language;
    applyTheme();
  };
  document.getElementById('method-language').addEventListener('change', event => { language = event.target.value; write('site-language', language); applyLanguage(); });
  document.getElementById('method-theme').addEventListener('click', () => { theme = theme === 'dark' ? 'light' : 'dark'; write('site-theme', theme); applyTheme(); });
  applyLanguage();
})();
