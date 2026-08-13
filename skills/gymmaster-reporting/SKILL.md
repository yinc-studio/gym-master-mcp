---
name: gymmaster-reporting
description: Operate the gym-master-mcp stdio server — setup, date ranges, live field/report discovery, membership counts, provenance, and fail-closed reporting for any GymMaster club.
---

# GymMaster reporting (generic operator skill)

Use this skill with the open-source **gym-master-mcp** server. It is gym-agnostic: do not assume a particular club’s membership types, scoreboard buckets, or spreadsheet layout. Club-specific mappings belong in a separate skill owned by that operator.

## Setup

Follow the repository [README](../../README.md):

1. Node 22+ and pinned pnpm `10.13.1`
2. `pnpm install --frozen-lockfile`
3. `.env` with `GYMMASTER_CLUB` (subdomain only) and `GYMMASTER_API_KEY`
4. `pnpm build` → register `node` + absolute `dist/mcp/index.js` in the MCP client
5. Optional connectivity check: `pnpm smoke gymmaster`

### Secrets (binding)

- **Never** ask the user to paste an API key (or full `.env`) into the chat.
- **Never** request, accept, or echo the key in the conversation.
- When configuring Claude Desktop or `.env`: write/merge the config yourself; set `GYMMASTER_API_KEY` to a placeholder such as `PASTE_KEY_HERE` (or leave blank); **open the file** in the editor; tell the user to paste the real value into that field in the open file and save.
- If credentials are missing or wrong, name the variable / file path to fix — do not collect the secret via chat.

## Visiting vs current

These are different concepts; do not substitute one for the other.

| Concept | Meaning |
|---|---|
| **Current (roster)** | People with an active / current membership on the roster for the period semantics of the chosen report. Use `count_memberships` (and its provenance) for roster totals and per-type breakdowns. |
| **Visiting** | People who actually went to the gym (successful check-ins) during the requested range. Resolve only from a live KPI field or report whose tooltip/definition matches that meaning. |

Attendance-style ratios (visiting ÷ current) are operator math after both numbers are obtained from verified sources — never invent either side.

## Date ranges

- Every dated tool requires explicit `start_date` and `end_date` as real calendar dates in ISO `YYYY-MM-DD`.
- Reject or correct invalid dates and ranges where `start_date > end_date` before calling tools.
- The MCP server does **not** infer weeks, scoreboard columns, or “last week.” If a workflow uses a week label, convert it to an inclusive ISO range in the skill/operator layer, then pass those dates into the tools.

## Discover before you select sources

Catalog docs in the repo (if present) are **hints only**. Live GymMaster inventories differ by club and change over time.

**Before** calling `get_kpis_by_fields` or treating a report as the visiting / new / lost / roster source:

1. Call `list_kpi_categories` / `list_kpi_fields` and/or `list_standard_reports`.
2. Read returned names, and for KPI pulls use returned **tooltips** and **provenance** as the source of metric semantics.
3. Only then pass confirmed field names or `report_id` values into `get_kpis_by_fields`, `run_standard_report`, or `count_memberships`.

Do not present unverified names from static catalogs as authoritative. Example field names that are **commonly present after discovery** on some clubs (verify live before use): `new_memberships`, `current_members`, cancellation-related fields. Treat each as unconfirmed until `list_kpi_fields` / a successful pull with tooltip/provenance says otherwise. Never assume a fixed visiting-member field name.

## Tool usage patterns

| Goal | Pattern |
|---|---|
| See available KPI inventory | `list_kpi_categories` → `list_kpi_fields` |
| Pull specific KPIs for a range | Discover fields → `get_kpis_by_fields` with `start_date`, `end_date`, `fields` |
| Find reports | `list_standard_reports` (optionally `predefined_only`) |
| Raw report rows | `run_standard_report` with a caller-chosen `report_id` from the list |
| Roster total / per-type / buckets | `count_memberships` with the same explicit dates |

`count_memberships` discovers the current-membership report from the live standard-report list unless you pass a `report_id` returned by `list_standard_reports`. Do not invent report IDs.

### Empty-bucket type discovery

To learn which membership type strings exist on the live roster for a period:

1. Call `count_memberships` with `start_date` / `end_date` and **omit** `buckets` (or pass an empty list).
2. Use `per_type` (and `unmatched` when buckets are later supplied) as the discovery surface.
3. Build any named buckets from those exact live strings. Unknown types must not silently enter a bucket — they appear under `unmatched`. Overlapping bucket assignments fail closed as invalid input.

## Provenance and tooltips

Prefer the tool’s returned **provenance** and KPI **tooltips** over memory or static docs when explaining what a number means. Provenance typically includes endpoint, method, request summary, and when applicable report id/name, source fields, and cache indicators. Do not include secrets or member-row PII in summaries you write back to the user.

## Fail-closed behavior

- If auth, network, timeout, API, invalid input, or unsupported-contract errors occur: report the structured failure. **Do not invent, estimate, or backfill numbers.**
- If visiting / new / lost (or any other intent) cannot be tied to a verified live field or report definition, say so and stop — do not silently substitute a different GymMaster metric.
- If `count_memberships` cannot uniquely resolve a current-membership report, treat that as unsupported until the operator supplies a valid `report_id` from `list_standard_reports`.
- Never normalize, wildcard-expand, or guess membership type names.

## What not to hard-code

Do not bake into prompts, defaults, or this skill:

- A specific gym brand, club subdomain, or sheet ID
- Fixed membership-type lists or scoreboard bucket vocabularies for a particular operator
- Assumed report IDs or assumed visiting/lost field names without live discovery

Those belong only in a separate, club-owned skill after confirmation against live tool output.
