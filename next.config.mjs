import createNextIntlPlugin from 'next-intl/plugin'
import path from 'path'
import { fileURLToPath } from 'url'

const withNextIntl = createNextIntlPlugin()

const isDev = process.env.NODE_ENV !== 'production'

// Content-Security-Policy. Kept intentionally permissive because post bodies can
// embed raw HTML (rehype-raw) — arbitrary https images/iframes/media must keep
// working — and Umami analytics loads a third-party script + beacon. `img-src`
// stays broad even though next/image proxies most images same-origin. In dev we
// additionally allow `'unsafe-eval'` (Next HMR) and `ws:`/`wss:` (fast refresh).
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline' https://cloud.umami.is${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' https:${isDev ? ' ws: wss:' : ''}`,
  "frame-src 'self' https:",
  "media-src 'self' https:",
  "frame-ancestors 'self'",
  'upgrade-insecure-requests',
].join('; ')

// Applied to every route (issue #134): clickjacking, MIME-sniffing, referrer,
// origin isolation, and HSTS with includeSubDomains + preload.
const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
]

/** @type {import('next').NextConfig} */

const nextConfig = {
  // Ship source maps for production client bundles so the browser can map minified
  // stack traces back to source (issue #134).
  productionBrowserSourceMaps: true,
  // Standalone output powers the `npx cici` CLI: a self-contained server that
  // can serve any `--data <dir>` at runtime. Vercel handles this output natively.
  output: 'standalone',
  // Pin the file-tracing root to this project so Next doesn't infer a parent
  // directory as the workspace root when a stray lockfile exists elsewhere
  // (e.g. a user's home dir) — that misdetection pulled a foreign Next version
  // in issue #111. Top-level in Next 15 (was experimental.* in 14).
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  // The upload route dynamically imports heic-convert (HEIC→JPEG). Its libheif
  // WASM is loaded at runtime, which nft doesn't always trace — force-include
  // both packages so the standalone server can transcode HEIC on Vercel.
  outputFileTracingIncludes: {
    '/api/upload': [
      './node_modules/heic-convert/**',
      './node_modules/libheif-js/**',
    ],
  },
  // Route the ISR/fetch cache to os.tmpdir() — the standalone server runs from a
  // read-only FS on Vercel (/var/task), so the default .next/cache mkdir fails.
  cacheHandler: new URL('./cache-handler.cjs', import.meta.url).pathname,
  cacheMaxMemorySize: 0,
  reactStrictMode: true,
  images: {
    // Serve modern formats; next/image negotiates AVIF → WebP → original.
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
      },
      {
        protocol: 'http',
        hostname: '*',
      },
    ],
  },
  async headers() {
    return [
      {
        // Security headers on every response (issue #134).
        source: '/:path*',
        headers: securityHeaders,
      },
      // NOTE: BFCache / TTFB (issue #132) is NOT fixed here. Post pages render
      // dynamically — `app/layout.tsx` reads the session and `i18n/request.ts`
      // reads Accept-Language via `headers()` — so Next emits `no-store` and
      // overrides any Cache-Control set here. The real fix is making the route
      // non-dynamic (client-side session + non-header locale); tracked separately.
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,DELETE,PATCH,POST,PUT' },
          {
            key: 'Access-Control-Allow-Headers',
            value:
              'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
          },
        ],
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/manifest.json',
        destination: '/manifest.json',
      },
    ]
  },
}

export default withNextIntl(nextConfig)
