#!/usr/bin/env node
/**
 * `npx cici` — serve and edit a cici blog from local files or a GitHub repo.
 *
 *   npx cici --dir <path>          serve/edit a local content folder
 *   npx cici --repo <owner/name>   serve a remote GitHub content repo (read-only)
 *   npx cici --repo <owner/name> --token <t>   ...and edit it
 *
 *   npx cici start                 boot the server from preset env (platform deploy)
 *   npx cici build                 stage cici's prebuilt output into a content repo
 *
 * cici is pure tooling — the blog *content* lives in a separate repo (or a local
 * folder). The backend is chosen at runtime by lib/runtime/config.ts from the env
 * vars set below (CICI_DIR / CICI_REPO / CICI_TOKEN). No GitHub OAuth, no Vercel.
 */

'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const pkg = require('../package.json')

/** cici package root (holds the prebuilt .next/standalone output). */
const CICI_ROOT = path.join(__dirname, '..')

function printHelp() {
  process.stdout.write(`
cici ${pkg.version} — serve and edit your blog from local files or a GitHub repo

Usage:
  npx cici --dir <path> [options]
  npx cici --repo <owner/name> [--token <token>] [options]
  npx cici start
  npx cici build

Commands:
  (default)          Serve a --dir or --repo target (see below)
  start              Boot the server from preset env (CICI_REPO/CICI_TOKEN/CICI_DIR/
                     PORT/HOST) — for platform deploys where the host sets env
  build              Emit the Vercel Build Output API (.vercel/output) into the current
                     directory so a content-only repo deploys on Vercel without app source

Targets (exactly one required for the default command):
  --dir <path>       Local content folder (contains blog/, memos.json, …)
  --repo <owner/name> Remote GitHub content repo (read-only unless --token given)

Options:
  --token <token>    GitHub token — enables editing a --repo target from THIS
                     machine (localhost, single trusted user). Ignored on a
                     hosted deploy with GitHub OAuth, where writes are owner-gated.
  --port, -p <n>     Port to listen on (default: 3000)
  --host <addr>      Host to bind (default: 127.0.0.1)
  --version, -v      Print version
  --help, -h         Show this help

Examples:
  npx cici --dir ~/my-blog
  npx cici --repo metrue/cici
  npx cici --repo metrue/cici --token ghp_xxx --port 4000
  npx cici start
  npx cici build
`)
}

function parseArgs(argv) {
  const out = { dir: undefined, repo: undefined, token: undefined, port: '3000', host: '127.0.0.1', help: false, version: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const eq = arg.indexOf('=')
    const key = eq === -1 ? arg : arg.slice(0, eq)
    const inlineVal = eq === -1 ? undefined : arg.slice(eq + 1)
    const takeVal = () => (inlineVal !== undefined ? inlineVal : argv[++i])
    switch (key) {
      case '--dir': out.dir = takeVal(); break
      case '--repo': out.repo = takeVal(); break
      case '--token': out.token = takeVal(); break
      case '--port': case '-p': out.port = takeVal(); break
      case '--host': out.host = takeVal(); break
      case '--help': case '-h': out.help = true; break
      case '--version': case '-v': out.version = true; break
      default:
        process.stderr.write(`cici: unknown option "${arg}"\n`)
        printHelp()
        process.exit(1)
    }
  }
  return out
}

function fail(msg) {
  process.stderr.write(`cici: ${msg}\n`)
  process.exit(1)
}

/** Path to the prebuilt standalone server inside the cici package. */
function serverPath() {
  return path.join(CICI_ROOT, '.next', 'standalone', 'server.js')
}

/**
 * Boot the prebuilt Next.js standalone server on host:port. Fills in ephemeral
 * NextAuth secret/url so getToken() doesn't throw in the no-OAuth CLI modes.
 * The backend itself is resolved from env by lib/runtime/config.ts.
 */
function bootServer({ port, host, servingLabel }) {
  process.env.PORT = port
  process.env.HOSTNAME = host
  // Auth is bypassed in these modes, but NextAuth's getToken() still runs —
  // give it a secret + url so it doesn't throw. Ephemeral per run.
  if (!process.env.NEXTAUTH_SECRET) process.env.NEXTAUTH_SECRET = crypto.randomBytes(32).toString('hex')
  if (!process.env.NEXTAUTH_URL) process.env.NEXTAUTH_URL = `http://${host}:${port}`

  const server = serverPath()
  if (!fs.existsSync(server)) {
    fail(
      'prebuilt server not found (.next/standalone/server.js). ' +
      'If running from source, build first: `npm run build:cli`.'
    )
  }

  process.stdout.write(`\n  cici ${pkg.version}\n  serving ${servingLabel}\n  → http://${host}:${port}\n\n`)

  require(server)
}

/**
 * `cici start` — boot the server purely from preset env (CICI_REPO/CICI_TOKEN/
 * CICI_DIR/PORT/HOST). No --dir/--repo required: the host (e.g. a PaaS) supplies
 * the backend env, and lib/runtime/config.ts resolves it (falling back to the
 * production GitHub default when nothing is set).
 */
function runStart() {
  const port = String(parseInt(process.env.PORT, 10) || 3000)
  const host = process.env.HOST || process.env.HOSTNAME || '0.0.0.0'

  let servingLabel
  if (process.env.CICI_DIR) servingLabel = process.env.CICI_DIR
  else if (process.env.CICI_REPO) servingLabel = `${process.env.CICI_REPO}${process.env.CICI_TOKEN ? '' : ' (read-only)'}`
  else servingLabel = 'backend from environment'

  bootServer({ port, host, servingLabel })
}

/**
 * `cici build` — emit the Vercel Build Output API (`.vercel/output`) into the
 * CONSUMER's current directory so a content-only repo deploys on Vercel WITHOUT
 * shipping cici's app source and WITHOUT Vercel running its Next.js builder.
 *
 * cici ships a self-contained Next standalone server (server.js + node_modules +
 * .next/). Rather than hand Vercel a prebuilt `.next` (whose baked build-machine
 * paths break Vercel's Next builder), we package that standalone as a single Node
 * serverless function and drop the static assets into a static dir. Vercel serves
 * the result directly from the Build Output API.
 *
 * Sources (inside the installed cici package = CICI_ROOT):
 *   <cici>/.next/standalone  — self-contained server (server.js, node_modules, .next/)
 *   <cici>/.next/static      — hashed client assets (served at /_next/static)
 *   <cici>/public            — static public files (served at /)
 *
 * Produces (in <cwd>/.vercel/output, cleaned first):
 *   functions/index.func/    — the standalone dir + a Node handler wrapping it
 *   static/                  — _next/static + public files
 *   config.json              — routes: filesystem first, else the function
 */
function runBuild() {
  const cwd = process.cwd()
  const nextDir = path.join(CICI_ROOT, '.next')
  const standalone = path.join(nextDir, 'standalone')
  const standaloneServer = path.join(standalone, 'server.js')

  if (!fs.existsSync(standaloneServer)) {
    fail(
      'cannot build: cici has no prebuilt standalone server (.next/standalone/server.js).\n' +
      '  This normally ships inside the installed `cici` package. If you are running\n' +
      '  from source, build it first with `npm run build:cli`.'
    )
  }

  const outDir = path.join(cwd, '.vercel', 'output')
  const fnDir = path.join(outDir, 'functions', 'index.func')
  const staticOut = path.join(outDir, 'static')
  const ciciStatic = path.join(nextDir, 'static')
  const ciciPublic = path.join(CICI_ROOT, 'public')

  // Clean any prior output so stale files never leak into a deploy.
  fs.rmSync(outDir, { recursive: true, force: true })

  // 1. Function: the entire self-contained standalone dir.
  fs.mkdirSync(fnDir, { recursive: true })
  fs.cpSync(standalone, fnDir, { recursive: true })

  // The runtime server reads .next/static relative to its dir — ensure it's present.
  if (fs.existsSync(ciciStatic)) {
    fs.cpSync(ciciStatic, path.join(fnDir, '.next', 'static'), { recursive: true })
  }

  // 2. Handler: boot the standalone Next server as a plain Node request handler.
  const handler = [
    "const path = require('path')",
    "process.env.NODE_ENV = 'production'",
    'process.chdir(__dirname)',
    "const NextServer = require('next/dist/server/next-server').default",
    'let conf = {}',
    "try { conf = require('./.next/required-server-files.json').config } catch (e) {}",
    'const app = new NextServer({ dir: __dirname, dev: false, conf, customServer: false })',
    'const handler = app.getRequestHandler()',
    'module.exports = (req, res) => handler(req, res)',
    '',
  ].join('\n')
  fs.writeFileSync(path.join(fnDir, 'index.js'), handler)

  // 3. Function config for the Vercel Node runtime.
  const vcConfig = {
    runtime: 'nodejs22.x',
    handler: 'index.js',
    launcherType: 'Nodejs',
    shouldAddHelpers: false,
    supportsResponseStreaming: true,
  }
  fs.writeFileSync(path.join(fnDir, '.vc-config.json'), JSON.stringify(vcConfig, null, 2) + '\n')

  // 4. Static assets: hashed client bundles + public files.
  fs.mkdirSync(staticOut, { recursive: true })
  let staticCopied = false
  let publicCopied = false
  if (fs.existsSync(ciciStatic)) {
    fs.cpSync(ciciStatic, path.join(staticOut, '_next', 'static'), { recursive: true })
    staticCopied = true
  }
  if (fs.existsSync(ciciPublic)) {
    for (const entry of fs.readdirSync(ciciPublic)) {
      fs.cpSync(path.join(ciciPublic, entry), path.join(staticOut, entry), { recursive: true })
    }
    publicCopied = true
  }

  // 5. Top-level build output config: serve files first, else the function.
  //    `images` lets Vercel's built-in Image Optimization serve `/_next/image`
  //    (the standalone function has no `sharp`, so without this next/image 404s).
  //    remotePatterns mirror next.config (any host); sizes are the Next defaults.
  const config = {
    version: 3,
    routes: [
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/index' },
    ],
    images: {
      sizes: [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840],
      remotePatterns: [
        { protocol: 'https', hostname: '**' },
        { protocol: 'http', hostname: '**' },
      ],
      minimumCacheTTL: 60,
      formats: ['image/webp'],
    },
  }
  fs.writeFileSync(path.join(outDir, 'config.json'), JSON.stringify(config, null, 2) + '\n')

  const rel = (p) => path.relative(cwd, p) || p
  process.stdout.write(
    `\n  cici ${pkg.version} build — Vercel Build Output API\n` +
    `  emitted ${rel(outDir)}\n` +
    `    ✓ ${rel(path.join(fnDir, 'index.js'))} (Node function handler)\n` +
    `    ✓ ${rel(path.join(fnDir, '.vc-config.json'))} (runtime config)\n` +
    `    ✓ ${rel(fnDir)}/ (standalone server + node_modules)\n` +
    `    ${staticCopied ? '✓' : '·'} ${rel(path.join(staticOut, '_next', 'static'))}${staticCopied ? '' : ' (no .next/static)'}\n` +
    `    ${publicCopied ? '✓' : '·'} public files → ${rel(staticOut)}${publicCopied ? '' : ' (no public/)'}\n` +
    `    ✓ ${rel(path.join(outDir, 'config.json'))}\n` +
    `\n  Deploy on Vercel with no app source — it serves .vercel/output directly.\n\n`
  )
}

/** Default command: serve a --dir or --repo target from CLI options. */
function runServe(args) {
  if (!args.dir && !args.repo) fail('provide exactly one of --dir <path> or --repo <owner/name>. Run `cici --help`.')
  if (args.dir && args.repo) fail('use only one of --dir or --repo, not both.')

  const port = String(parseInt(args.port, 10) || 3000)
  const host = args.host

  let servingLabel
  if (args.dir) {
    const dir = path.resolve(args.dir)
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      fail(`--dir path is not a directory: ${dir}`)
    }
    if (!fs.existsSync(path.join(dir, 'blog')) && !fs.existsSync(path.join(dir, 'memos.json'))) {
      process.stderr.write(`cici: note — ${dir} has no blog/ or memos.json yet. Starting empty.\n`)
    }
    process.env.CICI_DIR = dir
    servingLabel = dir
  } else {
    if (!/^[^/]+\/[^/]+$/.test(args.repo)) {
      fail(`--repo must be "owner/name" (got "${args.repo}").`)
    }
    process.env.CICI_REPO = args.repo
    if (args.token) process.env.CICI_TOKEN = args.token
    servingLabel = `${args.repo}${args.token ? '' : ' (read-only)'}`
  }

  bootServer({ port, host, servingLabel })
}

function main() {
  // Detect subcommands before option parsing.
  const cmd = process.argv[2]
  if (cmd === 'start') { runStart(); return }
  if (cmd === 'build') { runBuild(); return }

  const args = parseArgs(process.argv.slice(2))
  if (args.help) { printHelp(); return }
  if (args.version) { process.stdout.write(`${pkg.version}\n`); return }

  runServe(args)
}

main()
