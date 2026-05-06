1) Product definition
What this extension does (MVP)

User logs in to Redox (via API).

User navigates to a property listing page on:

Yad2 (pattern like /realestate/item/<id>).

Madlan (pattern like /listings/<id> seen from list pages).

User opens the extension popup.

Extension detects if the current page is a property page.

If detected:

Shows a short property preview (address/title, city, rooms, price, area).

Calls API to check if already tracked.

If not tracked ג†’ user clicks Track ג†’ extension sends Redox Property JSON (shape taken from your sample).

If tracked ג†’ show ג€Already trackedג€ + API ג€signalsג€ + open links.

Extension also shows a Tracked Properties list returned by API:

Each item includes source URL (open listing page) and **Redox U

sample

n Redox).

Multi-language requirement

UI must be multi-language

Default: Hebrew, RTL.

2) UX / UI flows (popup-first MVP)
Popup layout (simple HTML/CSS)

The popup has two ג€tabsג€ (not browser tabs; a tiny segmented control):

A) Current Page

Header: logo + account status + logout

Content:

Not logged in ג†’ login form

Logged in + detecting ג†’ spinner ג€׳׳–׳”׳” ׳ ׳›׳¡ג€¦ג€

No property detected ג†’ ג€׳׳ ׳–׳•׳”׳” ׳ ׳›׳¡ ׳‘׳“׳£ ׳”׳–׳”ג€

Property detected ג†’ summary card + status + CTA

Property detected card (example fields)

Title: {{property.title}} (fallback: {{property.Address}})

Sub: {{property.City}}

Pills: rooms, area, floor

Price: formatted ג‚×

CTA area:

If not tracked: ג€׳׳¢׳§׳‘ג€ button

If tracked: ג€׳›׳‘׳¨ ׳‘׳׳¢׳§׳‘ג€ + actions:

ג€׳₪׳×׳— ׳‘ג€‘Redoxג€

ג€׳₪׳×׳— ׳׳§׳•׳¨ג€

B) Tracked

Title: ג€׳ ׳›׳¡׳™׳ ׳‘׳׳¢׳§׳‘ג€

List items:

First line: Address / title

Second: city + price + rooms (if available)

Actions:

ג€׳׳§׳•׳¨ג€ (open source URL)

ג€Redoxג€ (open Redox URL)

Empty / error states

API down: ג€׳׳™׳ ׳×׳§׳©׳•׳¨׳× ׳׳©׳¨׳×ג€

Token expired/401: auto logout + show login screen

Parse failed: ג€׳׳ ׳”׳¦׳׳—׳ ׳• ׳׳§׳¨׳•׳ ׳׳× ׳₪׳¨׳˜׳™ ׳”׳ ׳›׳¡. ׳׳₪׳©׳¨ ׳׳ ׳¡׳•׳× ׳׳¨׳¢׳ ׳.ג€

UX principles

Zero friction: one click to track after detection.

Trust: show preview before sending.

Fast: caching + minimal DOM scanning.

Hebrew-first: RTL by default.

3) Data contract & mapping strategy (based on attached JSON)

Your attached sample.json is an array containing a property object with many fields and nested objects (Seller, Type, etc.).

Practical approach for MVP (recommended)

Treat your file as the canonical ג€shape templateג€.

The extension fills the subset it can reliably extract:

Address, City

RequestedPrice

:contentReference[oaicite:6]{index=6}HomeArea(sqm),PlotArea` (if exists)

Description

PropertyTypeId (from a mapping table)

Feature flags if found (e.g., elevator/accessible/solar)

ReferenceId = external listing ID (e.g., yad2:oephsjkp or madlan:<id>)

Everything else stays default (null, 0, false) as in the template.

This guarantees you always send a payload that matches the structure the server expects, without ג€inventingג€ fields.

Key schema fields youג€™ll likely populate in MVP

From your sample:

PropertyTypeId (number)

Rooms (number)

Floor (string in sample, so store as string)

Address (string)

City (string)

RequestedPrice (number)

Optional ג€areasג€: HomeArea, GardenArea, `Balc

sample

(numbers or null)

Description (string)

Flags: Furnished, Accessible, SolarHeat, Basement, etc.

Metadata fields:

ReferenceId (string) ג€” use this for source listing id / canonical url hash

Links (array) ג€” only if your API actually uses it (not clear from sample)

Canonical URL and stable external ID

Yad2 detail pages use /realestate/item/<id>; you should store <id> and also canonicalize the URL by stripping query params.

Madlan detail pages use /listings/<id> (observed from list pages).

Recommendation:
externalId = "<siteId>:<pathId>"
canonicalUrl = origin + pathname
Use those for:

ג€already tracked?ג€ check

deduplication on server

4) Extension architecture (MVP, simple + testable)
Components

Popup UI (HTML/CSS/JS)

Owns the XState machine

Renders views via your simple {{ }} templating

Calls background/content via messaging

Calls Redox API via fetch

Content Script

Runs on supported host permissions (Yad2/Madlan)

Implements detectAndExtract() using site adapters

Returns normalized data to popup

Site Adapters (pluggable modules)

yad2Adapter

madlanAdapter

Future adapters can be added without touching core logic

Messaging flow

Popup ג†’ content: DETECT_PROPERTY

Content ג†’ popup: { detected: true/false, siteId, canonicalUrl, externalId, normalized }

Manifest (MV3)

action.default_popup: popup.html

permissions: activeTab, storage, tabs, scripting (only if needed)

host_permissions:

*://*.yad2.co.il/*

*://*.madlan.co.il/*

*://<your-redox-api-domain>/* (or allow configuring base URL in options)

content_scripts matches:

Yad2 + Madlan patterns

Note: MV3 service workers canג€™t rely on window.localStorage. If you truly mean ג€localStorageג€, store token in popup localStorage and keep API calls inside popup. If you want token accessible everywhere reliably, use chrome.storage.local (recommended).
For MVP, popup-centric orchestration is simplest and matches your ג€simple HTML/JS/CSSג€ requirement.

5) Adapter framework (flexible + extensible)
Adapter interface
// adapters/types.js
export class AdapterResult {
  /** @type {boolean} */
  detected;
  /** @type {string} */
  siteId;
  /** @type {string} */
  canonicalUrl;
  /** @type {string} */
  externalId;
  /** @type {object} Normalized listing data */
  data;
  /** @type {string[]} */
  warnings;
}

export const Adapter = {
  siteId: "yad2",
  matchesUrl: (url) => false,
  detect: (doc, url) => false,
  extract: (doc, url) => ({ /* normalized */ })
};

Normalized internal model (not the Redox schema)

Keep scraping logic isolated from Redox contract:

// shared/normalizedModel.js
export function emptyNormalized() {
  return {
    title: null,
    address: null,
    city: null,
    price: null,
    rooms: null,
    floor: null,
    totalFloors: null,
    areaSqm: null,
    description: null,
    features: {
      elevator: null,
      accessible: null,
      balcony: null,
      solarHeater: null
    },
    contact: {
      name: null,
      phone: null,
      email: null
    },
    images: []
  };
}

Yad2 adapter MVP detection signals

Yad2 property detail pages look like:

URL pattern /realestate/item/<id>

Has visible fields like price, rooms, floor, area, and ג€׳₪׳¨׳˜׳™׳ ׳ ׳•׳¡׳₪׳™׳ג€ / ג€׳׳” ׳™׳© ׳‘׳ ׳›׳¡ג€ sections.

So MVP detect() can be:

URL path starts with /realestate/item/

AND the page contains expected sections (by heading text or known containers)

Madlan adapter MVP detection signals

From Madlan list pages we see links to /listings/<id>.
Detection:

URL path starts with /listings/

Then extract using either:

JSON-LD if present

Or DOM selectors (needs inspection in dev)

Extraction strategy: layered, resilient

Each adapter should try in order:

Structured data: JSON-LD (script[type="application/ld+json"])

Embedded state: __NEXT_DATA__, application/json blobs (if present in DOM)

DOM selectors: stable labels + proximity parsing (Hebrew labels like ג€׳—׳ ׳™׳•׳×ג€, ג€׳×׳׳¨׳™׳ ׳›׳ ׳™׳¡׳”ג€, etc.)

This makes adding new sites mostly ג€configure selectors + mappingג€.

6) Mapping normalized ג†’ Redox property JSON (your schema)
Template-based mapper

Store a JSON template equal to your sample shape (but with ג€emptyג€ values).
Then merge values in:

// shared/redoxMapper.js
import { deepClone } from "./utils.js";
import template from "./schema/redoxPropertyTemplate.json";

export function mapToRedox(normalized, meta) {
  const out = deepClone(template); // 1 object (not array) OR template[0] depending on your file

  out.Address = normalized.address || normalized.title || "";
  out.City = normalized.city || "";
  out.RequestedPrice = normalized.price ?? null;
  out.Rooms = normalized.rooms ?? null;
  out.Floor = normalized.floor != null ? String(normalized.floor) : "";
  out.HomeArea = normalized.areaSqm ?? null;
  out.Description = normalized.description || "";

  // features
  if (typeof normalized.features.accessible === "boolean") {
    out.Accessible = normalized.features.accessible;
  }
  if (typeo:contentReference[oaicite:15]{index=15}.solarHeater === "boolean") {
    out.SolarHeat = normalized.features.solarHeater;
  }
  // elevators in your schema is numeric (0 in sample)
  if (normalized.features.elevator === true) out.Elevators = 1;

  // tracking metadata
  out.ReferenceId = meta.externalId; // e.g. yad2:oephsjkp
  // optionally put canonicalUrl into Comments if contract allows
  // out.Comments = `sourceUrl=${meta.canonicalUrl}`;

  return out;
}


Whether you send a single object or an array depends on your API. Your sample file is an array wrapper.
Design the API client to support both with a single switch.

7) Authentication, token storage, expiration, logout
Requirements you stated

Must login first

Keep access token in browser local storage

Handle expiration + logout

MVP plan

On successful login:

store:

accessToken

expiresAt (absolute ISO time if API provides it; else decode JWT exp if itג€™s JWT)

user summary

On any API call:

If now > expiresAt ג†’ logout locally

If API returns 401/403 ג†’ logout locally

Logout clears:

token

expiry

cached tracked list (optional)

Storage choice (practical)

If you truly mean window.localStorage:

store in popupג€™s localStorage (localStorage.setItem("redox.token", ...))

do API calls from popup context

If 

sample

stent storage in Chrome extensionsג€ (recommended):

store in chrome.storage.local

accessible from popup/content/background

Either is fine for MVP; the second is more robust.

8) API contract the extension expects (MVP)

You described capabilities, not exact endpoints. So define a thin API client with these functions, and wire to your real routes:

login(credentials) -> { token, expiresAt, user }

checkTracked({ canonicalUrl, externalId, siteId }) -> { tracked: boolean, signals, redoxUrl? }

trackProperty(payload) -> { tracked: true, redoxUrl, ... }

listTracked() -> [{ title, canonicalUrl, redoxUrl, ... }]

Signals

Design the UI to render signals as badges:

Example: ג€׳׳—׳™׳¨ ׳”׳©׳×׳ ׳”ג€, ג€׳™׳© ׳¢׳“׳›׳•׳ג€, ג€׳©׳•׳™׳ ׳›׳‘׳¨ ׳׳׳§׳•׳—ג€, etc.
You donג€™t need to hardcode semanticsג€”just display labels returned by API.

9) XState state machine (mandatory)
Top-level states

boot

unauthenticated

authenticating

authenticated

parallel:

currentPageFlow

trackedListFlow

fatalError (rare)

currentPageFlow (nested)

idle ג†’ detecting ג†’ noProperty | propertyDetected

propertyDetected

checkingTracked ג†’ alreadyTracked | notTracked

tracking (on Track click) ג†’ trackedSuccess | trackFailed

trackedListFlow (nested)

loading ג†’ loaded | failed

Can be refreshed manually.

Events

INIT

LOGIN_SUBMIT

LOGIN_OK

LOGIN_FAIL

LOGOUT

DETECT

DETECT_OK

DETECT_NONE

CHECK_TRACKED_OK

CHECK_TRACKED_FAIL

TRACK_SUBMIT

TRACK_OK

TRACK_FAIL

LOAD_TRACKED_OK

LOAD_TRACKED_FAIL

Why this matters

Prevents ג€UI spaghettiג€ in plain JS

Makes tests deterministic (state transitions are testable)

10) ג€Simple templatingג€ (mandatory) + rendering pattern
Template engine requirements

Replace {{key}} and {{nested.key}}

Escape HTML by default (safety)

Optional helpers:

{{t:login.title}} for translations

{{#if ...}} is NOT required (keep it simple)

Minimal implementation
// shared/templateEngine.js
export function renderTemplate(html, data) {
  return html.replace(/\{\{\s*([a-zA-Z0-9_.:-]+)\s*\}\}/g, (_, key) => {
    const value = resolvePath(data, key);
    return escapeHtml(value == null ? "" : String(value));
  });
}

function resolvePath(obj, path) {
  // support "t:xxx" as a special case if you want
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return "";
    cur = cur[p];
  }
  return cur;
}

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

Rendering approach

Keep templates in <template id="tpl-..."> blocks in popup.html

On each XState transition:

compute viewModel (plain object)

pick template

root.innerHTML = renderTemplate(template, viewModel)

11) i18n + RTL (mandatory)
MVP i18n approach (simple, extensible)

Keep translations in JSON dictionaries:

i18n/he.json

i18n/en.json

Default language:

if user didnג€™t pick one ג†’ he

Add a tiny language picker in Options page.

RTL handling

When lang = he (or ar later):

set:

document.documentElement.lang = "he"

document.documentElement.dir = "rtl"

CSS:

use logical properties where possible (margin-inline-start, etc.)

keep layout mirrored automatically by dir=rtl

Hebrew copy examples (MVP keys)

login.title: "׳”׳×׳—׳‘׳¨׳•׳×"

login.cta: "׳”׳×׳—׳‘׳¨"

current.detecting: "׳׳–׳”׳” ׳ ׳›׳¡ג€¦"

current.notDetected: "׳׳ ׳–׳•׳”׳” ׳ ׳›׳¡ ׳‘׳“׳£ ׳”׳–׳”"

current.track: "׳׳¢׳§׳‘"

current.tracked: "׳›׳‘׳¨ ׳‘׳׳¢׳§׳‘"

tracked.title: "׳ ׳›׳¡׳™׳ ׳‘׳׳¢׳§׳‘"

actions.openSource: "׳׳§׳•׳¨"

actions.openRedox: "Redox"

errors.unauthorized: "׳”׳—׳™׳‘׳•׳¨ ׳₪׳’ ׳×׳•׳§׳£, ׳¦׳¨׳™׳ ׳׳”׳×׳—׳‘׳¨ ׳׳—׳“׳©"

12) Testing strategy (mandatory)

You want tests as a non-negotiable. Goodג€”this architecture is test-friendly.

Unit tests (fast)

Use Vitest or Jest for:

templateEngine:

replaces keys

escapes HTML

nested path resolution

canonicalizeUrl(url):

strips query/hash

adapters extraction:

feed them saved HTML fixtures (snapshot files)

verify normalized output

mapToRedox():

verify output contains required keys and correct mapped values

verify types: price is number, floor is string, etc.

XState machine:

transition tests: given state + event ג†’ next state + context

Integration tests (extension wiring)

Use Playwright with Chromium + extension loaded:

Scenario A: not logged in ג†’ login UI

Scenario B: mocked API login success ג†’ token saved ג†’ detect request sent to content script

Scenario C: on a fixture page served locally:

content script returns detection + data

popup shows preview

clicking Track sends correct payload

Scenario D: API returns 401 ג†’ token cleared ג†’ login screen

HTML fixtures

Create tests/fixtures/yad2_item.html (saved from a real page)

Create tests/fixtures/madlan_listing.html

Even if Madlan blocks automated fetching in CI, you can capture one HTML snapshot manually once and store it.

13) MVP acceptance criteria (clear, testable)
Authentication

 If no token ג†’ login screen shown

 After login ג†’ token persisted

 If token expired or 401 ג†’ auto logout + login screen

 Manual logout clears token

Detection (current page)

 On Yad2 listing page (/realestate/item/...) popup shows ג€property detectedג€ and preview.

 On non-listing pages ג†’ ג€not detectedג€

 Detection response includes siteId, externalId, canonicalUrl

Tracking

 ג€Trackג€ sends payload matching your sample schema shape

 If API says already tracked ג†’ show tracked state + signals + open links

 If newly tracked ג†’ success UI and item appears in tracked list

Tracked list

 Popup shows tracked properties list from API

 Each item can open source URL and Redox URL in new tabs

i18n / RTL

 Default language Hebrew, RTL layout

 Switching language changes UI copy and direction where relevant

Tests

 Unit tests cover adapters + mapper + template engine + XState

 Playwright test covers at least one happy path end-to-end

14) Implementation plan (engineering checklist)
Repo skeleton

src/popup/*

src/content/*

src/shared/*

src/shared/schema/redoxPropertyTemplate.json (derived from your sample)

tests/unit/*

tests/e2e/*

Milestones (MVP)

Popup UI + templating + i18n/RTL + XState skeleton

Auth + token persistence + e

sample

 Content script + adapter registry + Yad2 adapter MVP

Redox mapper (template-based) + Track call

ג€Already tracked?ג€ call + signals UI

Tracked list call + list UI

Unit tests + fixtures

Playwright E2E tests

Notes on Yad2/Madlan specifics (what we know right now)

Yad2 detail pages are reachable and show key attributes like price, rooms, floor, area, and ג€׳׳” ׳™׳© ׳‘׳ ׳›׳¡ג€ (features) which are good extraction anchors.

Madlan list pages clearly link to /listings/<id>, but automated fetching may be blocked in some environments; the extension will run in a real user browser, so extraction should still work, and for testing youג€™ll rely on saved fixtures.

