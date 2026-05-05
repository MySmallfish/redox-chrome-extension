# AGENTS.md ג€” Redox Property Tracker (Chrome Extension)

This repository builds a Chrome Extension (Manifest V3) for Israeli real-estate agents:
- Detect a property listing on the current page (MVP: Yad2 + Madlan).
- Show a preview and ג€Trackג€ it in Redox by sending a payload that matches the Redox property JSON schema.
- Handle login, token expiration, logout.
- Show tracked properties from the API with links to source page and Redox page.

This file is written for **Codex CLI** and other coding agents. Follow it as the source of truth.

---

## 0) Prime directive

**Quality over speed. Tests are mandatory.**
- Never ship code that isnג€™t covered by unit tests for core logic + at least one end-to-end test for the main ג€Track propertyג€ flow.
- If you change behavior, update tests and fixtures in the same PR.

---

## 1) Product scope (MVP)

### Must-have MVP features
1. **Authentication**
   - Login screen in popup.
   - Store access token in browser storage.
   - Handle expiration and server 401/403 by forcing logout.
2. **Current page detection**
   - When popup opens, ask the content script to detect if the active tab is a listing.
   - If detected, render a preview card.
3. **Already tracked check**
   - Call API to check if property is already tracked.
   - Render ג€trackedג€ state + show returned ג€signalsג€.
4. **Track**
   - On click, send payload shaped exactly like the Redox schema template (see Data contract).
5. **Tracked list**
   - Fetch list of tracked properties.
   - Each item has link to source URL + link to Redox page.
6. **Internationalization**
   - Multi-language UI.
   - Default language: **Hebrew** and **RTL**.
7. **State management**
   - Use **XState** for state orchestration.
8. **UI tech constraint**
   - Use simple **HTML/CSS/JS** (no React/Vue/Angular).
   - Implement a minimal custom templating engine that replaces `{{...}}`.

### Explicit non-goals for MVP
- No background polling/auto-sync.
- No complex CRM workflows.
- No scraping behind authentication walls that require bypassing protections.
- No brittle ג€screen-scrapingג€ if structured data is available (prefer JSON-LD / embedded state).

---

## 2) Data contract (Redox payload)

**The payload MUST match the schema in the provided `sample.json` template.**
- Treat the sample JSON as canonical structure for keys & nested objects.
- Do not rename keys, remove keys, or change types without coordinating with the Redox API team.
- The extension should map from a ג€normalized listing modelג€ ג†’ ג€Redox schema payloadג€ using a template merge.

Implementation rule:
- Keep a local JSON template file (derived from `sample.json`) under:
  - `src/shared/schema/redoxPropertyTemplate.json`
- `mapToRedox(normalized, meta)` deep-clones that template and fills only fields we can confidently populate.
- Unknown/unavailable fields remain at template defaults (`null`, `false`, `0`, or empty strings) instead of inventing data.

Also:
- Always include stable tracking metadata:
  - `ReferenceId` = `<siteId>:<externalListingId>`
  - `canonicalUrl` stored in our own metadata (or in a safe field if API supports it)

---

## 3) Architecture & responsibilities

### Components (MV3)
- **Popup UI** (action popup)
  - Owns the XState machine.
  - Calls content script via messaging.
  - Calls Redox API via `fetch`.
  - Renders views using template engine + i18n.
- **Content script**
  - Runs on supported sites.
  - Detects listing + extracts data using site adapters.
  - Returns `{ detected, siteId, canonicalUrl, externalId, normalized, warnings }`.
- **Adapter registry**
  - Pluggable adapters per site (Yad2, Madlan).
  - Each adapter encapsulates selectors/logic and has tests with saved HTML fixtures.
- **Shared core**
  - `normalizedModel` definition.
  - Mapping to Redox payload.
  - Token storage utilities, API client, URL canonicalizer, i18n utilities, template engine.

### Suggested repo structure
- `src/`
  - `popup/`
    - `popup.html`
    - `popup.css`
    - `popup.js`
    - `templates/` (optional: inline templates in HTML is OK)
  - `content/`
    - `contentScript.js`
  - `adapters/`
    - `registry.js`
    - `yad2.js`
    - `madlan.js`
  - `shared/`
    - `apiClient.js`
    - `authStore.js`
    - `url.js`
    - `i18n.js`
    - `templateEngine.js`
    - `normalizedModel.js`
    - `redoxMapper.js`
    - `schema/redoxPropertyTemplate.json`
- `tests/`
  - `unit/`
  - `e2e/`
  - `fixtures/`
    - `yad2_item.html`
    - `madlan_listing.html`

---

## 4) Tech stack (constraints)

### Hard constraints (do not violate)
- Use **XState** for state management and side effects.
- UI: **plain HTML/CSS/JS**
- Templating: implement simple `{{path.to.value}}` replacement.
- i18n: dictionaries (`he`, `en`) with RTL handling.
- Tests are mandatory and run in CI.

### Allowed tools (recommended)
- Bundler: Vite or esbuild (needed to ship dependencies like XState).
- Unit tests: Vitest (or Jest).
- E2E tests: Playwright (Chromium).
- Lint/format: ESLint + Prettier.

---

## 5) Commands (Codex should keep these working)

> If these scripts donג€™t exist yet, create them and keep them green.

- Install: `pnpm install`
- Dev build (watch to `dist/`): `pnpm dev`
- Production build (to `dist/`): `pnpm build`
- Unit tests: `pnpm test`
- E2E tests: `pnpm test:e2e`
- Lint: `pnpm lint`
- Format: `pnpm format`

Manual testing steps:
1. `pnpm dev`
2. In Chrome: `chrome://extensions` ג†’ Developer mode ג†’ Load unpacked ג†’ select `dist/`
3. Navigate to a Yad2/Madlan property page
4. Open the extension popup ג†’ verify detection, preview, track flow.

---

## 6) XState rules (non-negotiable)

- All async work must be modeled as invoked services (API calls, detection messages).
- Do not put API calls directly in render functions.
- State machine must cover:
  - unauthenticated ג†’ authenticating ג†’ authenticated
  - currentPage: detecting ג†’ notDetected | detected ג†’ checkingTracked ג†’ tracked | notTracked ג†’ tracking
  - trackedList: loading ג†’ loaded | failed
- Token expiry behavior:
  - If token expired locally OR API returns 401/403: transition to unauthenticated and clear storage.

Testing:
- Write transition tests for the machine.
- Assert context updates and state changes for key flows.

---

## 7) Templating rules (custom {{ }} templates)

Implement a minimal engine:
- Replaces `{{key}}` and `{{nested.key}}`
- Escapes HTML by default (XSS safety).
- Missing keys render as empty string.
- No complex logic in templates (no loops/conditionals); do logic in JS and pass a view-model.

Unit tests:
- Replacement
- Nested paths
- HTML escaping
- Missing keys

---

## 8) i18n + RTL rules

- Default language: `he`.
- When language is Hebrew:
  - set `document.documentElement.lang = "he"`
  - set `document.documentElement.dir = "rtl"`
- Keep translation keys stable: `login.title`, `current.detecting`, `errors.unauthorized`, etc.
- Avoid hard-coded UI strings; always go through i18n.

Unit tests:
- translator returns fallback string when key missing
- dir/language toggles correctly

---

## 9) Adapter system rules (flexible/extensible)

Adapter interface:
- `siteId: string`
- `matchesUrl(url): boolean`
- `detect(doc, url): boolean`
- `extract(doc, url): NormalizedListing`
- `getExternalId(url, doc): string`
- `canonicalizeUrl(url): string`

Extraction priority order (reliability):
1. JSON-LD (`script[type="application/ld+json"]`)
2. Embedded state blobs (e.g., `__NEXT_DATA__`)
3. DOM selectors with labeled fields

Each adapter must ship with:
- One or more HTML fixtures in `tests/fixtures/`
- Unit tests that:
  - confirm detection
  - confirm extraction of at least: address/title, city, price, rooms, area if available
  - confirm externalId + canonicalUrl stability

When extraction fails:
- Return `warnings` and partial data. Never crash the popup.

---

## 10) Authentication & storage rules

Token storage:
- Store access token + expiry + minimal user summary.
- Prefer `chrome.storage.local` for extension-wide access.
- If product requires `localStorage`, restrict it to the popup context and keep all API calls in popup.

Expiration:
- If token has an expiry timestamp (or JWT exp), check it before API calls.
- If expired: clear storage and logout.

Security:
- Never log tokens.
- Never include token in URL query params.

---

## 11) API client rules

- Centralize API calls in `src/shared/apiClient.js`.
- All API calls must:
  - include Authorization header
  - handle 401/403 consistently (force logout)
  - return typed-ish results (validate shape minimally)
- Provide a single config for API base URL:
  - build-time env var OR options page configuration
- For tests:
  - mock fetch in unit tests
  - mock API in E2E via local test server or Playwright route interception

---

## 12) Permissions & privacy (Chrome extension best practices)

- Keep `permissions` minimal.
- Use `host_permissions` only for Yad2/Madlan + Redox API domain.
- Do not scrape unrelated pages.
- Do not store raw page HTML.
- Avoid collecting PII unless required for the Redox payload; if collected, store only what you must.

---

## 13) Testing requirements (mandatory)

### Unit tests (minimum)
- template engine
- URL canonicalizer + externalId generation
- normalized ג†’ Redox mapping (ensures schema keys exist)
- adapters (fixtures)
- XState machine transitions

### E2E tests (minimum)
- Load extension in Chromium.
- Navigate to a fixture-backed page or a locally hosted snapshot.
- Verify:
  - popup shows ג€detectedג€
  - clicking ג€Trackג€ issues correct API request payload
  - token-expired path logs user out

CI gate:
- PR fails if unit tests fail or if e2e fails.

---

## 14) Release / packaging rules

- `dist/` is the only folder that gets loaded as unpacked extension and zipped for release.
- Ensure `manifest.json` is MV3 and all paths resolve from dist.
- Add a `VERSION` bump script or keep manifest version in sync.

---

## 15) MCP servers (maximize Codex capability)

Codex can connect to MCP servers via:
- `codex mcp add ...` or
- `~/.codex/config.toml` or repo-scoped `.codex/config.toml` (trusted projects)

Recommended MCPs for this project:

### A) Documentation superpowers
1) **OpenAI Docs MCP** (Codex/MCP reference)
- Streamable HTTP server:
  - `https://developers.openai.com/mcp`

2) **Context7** (up-to-date library docs)
- Great for: XState, Playwright usage patterns, modern JS APIs.

### B) Browser automation & DOM inspection (critical for adapters)
3) **Playwright MCP**
- Use to:
  - open Yad2/Madlan pages
  - query selectors
  - snapshot HTML
  - validate extraction strategies

4) **Chrome DevTools MCP**
- Use to:
  - inspect console errors
  - capture performance traces if needed
  - debug tricky DOM/SPA rendering

### C) Security & quality (optional but recommended)
5) **Snyk MCP** (or equivalent)
- Use to detect vulnerable packages and common security issues.

#### Example: config.toml snippet

> Prefer pinning versions and using trusted MCP servers only.

```toml
# ~/.codex/config.toml (or project: .codex/config.toml)

[mcp_servers.openai_docs]
url = "https://developers.openai.com/mcp"

[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp"]

[mcp_servers.chrome_devtools]
command = "npx"
args = ["-y", "chrome-devtools-mcp@latest"]
startup_timeout_sec = 20
tool_timeout_sec = 60


