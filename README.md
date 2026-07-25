# cici

A beautifully simple, git-backed blog & memo app. Write Markdown, keep everything in
your own Git repo, serve it anywhere. Inspired by [tinymind](https://github.com/mazzzystar/tinymind);
live at [blog.minghe.me](https://blog.minghe.me).

**cici is pure tooling.** Your content — posts, memos, config — lives in *your* repo or
folder. You install cici (`npm i cici` / `npx cici`) and point it at that content. This
repo ships only the app plus a tiny `sample-content/` demo used for local dev and tests.

## Content layout

Your content lives under a **`data/`** folder — in a Git repo this sits at the repo root,
and it's exactly what a deploy serves:

```
data/
  blog/            # one <slug>.md per post (front-matter + Markdown)
  memos.json       # short-form memos
  site-config.json # title, author, social links (optional)
  highlights/      # one <slug>.json per post (optional)
  likes.json       # like counts (optional)
  assets/          # images uploaded from the editor (local mode)
```

## Use it locally

Run cici against a local folder or a GitHub repo — no clone, no build:

```bash
# Serve AND edit local content (open /editor to write; changes save to disk).
# --dir points at the folder that contains blog/ — in a content repo that's data/:
npx cici --dir ./data

# Serve a GitHub content repo (reads its data/ automatically, read-only)
npx cici --repo owner/name

# ...with a token, edit it too (commits back to the repo)
npx cici --repo owner/name --token ghp_xxx --port 4000
```

Options: `--port, -p` (default 3000), `--host` (default 127.0.0.1). Run `npx cici --help`.

## Deploy on Vercel

Your **content repo** is the thing you deploy — it just depends on cici. No app source,
no fork of this repo.

**1.** In your content repo, add `package.json`:

```json
{
  "private": true,
  "scripts": { "build": "cici build" },
  "dependencies": { "cici": "^0.6.0" }
}
```

**2.** Add `vercel.json` (so Vercel serves cici's output instead of running its own Next build):

```json
{ "framework": null, "buildCommand": "cici build" }
```

`cici build` emits Vercel's Build Output API (`.vercel/output/`) — cici's prebuilt server
as one function plus static assets. Vercel serves it directly.

**3.** Set environment variables on the Vercel project:

| Var | Value |
|-----|-------|
| `CICI_REPO` | `owner/name` of your content repo |
| `GITHUB_ID` / `GITHUB_SECRET` | a [GitHub OAuth app](https://github.com/settings/developers) (callback `<site>/api/auth/callback/github`) — `/editor` sign-in |
| `NEXTAUTH_SECRET` | any random string (signs the session) |
| `NEXTAUTH_URL` | your site URL, e.g. `https://blog.example.com` |

Use a **public** content repo for a hosted deploy: cici reads it anonymously (no token),
`/editor` requires GitHub sign-in, and only the **repo owner** can publish — everyone else
just reads.

> **Don't set `CICI_TOKEN` on a hosted deploy.** cici ≥ 0.6.0 ignores it in OAuth mode —
> a shared server token would otherwise authorize *every* visitor to write via `/editor`.
> `CICI_TOKEN` is only for the localhost CLI (`npx cici --repo … --token …`) on your own
> machine; that's also where a **private** content repo is edited.

Deploy. cici reads your content from `CICI_REPO` at request time, so edits (via `/editor`
or a `git push`) show up without a redeploy.

> Prefer a plain Node host (Railway / Render / Fly / a VPS / Docker)? Skip `cici build`
> and run `cici start` with the same `CICI_*` env — it boots the server directly.

## Editing

Open `/editor` to write posts and memos. In `--dir` mode it writes to disk; on the localhost
CLI a `--token` commits back to the repo. On a hosted deploy, `/editor` requires GitHub
sign-in and only the repo owner can commit (see the deploy note about `CICI_TOKEN` above).

## Develop cici itself

```bash
git clone https://github.com/metrue/cici.git
cd cici && npm install && npm run dev   # serves the bundled sample-content/
npm test
```

### Architecture

- **Runtime layer** (`lib/runtime/`): a `ContentProvider` interface with `LocalProvider`
  and `GitHubProvider`; `getProvider()` picks one from `CICI_DIR` / `CICI_REPO` env.
- **Render layer** (`app/`, `components/`): depends only on `getProvider()` — never on
  `fs` or Octokit directly.
- **CLI** (`bin/cici.js`): `--dir` / `--repo` (serve), `build` (Vercel Build Output), `start` (boot from env).

## Documentation

**[→ The Complete cici Guide](/blog/cofe)** — setup, customization, GraphQL API, deployment, and tips.
