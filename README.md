# gym-master-mcp

Local **stdio** MCP (Model Context Protocol) server for the [GymMaster](https://gymmasteronline.com) Reporting API v2. Any club with a Reporting API key can install it, register it in Claude Desktop (or another MCP client), and pull KPI fields, standard reports, and membership counts with provenance.

This package is gym-agnostic: it does not embed a particular club’s membership types, scoreboard layout, or sheet IDs. Club-specific workflows belong in a separate skill or operator notes.

## Requirements

- **Node.js 22+** (`node --version`)
- **pnpm 10.13.1** (pinned via `packageManager` in `package.json`)

### Getting the pinned pnpm

`packageManager` metadata alone does not install pnpm. On a fresh machine:

```bash
# Option A — Corepack (ships with Node 22+)
corepack enable
corepack prepare pnpm@10.13.1 --activate

# Option B — npm global
npm install -g pnpm@10.13.1
```

Confirm:

```bash
pnpm --version   # expect 10.13.1
```

## Setup

```bash
git clone https://github.com/yinc-studio/gym-master-mcp.git
cd gym-master-mcp
pnpm install --frozen-lockfile
cp .env.example .env
```

Edit `.env` (never commit it):

```
GYMMASTER_CLUB=yourclub          # subdomain only → https://yourclub.gymmasteronline.com
GYMMASTER_API_KEY=your_api_key
```

| Variable | Required | Meaning |
|---|---|---|
| `GYMMASTER_CLUB` | yes | Club subdomain only (not a full URL) |
| `GYMMASTER_API_KEY` | yes | Reporting API key sent as `X-GM-API-KEY` |

## Build

Compiled output goes to `dist/` (gitignored). Build before registering the MCP server with Claude Desktop:

```bash
pnpm build
```

Entry point: `dist/mcp/index.js` (also available as `pnpm mcp` after build).

## Smoke test

Validates credentials with one read-only call (`GET /api/v2/report/kpi/categories/list`):

```bash
pnpm smoke gymmaster
```

`pnpm smoke` with no arguments lists probes and required env vars. Category counts vary by club — treat a `PASS` as connectivity/auth success, not a fixed inventory size.

### Failure modes

| Situation | What you'll see | Exit code |
|---|---|---|
| Missing env | `FAIL: gymmaster` + missing `GYMMASTER_CLUB` / `GYMMASTER_API_KEY` | 1 |
| Wrong club subdomain | Network / unreachable host detail | 1 |
| Bad or revoked API key | Auth failure (`401` / `403`) | 1 |
| Timeout | Timed out waiting for the request | 1 |
| Unexpected response | API / schema classification detail | 1 |

## Tests & typecheck

No live network in the default suite (fetch is mocked):

```bash
pnpm test
pnpm typecheck
```

## Claude Desktop

1. Build (`pnpm build`) so `dist/mcp/index.js` exists.
2. Open Claude Desktop → **Settings → Developer → Edit Config** (opens `claude_desktop_config.json`).
3. Add a server block with an **absolute** path to the compiled entry. Use a **placeholder** for the API key (do not put a real key in chat or commit history):

```json
{
  "mcpServers": {
    "gymmaster-reporting": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/gym-master-mcp/dist/mcp/index.js"],
      "env": {
        "GYMMASTER_CLUB": "yourclub",
        "GYMMASTER_API_KEY": "PASTE_KEY_HERE"
      }
    }
  }
}
```

4. In the open config file, replace `PASTE_KEY_HERE` with the real Reporting API key (and set the club subdomain). Save the file.
5. Fully quit and relaunch Claude Desktop so it reloads MCP servers.
6. Confirm tools such as `list_kpi_fields`, `get_kpis_by_fields`, and `count_memberships` appear.

### Agent-assisted install (required secret handling)

When an agent installs or configures this MCP for a user:

1. **Do not ask the user to paste the API key into the chat.** Never request, accept, or echo the key in the conversation.
2. The agent **writes/merges** the `gymmaster-reporting` block into `claude_desktop_config.json` itself (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`), including `command`, absolute `args` to `dist/mcp/index.js`, and `GYMMASTER_CLUB` when known.
3. For `GYMMASTER_API_KEY`, the agent leaves a clear placeholder such as `PASTE_KEY_HERE`, **opens the config file** in the editor, and tells the user to paste the real value into that field in the file and save.
4. Same rule for a local `.env`: agent may create `.env` from `.env.example` with `GYMMASTER_API_KEY=` blank or `PASTE_KEY_HERE`, open the file, and ask the user to paste there — not in chat.
5. Then tell the user to fully quit and relaunch Claude Desktop and how to verify tools appear.

Pasteable prompt for the user to give an agent:

> Install https://github.com/yinc-studio/gym-master-mcp for Claude Desktop on this machine. Follow the README. Ensure Node 22+ and pnpm 10.13.1, then `pnpm install --frozen-lockfile`, `pnpm build`, and `pnpm smoke gymmaster` once a key is in `.env`. Merge `gymmaster-reporting` into `~/Library/Application Support/Claude/claude_desktop_config.json` with `node` and an absolute path to `dist/mcp/index.js`. **Do not ask me to paste the API key in chat.** Open the config (and `.env` if needed), leave `PASTE_KEY_HERE` / blank for the key, and tell me to paste the key into the open file and save. Then tell me to fully restart Claude Desktop and how to verify the tools.

### Dev alternative

For local iteration without rebuilding:

```bash
# from the repo root, with .env loaded by your shell or the client env block
pnpm exec tsx src/mcp/index.ts
```

Prefer `node` + absolute `dist/mcp/index.js` for day-to-day Desktop use.

## Operator skill

Generic agent guidance (setup pointer, visiting vs current, discovery, fail-closed behavior) lives in [`skills/gymmaster-reporting/SKILL.md`](skills/gymmaster-reporting/SKILL.md).

## MCP tools (overview)

| Tool | Purpose |
|---|---|
| `list_kpi_categories` | List KPI category names |
| `list_kpi_fields` | List available KPI field names |
| `get_kpis_by_fields` | Fetch selected KPI fields for an explicit date range |
| `list_standard_reports` | List standard reports (id, name, category) |
| `run_standard_report` | Run a report by id for an explicit date range |
| `count_memberships` | Distinct membership counts / optional caller-supplied buckets |

All dates are ISO `YYYY-MM-DD`. Successful results include provenance (endpoint, request summary, report/field metadata when applicable). Errors are structured — the server does not invent numbers.

## Troubleshooting

| Problem | What to check |
|---|---|
| `pnpm: command not found` | Install pinned pnpm (Corepack or `npm install -g pnpm@10.13.1`), then `pnpm --version` |
| Lockfile / install mismatch | Use `pnpm install --frozen-lockfile` with pnpm **10.13.1** |
| Smoke fails on auth | Confirm `GYMMASTER_API_KEY`; key is never logged |
| Smoke fails on network | Confirm `GYMMASTER_CLUB` is the subdomain only (e.g. `yourclub`, not a URL) |
| Claude shows no tools | Rebuild (`pnpm build`); args path must be absolute and point at `dist/mcp/index.js`; fully restart Desktop |
| Server exits immediately | Run `node /ABSOLUTE/PATH/TO/dist/mcp/index.js` in a terminal with the same env to see stderr |
| Wrong Node version | Need Node 22+ (`node --version`) |

## License

MIT — see [LICENSE](LICENSE).
