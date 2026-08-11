# GymMaster Reporting API v2 — report / data catalog

Source: `docs/gymmaster-reporting-api.openapi.json` (OpenAPI 3.1.0, `info.version: v1600`).
Full provenance and caveats: `docs/SOURCES.md`.

No API key exists yet for this client, so nothing below has been called
live — everything is transcribed from the published spec. Where the spec
only gives an illustrative `example` rather than an exhaustive enum (KPI
categories, KPI fields, standard report names), that is called out.

## 1. Endpoints (8 total, 3 tags)

| Method | Path | Summary | Auth |
|---|---|---|---|
| GET | `/api/v2/report/kpi/categories/list` | KPI Categories List — all available categories used to group KPI fields | `X-GM-API-KEY` header |
| POST | `/api/v2/report/kpi/categories` | KPI – Filter By Category — pull KPI values for one or more categories, for a date range, grouped or ungrouped | same |
| GET | `/api/v2/report/kpi/fields/list` | KPI Fields List — all available individual KPI field names | same |
| POST | `/api/v2/report/kpi/fields` | KPI – Filter By Fields — pull specific named KPI fields for a date range | same |
| GET | `/api/v2/report/standard_report/list` | Available Reports — list of all standard report names + IDs (+ optional `predefined_only` query param, default true) | same |
| POST | `/api/v2/report/standard_report` | Run Report — equivalent of Report & Till → Standard Report; takes `report_id`, `start_date`, `end_date`, optional `displaymode` (`CURRENT`/`ALL`/`HIDDEN`) and `required_columns` | same |
| GET | `/api/v2/dashboard/list` | Dashboard List — all dashboard widget endpoint names (type `kpi`/`doughnut`/`graph`) | same |
| GET | `/api/v2/dashboard` | Run Dashboard Endpoint — run one dashboard widget by `endpoint` name, optionally overriding `start_date`/`end_date` | same |

All 8 endpoints require the `report` security scheme: header `X-GM-API-KEY`
(found in the GymMaster admin under Settings → Integrations → Report API →
API Key). Base URL is templated: `https://{client_name}.gymmasteronline.com`.

## 2. KPI categories (from spec's documented example — not asserted exhaustive)

| Category | Notes |
|---|---|
| `member_statistics` | Member counts, demographics, hold status |
| `member_activity` | Member-level activity (visits, retention) |
| `membership_activity` | Membership lifecycle (new/renewed/expiring/cancelled) |
| `sales_made` | Revenue / sales totals |
| `payment_method` | Sales broken out by payment method |
| `booking_summary` | Booking counts |
| `class_summary` | Class attendance |

Call `GET /api/v2/report/kpi/categories/list` live once a key exists to
confirm this is the complete set — the spec presents it as an example, not
a closed enum.

## 3. KPI fields (from spec's documented example — not asserted exhaustive)

| Field | Likely category | Description (from spec's worked example, where shown) |
|---|---|---|
| `current_members` | member_statistics | "Includes anyone who has been a current member in this period. Some may have expired or were cancelled, but were current at one stage during the period." |
| `female_members` | member_statistics | Count of female members |
| `male_members` | member_statistics | Count of male members |
| `average_age` | member_statistics | Average member age |
| `hold_members_gifted` | member_statistics | Members on hold, gifted hold time |
| `hold_members_not_gifted` | member_statistics | Members on hold, non-gifted hold time |
| `avg_holdtime` | member_statistics | Average hold duration |
| `avg_member_time` | member_statistics | Average member tenure |
| `new_memberships` | membership_activity | "Memberships Sold in the specified time period" |
| `renewed_memberships` | membership_activity | Memberships renewed in period |
| `expiring_memberships` | membership_activity | Memberships expiring in period |
| `cancellations_period_by_reason` | membership_activity | Cancellations in period, broken out by reason |
| `membership_retention` | membership_activity | Retention rate |

Every KPI field (and category) resolves to a `KPIRow` object:
`{name, id, metric, quantity, taxvalue, tooltip, value, formatted_value}`.

Call `GET /api/v2/report/kpi/fields/list` live to get the true complete
field list — the spec's `sales_made` and `class_summary` categories are
known (from the `kpi/categories` example payload) to include at least a
`money` field ("Total Sales") and an `attendees` field ("Total class
attendants") respectively, which are *not* in the `fields/list` example
above, confirming that example is a partial sample, not the full set.

## 4. Standard reports (`standard_report/list` / `standard_report`)

The spec does **not** enumerate the actual report catalog — `GET
/api/v2/report/standard_report/list` returns it dynamically as
`{id, name, category}` objects. The spec's only worked example shows 2 of
what is presumably a much longer list:

| id | name | category |
|---|---|---|
| 1 | Current Members | Member |
| 9 | All Bookings | Booking |

To run a report: `POST /api/v2/report/standard_report` with `report_id`,
`start_date`, `end_date`, optional `displaymode` (`CURRENT` / `ALL` /
`HIDDEN` — controls whether casual/hidden memberships are included) and
optional `required_columns` (explicit column names to include, e.g.
`["Member ID", "Member Name"]`). Results are cached up to ~6 hours
(`cached_result` flag in the response).

**Action item:** once an API key exists, call `standard_report/list` with
`predefined_only=true` to get the real report names/IDs/categories — this
is the only way to know, e.g., whether there's a dedicated "Cancelled
Memberships" or "Prospects" standard report, versus needing to derive those
numbers from KPI fields instead.

## 5. Dashboard endpoints

`GET /api/v2/dashboard/list` returns `{type, endpoint}` pairs (types:
`kpi`, `doughnut`, `graph`). Example entries: `kpi.member_new`,
`kpi.member_bookings`. `GET /api/v2/dashboard?endpoint=...` runs one,
computed as of "now" (or an overridden `start_date`/`end_date`) — these
are homepage-widget equivalents, not period-filterable reports, so less
useful for weekly KPI pulls than the KPI/standard_report endpoints.

## 6. Mapping to the target weekly KPI sheet metrics

| Sheet metric | Best current match | Confidence |
|---|---|---|
| Current memberships (by membership type filter) | `standard_report` "Current Members" (id 1, category Member, per example) run with `required_columns` including membership type, OR KPI field `current_members` for a headline count without type breakdown. Membership *type* list itself is available from the Member Portal API's `GET /portal/api/v1/memberships` (see §7). | Medium — report id/columns need live confirmation |
| Starting / new memberships | KPI field `new_memberships` ("Memberships Sold in the specified time period") | High |
| Lost members / cancellations in period | KPI field `cancellations_period_by_reason` (also `membership_retention` for a rate) | High |
| Current visiting members | Not directly named in the documented example; most likely lives in `member_activity` category (undocumented fields) or as a standard report — needs live `kpi/fields/list` / `kpi/categories/list` call to confirm the exact field name | Low — needs live lookup |
| Prospects entered in period | No KPI field or standard report is named for this in the spec's examples. The Member Portal API has `POST /portal/api/v1/prospect/create` (creates a prospect) but that's a write endpoint, not a report. Likely lives under an undocumented `member_activity`/`member_statistics` KPI field, or a dedicated standard report category — needs live lookup | Low — needs live lookup |
| Members on hold | KPI fields `hold_members_gifted` + `hold_members_not_gifted` (sum for total on hold), plus `avg_holdtime` | High |
| All sales | KPI category `sales_made` (fields include at least `money`, "Total Sales"), also `payment_method` category to break sales out by tender type | High |
| Attendance / visits | KPI categories `class_summary` (field `attendees`, "Total class attendants") and `booking_summary`; also per-member visit endpoints in the Member Portal API (`GET /portal/api/v2/member/visits/daily`, `GET /portal/api/v1/member/visits/monthly`) but those are per-member, not aggregate | Medium |
| Revenue | Same as "all sales" — `sales_made` category, `money` metric, `formatted_value` gives a pre-formatted currency string | High |

**Bottom line:** 6 of the 9 target metrics map cleanly onto documented KPI
fields/categories. "Current visiting members" and "prospects entered in
period" are not named anywhere in the spec's examples and need a live call
to `kpi/categories/list` + `kpi/fields/list` (or `standard_report/list`) to
find the right field/report once an API key is issued. "Current memberships
by type" is likely a `standard_report` job rather than a KPI field, since
KPI rows don't carry a membership-type dimension in their schema.

## 7. GymMaster Member Portal API (secondary — supporting reference only)

Source: `docs/SOURCES.md` §2. **No machine-readable spec exists for this
page** — it's static pre-rendered HTML with no embedded JSON and no linked
`.json`/`.yaml` file (confirmed by probing common spec paths, all 404). The
53 endpoints below were scraped from the page's own operations-summary
table (path, method, one-line summary only — no request/response schema
detail was extracted).

This API is member/booking/CRM-oriented, not reporting-oriented, but two
endpoints are relevant as *supporting* lookups for the KPI sheet (not KPI
data sources themselves):

- `GET /portal/api/v1/memberships` — "List available memberships" — likely
  the source of the membership-*type* list needed to filter the "current
  memberships by type" metric.
- `GET /portal/api/v1/memberships/cancel` — "Membership cancellation
  reasons" — the reason taxonomy behind `cancellations_period_by_reason`.

### v1 endpoints (27)

| Method | Path | Summary |
|---|---|---|
| GET | `/portal/api/v1/booking/classes/schedule` | List all classes at facility |
| GET | `/portal/api/v1/booking/classes/seats` | Available seats in a class |
| GET | `/portal/api/v1/booking/resources_and_sessions` | List available service booking times |
| POST | `/portal/api/v1/booking/servicebookings` | Book a service booking |
| GET | `/portal/api/v1/booking/servicebookings/equipment` | Available equipment resources |
| GET | `/portal/api/v1/booking/servicebookings/rooms` | Available room resources |
| GET | `/portal/api/v1/booking/services` | List available services |
| GET | `/portal/api/v1/companies` | List clubs |
| POST | `/portal/api/v1/email/feedback` | Send feedback to facility |
| POST | `/portal/api/v1/email/resetpassword` | Password recovery for a member |
| POST | `/portal/api/v1/email/sendemailtemplate` | Send email to member |
| POST | `/portal/api/v1/login` | Login as a member |
| GET | `/portal/api/v1/member/accounthistory` | List member's account history |
| POST | `/portal/api/v1/member/cancelbooking` | Cancel a member's booking |
| GET | `/portal/api/v1/member/membership/benefit/balances` | Member benefit balances |
| GET | `/portal/api/v1/member/memberships` | List member's memberships |
| GET | `/portal/api/v1/member/outstandingbalance` | List member's outstanding charges |
| GET | `/portal/api/v1/member/profile` | Get member's profile |
| GET | `/portal/api/v1/member/visits/monthly` | Member's monthly visits |
| GET | `/portal/api/v1/members` | List all current members |
| GET | `/portal/api/v1/memberships` | List available memberships |
| GET | `/portal/api/v1/memberships/cancel` | Membership cancellation reasons |
| POST | `/portal/api/v1/memberships/suspend` | Suspend a member's memberships |
| POST | `/portal/api/v1/prospect/create` | Create a prospect |
| GET | `/portal/api/v1/settings` | GymMaster settings |
| POST | `/portal/api/v1/signup` | Signup a new member with a membership |
| GET | `/portal/api/v1/version` | GymMaster version number |
| GET | `/portal/api/v1/workouts` | Member workouts |

### v2 endpoints (26)

| Method | Path | Summary |
|---|---|---|
| GET | `/portal/api/v2/booking/classes` | List available classes |
| GET | `/portal/api/v2/booking/classes/{bookingid}/attendees` | Show list of members attending class booking |
| POST | `/portal/api/v2/communication/file` | Upload a file |
| GET | `/portal/api/v2/contactmethods` | List contact methods |
| GET | `/portal/api/v2/email/member/communication/preference` | Retrieve a member's communication preferences |
| POST | `/portal/api/v2/member/assign_credit` | Pay for outstanding charges using available credit |
| POST | `/portal/api/v2/member/booking/rate` | Rate a booking |
| GET | `/portal/api/v2/member/bookings` | Member's upcoming bookings |
| POST | `/portal/api/v2/member/bookings/checkin` | Checkin a member's booking |
| POST | `/portal/api/v2/member/bookings/checkout` | Checkout a member's booking |
| GET | `/portal/api/v2/member/bookings/past` | Member's past bookings |
| GET | `/portal/api/v2/member/exists` | Check if a member exists |
| POST | `/portal/api/v2/member/kiosk/checkin` | Checks in a member |
| GET | `/portal/api/v2/member/measurements` | List member's measurements |
| POST | `/portal/api/v2/member/membership/{membershipid}/agreement` | Log a member's agreement |
| GET | `/portal/api/v2/member/membership/{membershipid}/contract` | Get a member's PDF contract |
| POST | `/portal/api/v2/member/signature` | Save a member's signature |
| GET | `/portal/api/v2/member/visits/daily` | Member's daily visits |
| GET | `/portal/api/v2/membership/{membershiptypeid}/agreement` | Show membership type agreement content |
| POST | `/portal/api/v2/payment/log` | Logging external payments |
| GET | `/portal/api/v2/products` | List available products |
| GET | `/portal/api/v2/promotions` | List available promotions |
| GET | `/portal/api/v2/questionnaires` | Get a list of questionnaires available online |
| GET | `/portal/api/v2/questionnaires/{questionnaireid}/answers` | Get a member's answers to a questionnaire |
| GET | `/portal/api/v2/staff/salesrep` | List sales reps |

## 8. Open items before building the MCP server

1. No API key exists yet (per task context) — none of the above has been
   called live. Everything is transcribed from the published spec/HTML.
2. Once a key exists, call `kpi/categories/list`, `kpi/fields/list`, and
   `standard_report/list` first and diff the real results against §2–§4
   above — the spec's examples are confirmed partial, not exhaustive.
3. Resolve "current visiting members" and "prospects entered in period"
   against the live field/report list (§6).
4. Confirm whether "current memberships by type" is better served by a
   `standard_report` run with `required_columns`, or by combining the
   `current_members` KPI field with the Member Portal API's
   `/portal/api/v1/memberships` type list.
