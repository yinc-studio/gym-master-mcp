# gym-master-mcp

Local MCP (Model Context Protocol) server that pulls KPI data from the
GymMaster Reporting API v2, for the Performance Gaines gym client. The MCP
server itself comes next; this repo currently ships the first deliverable —
a key-agnostic API smoke-test harness that validates a service credential
within seconds of arriving, before any MCP tooling is built on top of it.

The harness is a small registry of **probes**. Each probe knows how to make
one minimal authenticated call against a service and classify the result
(pass / bad key / unreachable host / malformed response). GymMaster is the
first probe; a Paycor probe will be added the same way later (see
`.env.example` for the placeholder pattern).

## Requirements

- Node >=22
- pnpm 10.x (`packageManager` is pinned in `package.json`)

## Setup

```bash
pnpm install
cp .env.example .env
```

Fill in `.env`:

```
GYMMASTER_CLUB=performancegaines   # the club subdomain, e.g. https://performancegaines.gymmasteronline.com
GYMMASTER_API_KEY=<the key, once the client provides it>
```

## Running the smoke test

The moment the GymMaster API key arrives, run:

```bash
pnpm smoke gymmaster
```

Running `pnpm smoke` with no arguments lists all available probes and their
required environment variables — useful for checking the harness works
before a key exists.

### Expected pass output

```
Running gymmaster probe...
PASS: gymmaster
HTTP 200 from https://performancegaines.gymmasteronline.com/api/v2/report/kpi/categories/list. Received 12 categories.
```

Exit code `0`.

### Failure modes

| Situation | What you'll see | Exit code |
|---|---|---|
| `.env` not set up / vars missing | `FAIL: gymmaster` + `Missing required environment variable(s): GYMMASTER_CLUB, GYMMASTER_API_KEY` naming exactly which var(s) are absent | 1 |
| Wrong club subdomain (DNS/unreachable) | `FAIL: gymmaster` + `Network error reaching https://.../...: ...` pointing at `GYMMASTER_CLUB` | 1 |
| Bad or revoked API key | `FAIL: gymmaster` + `Authentication failed (HTTP 401/403)` pointing at `GYMMASTER_API_KEY` | 1 |
| Request hangs | `FAIL: gymmaster` + `Timed out after 10000ms waiting for ...` (single attempt, no retries) | 1 |
| Unexpected status or non-JSON body | `FAIL: gymmaster` + the HTTP status and a body excerpt | 1 |

The probe makes exactly one HTTP call (`GET
/api/v2/report/kpi/categories/list` with header `X-GM-API-KEY`) with a
~10-second timeout — no retries, so it won't hammer the API while rate
limits are still unknown.

## Development

```bash
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest, no live network calls — fetch is mocked
```

## Layout

```
src/smoke/
  types.ts       Probe / ProbeResult interfaces
  gymmaster.ts    GymMaster Reporting API v2 probe
  index.ts        Probe registry (service name -> Probe)
  cli.ts          `pnpm smoke [service]` entry point
  gymmaster.test.ts  Unit tests for outcome classification (mocked fetch)
```
