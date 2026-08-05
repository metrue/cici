import createNextIntlPlugin from 'next-intl/plugin'
import path from 'path'
import { fileURLToPath } from 'url'

const withNextIntl = createNextIntlPlugin()

/** @type {import('next').NextConfig} */

const nextConfig = {
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
