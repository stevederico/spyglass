/**
 * Injects the dottie analytics tracker alongside Umami (dual-fire).
 *
 * Public/OSS repo: the dottie `data-website-id` is the site's write_key, so it
 * must NOT be hardcoded. Loaded from Vite build-time env (VITE_DOTTIE_SRC /
 * VITE_DOTTIE_ID) — absent in dev/forks, so nothing loads there. The tracker
 * itself also honors `data-domains` and bails on localhost.
 */
const src = import.meta.env.VITE_DOTTIE_SRC;
const id = import.meta.env.VITE_DOTTIE_ID;

if (typeof document !== 'undefined' && src && id) {
  const s = document.createElement('script');
  s.defer = true;
  s.src = src;
  s.dataset.websiteId = id;
  s.dataset.domains = 'spyglass.bixbyapps.com';
  document.head.appendChild(s);
}
