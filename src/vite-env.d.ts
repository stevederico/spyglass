/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** dottie analytics tracker script URL (build-time, OSS env-loaded). */
  readonly VITE_DOTTIE_SRC?: string;
  /** dottie site write_key / data-website-id (build-time, OSS env-loaded). */
  readonly VITE_DOTTIE_ID?: string;
}
