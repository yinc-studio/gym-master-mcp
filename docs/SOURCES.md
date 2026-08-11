# Documentation sources

## GymMaster Reporting API v2 (KPI, Reporting and Dashboard API)

- **Source URL:** https://www.gymmaster.com/gymmaster-reporting-api/
- **Retrieved:** 2026-08-11
- **Extraction method:** `curl -sL` of the raw page HTML. The page renders a
  [Scalar](https://github.com/scalar/scalar) API reference client
  (`/js/scalar/api-reference.min.js`) client-side, but the full OpenAPI 3.1.0
  document is embedded server-side as an escaped JSON string in the
  `content` field of the `Scalar.createApiReference('#app', {...})` call in
  the page's inline `<script>` tag — no separate network fetch is needed to
  get the spec.
- **Saved to:** `docs/gymmaster-reporting-api.openapi.json` (pretty-printed,
  unescaped from the inline string, otherwise byte-identical in content).
- **Spec version (`info.version`):** `v1600`
- **`info.title`:** "GymMaster: KPI, Reporting and Dashboard API V2"
- **Important caveat:** The spec documents 8 endpoints across 3 tags (KPI,
  Report, Dashboard), but it does **not** enumerate the full, authoritative
  list of KPI categories, KPI fields, or standard report names/IDs anywhere
  in its schema. The `kpi/categories/list`, `kpi/fields/list`, and
  `standard_report/list` endpoints each only carry a short illustrative
  `example` array/object in their 200 response — e.g. the fields-list example
  shows 13 field names and the categories-list example shows 7 category
  names, but nothing in the spec asserts these are exhaustive. The true,
  complete list of available KPI categories/fields and standard reports is
  only obtainable by calling those three `GET .../list` endpoints live
  against a real GymMaster client instance (requires an API key, which does
  not exist yet per the task context). Treat the examples in
  `report-catalog.md` as a documented-but-partial sample, not a confirmed
  complete catalog.

## GymMaster Member Portal API

- **Source URL:** https://www.gymmaster.com/gymmaster-api/
- **Retrieved:** 2026-08-11
- **Extraction method:** `curl -sL` of the raw page HTML.
- **Result: no embeddable OpenAPI/Swagger JSON or YAML spec exists in or
  near this page.** Unlike the Reporting API page, this page is fully
  static, pre-rendered HTML (a build-time ReDoc-style export with zero
  `<script>` tags and no JS bundle) — the operation details are baked
  directly into HTML markup (tables, headings, `<pre>` code samples) rather
  than into a JSON payload anywhere in the DOM or in a linked file. Probed
  common spec paths on the domain (`/openapi.json`, `/swagger.json`,
  `/gymmaster-api/openapi.json`, `/gymmaster-api.json`, etc.) — all 404
  (one, `/gymmaster-api.json`, redirects/300s to the docs page itself, not a
  spec file).
- **No `docs/gymmaster-member-portal-api.openapi.json` was created** — there
  is no machine-readable spec to save. Per task priority (secondary,
  "skip gracefully if not extractable"), this was skipped as a JSON
  artifact.
- As a partial substitute, the endpoint inventory (path + method + one-line
  summary) was scraped from the page's own operations-summary HTML table
  and is recorded in `report-catalog.md` — 53 endpoints across `/portal/api/v1/*`
  and `/portal/api/v2/*`. This is a human-readable list only; it carries no
  parameter/schema detail (that would require scraping and reconstructing
  each of the 53 individual operation sections, which was judged out of
  scope for a secondary-priority, non-KPI API not directly needed for the
  weekly-KPI MCP server).
