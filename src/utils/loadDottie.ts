/**
 * Injects analytics trackers for production builds only.
 *
 * Public/OSS: never hardcode tracker IDs. A dottie `data-website-id` is the
 * site's write_key (anyone can forge /api/collect events). Umami website UUIDs
 * should also stay out of the public tree.
 *
 * Loaded from Vite build-time env (set on Railway, not committed):
 *   VITE_DOTTIE_SRC / VITE_DOTTIE_ID  — dottie-analytics (api.dottie.ai)
 *   VITE_UMAMI_SRC / VITE_UMAMI_ID    — optional legacy Umami dual-fire
 *
 * Absent in local/forks → nothing loads. Tracker also honors data-domains.
 */
const DOMAINS = 'spyglass.bixbyapps.com';

function injectTracker(src: string | undefined, id: string | undefined): void {
  if (typeof document === 'undefined' || !src || !id) return;
  const s = document.createElement('script');
  s.defer = true;
  s.src = src;
  s.dataset.websiteId = id;
  s.dataset.domains = DOMAINS;
  document.head.appendChild(s);
}

injectTracker(import.meta.env.VITE_DOTTIE_SRC, import.meta.env.VITE_DOTTIE_ID);
injectTracker(import.meta.env.VITE_UMAMI_SRC, import.meta.env.VITE_UMAMI_ID);
