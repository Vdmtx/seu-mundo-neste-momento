/* Inicialização segura de medição e consentimento. */
window.dataLayer = window.dataLayer || [];
window.gtag = function gtag() { window.dataLayer.push(arguments); };

gtag('consent', 'default', {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  wait_for_update: 500
});

try {
  if (localStorage.getItem('analytics-consent') === 'granted') {
    gtag('consent', 'update', { analytics_storage: 'granted' });
  }
} catch { /* armazenamento pode estar desativado */ }

gtag('js', new Date());
gtag('config', 'G-3BHTT4DGNX', { send_page_view: true });

window.addEventListener('DOMContentLoaded', () => {
  const box = document.getElementById('analytics-consent');
  if (!box) return;
  let choice = null;
  try { choice = localStorage.getItem('analytics-consent'); } catch { /* armazenamento pode estar desativado */ }
  if (!choice) box.hidden = false;

  document.getElementById('analytics-accept').onclick = () => {
    try { localStorage.setItem('analytics-consent', 'granted'); } catch { /* armazenamento pode estar desativado */ }
    gtag('consent', 'update', { analytics_storage: 'granted' });
    box.hidden = true;
  };

  document.getElementById('analytics-reject').onclick = () => {
    try { localStorage.setItem('analytics-consent', 'denied'); } catch { /* armazenamento pode estar desativado */ }
    gtag('consent', 'update', { analytics_storage: 'denied' });
    box.hidden = true;
  };
});
