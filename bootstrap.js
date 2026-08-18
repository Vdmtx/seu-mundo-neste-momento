/* Inicialização segura de medição e consentimento. */
let initialTheme = 'dark';
try { if (localStorage.getItem('site-theme') === 'light') initialTheme = 'light'; } catch { /* armazenamento pode estar desativado */ }
document.documentElement.dataset.theme = initialTheme;
document.documentElement.style.colorScheme = initialTheme;

window.dataLayer = window.dataLayer || [];
window.gtag = function gtag() { window.dataLayer.push(arguments); };
let analyticsLoaded = false;

gtag('consent', 'default', {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  wait_for_update: 500
});

function loadAnalytics() {
  if (analyticsLoaded) return;
  analyticsLoaded = true;
  gtag('consent', 'update', { analytics_storage: 'granted' });
  gtag('js', new Date());
  gtag('config', 'G-3BHTT4DGNX', { send_page_view: true });
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=G-3BHTT4DGNX';
  document.head.append(script);
}

try { if (localStorage.getItem('analytics-consent') === 'granted') loadAnalytics(); } catch { /* armazenamento pode estar desativado */ }

window.addEventListener('DOMContentLoaded', () => {
  const box = document.getElementById('analytics-consent');
  if (!box) return;
  let choice = null;
  try { choice = localStorage.getItem('analytics-consent'); } catch { /* armazenamento pode estar desativado */ }
  if (!choice) box.hidden = false;

  document.getElementById('analytics-accept').onclick = () => {
    try { localStorage.setItem('analytics-consent', 'granted'); } catch { /* armazenamento pode estar desativado */ }
    loadAnalytics();
    box.hidden = true;
  };

  document.getElementById('analytics-reject').onclick = () => {
    try { localStorage.setItem('analytics-consent', 'denied'); } catch { /* armazenamento pode estar desativado */ }
    gtag('consent', 'update', { analytics_storage: 'denied' });
    box.hidden = true;
  };
});
