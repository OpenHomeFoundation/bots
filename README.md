# OHF Bots

A Node.js service running the GitHub and Discord bots for various Open Home Foundation projects most noteably Home Assistant and ESPHome. 

## Development

This repo follows the OHF [task conventions](https://standards.openhomefoundation.org/standards/task-conventions/). `mise install` provisions the pinned Node and pnpm versions (see `.mise.toml`), and CI uses the same pins.

```bash
mise install         # Provision Node + pnpm
mise run setup       # First-time setup (deps + .env from .env.example)
mise run dev         # Start local dev server
mise run test        # Run tests
mise run ci          # Full CI suite (lint, typecheck, test, build)
mise run check       # Lint + typecheck only
mise run format      # Auto-fix formatting
```

`mise tasks` shows all tasks; lifecycle tasks call `script/*`, convenience tasks wrap the pnpm scripts in `package.json`, which work directly too (`pnpm run dev`, …). Under the hood, `pnpm` is used as the package manager. A local `.env` is loaded into every task's environment automatically. A husky pre-commit hook runs `lint-staged` (biome) on staged files.

## Running the Gitbub bot locally against a fork

The bot only acts on the repositories listed in `src/github/manifests/`, so to exercise it end-to-end without touching a production repo you point it at a **fork you own**. The loop is: a GitHub App on your fork sends webhooks → [smee.io](https://smee.io) tunnels them to your laptop → the local server evaluates its rules and calls back into the fork.

### 1. Create a GitHub App

Create a personal GitHub App under **Settings → Developer settings → GitHub Apps → New GitHub App** (this can be a user-owned app; org ownership is only needed for the team-expansion permission below).

- **Webhook URL** — the smee channel from step 2 (you can fill this in after creating the channel; the path the server listens on is `/github/webhook`).
- **Webhook secret** — generate a random string; it goes into `GITHUB_WEBHOOK_SECRET`.
- **Private key** — after creating the app, generate a private key and download the `.pem`; it goes into `GITHUB_PRIVATE_KEY`.

**Repository permissions:**

| Permission | Level | Why |
|---|---|---|
| Metadata | Read | Mandatory baseline for all repo access |
| Issues | Read & Write | Labels, assignees, comments, reactions, title/state |
| Pull requests | Read & Write | Files/reviews/commits, request reviewers, dismiss review, update branch |
| Contents | Read | Fetch `CODEOWNERS` |
| Commit statuses | Read & Write | The dashboard status the bot posts on each PR |

**Subscribe to events:** `Issues`, `Issue comment`, `Pull request`, `Pull request review`.

> **Team-expansion rules can't be tested on a personal fork.** The code-owner rules resolve `@org/team` refs and org membership against the *fork owner's* org (the bot passes `repo.owner` as the org — see `rule-context.ts`), not `home-assistant`. A `CODEOWNERS` entry like `@home-assistant/foo` won't match a `yourname/` fork and is left unexpanded; membership checks against your personal account just return false. These lookups fail closed, so nothing crashes — the rules simply no-op. Exercising them for real needs the fork inside an org whose own teams its `CODEOWNERS` references, with the app installed there and granted org **Members: Read**.

After creating the app, **install it on your fork** (GitHub App page → Install App → select the fork). The install page URL ends in `/installations/<id>` — that number is your `GITHUB_INSTALLATION_ID`. The app's numeric ID (App settings → "App ID") is `GITHUB_APP_ID`.

### 2. Set up smee

GitHub can't reach `localhost`, so tunnel deliveries through smee. Get a channel by visiting [smee.io](https://smee.io/) and use it in the commands below:

```bash
# Get a channel URL from https://smee.io/new, then:
npx smee-client --url https://smee.io/<your-channel> --target http://localhost:8787/github/webhook
```

Use that same `https://smee.io/<your-channel>` URL as the GitHub App's **Webhook URL**. Leave the tunnel running in the background.

> The webhook secret and installation must match, or deliveries are rejected with `401 Invalid signature` — check the smee output and the app's "Advanced → Recent Deliveries" tab if events don't arrive.

### 3. Point the bot at your fork

Rules are keyed by the repository's canonical `owner/repo` slug. To run an existing repo's rule set against your fork instead, add your fork's slug to that manifest's `aliases`. The core manifest already carries a placeholder for exactly this:

```ts
// src/github/manifests/home-assistant-core/index.ts
export const homeAssistantCore: RepoManifest = {
  slug: HomeAssistantRepository.CORE,
  aliases: ["yourname/core"], // ← change to your fork's owner/repo
  ...
};
```

The fork then shares the exact same rule instances as the real repo — no duplication. Aliases are validated at boot: a slug claimed by two manifests fails loudly on startup.

### 4. Configure `.env` and run

Copy `.env.example` to `.env` and fill in the values gathered above:

```bash
cp .env.example .env
# GITHUB_APP_ID, GITHUB_INSTALLATION_ID, GITHUB_WEBHOOK_SECRET, GITHUB_PRIVATE_KEY
```

The `GITHUB_PRIVATE_KEY` must be on one line with `\n` for newlines (see the comment in `.env.example`). Then:

```bash
mise run dev   # dev server on http://localhost:8787, watch mode
```

Open or label a PR/issue on your fork and the delivery should flow smee → server → back to the fork. `GET /__lbheartbeat__` returns `{}` for a quick liveness check.

### Capturing fixtures

`mise run capture` runs a standalone server that records real GitHub deliveries into scrubbed test fixtures — point the same smee tunnel at it instead of the dev server. See `scripts/capture-webhooks.ts` for the workflow.

## Health and version endpoints

`HealthModule` (`src/health/`) serves the operational endpoints every OHF NestJS service shares, so probes and dashboards are configured identically across deployments:

| Endpoint | Response | Use |
|---|---|---|
| `GET /__lbheartbeat__` | `{}` | Load-balancer liveness. Checks nothing on purpose - a dependency outage must not pull a container that can still serve webhooks out of rotation. The Docker `HEALTHCHECK` uses this one. |
| `GET /__heartbeat__` | `{}` | Deep heartbeat. Returns whatever the optional `extraHealthData` callback passed to `HealthModule.register` resolves to; nothing is wired up yet, so it is empty. |
| `GET /__version__` | `{"version","commit"}` | Which build is running. `version` comes from `package.json`; `commit` from the `GIT_COMMIT` environment variable, baked into the image by the release workflow and reported as `dev` locally. |
