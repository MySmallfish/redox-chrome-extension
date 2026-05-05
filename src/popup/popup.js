import { interpret } from "xstate";
import { createAppMachine } from "./stateMachine.js";
import { renderTemplate, escapeHtml } from "../shared/templateEngine.js";
import { createI18n } from "../shared/i18n.js";
import { createApiClient, UnauthorizedError } from "../shared/apiClient.js";
import { createMockApiClient } from "../shared/mockApiClient.js";
import {
  getAuth,
  setAuth,
  clearAuth,
  getUser,
  setUser,
  clearUser,
  getPropertyTypes,
  setPropertyTypes,
  clearPropertyTypes,
  isExpired,
  defaultStorage
} from "../shared/authStore.js";
import {
  loadLocalTracked,
  saveLocalTracked,
  upsertLocalTracked,
  listLocalTracked,
  buildLocalRecord,
  updateLocalFromDetection,
  updateLocalWithDetails,
  normalizeTags
} from "../shared/localTracking.js";
import { mapToRedox } from "../shared/redoxMapper.js";
import { buildReferenceId } from "../shared/url.js";
import he from "../shared/i18n/he.json";
import en from "../shared/i18n/en.json";

const DEFAULT_API_BASE_URL = "mock";
const API_BASE_KEY = "redox.apiBaseUrl";
const queryParams = new URLSearchParams(window.location.search);
const apiBaseOverride = queryParams.get("apiBaseUrl");
const mockEnabled = queryParams.get("mock") === "1";
const AUTH_BASE_URL = "https://redox-api.redox.co.il/clientapi";
const REDOX_APP_BASE_URL = "http://localhost:1721";
const SECURITY_CODE_HEADERS = {
  Authorization:
    "Bearer ezg0OTlCNEE1LTNFQkUtNDFBRC05MjQ5LUM2NzQ0NTU5RjBFNH18ezc3OTc3RTA3LUQwNTgtNDIxMy1CN0I0LTgyMkFFNjNGODVGOX0=",
  "X-Redox-Scope": "SecurityCode"
};
const TOKEN_HEADERS = {
  Authorization:
    "Bearer e0E4MDZGOTNDLTY0QzQtNEZGNi1BRDA2LTNCNjM3Q0ZEQTNEMX18ezAxNDRDRjcwLTI2OEMtNEJDRC04NzcwLThCNEE4MjM3MjI4Qn0=",
  "X-Redox-Scope": "Token"
};

const storage = defaultStorage();
const i18n = createI18n({ he, en }, "he");

const view = document.getElementById("view");
const logoutBtn = document.getElementById("logout-btn");
const brandTitle = document.getElementById("brand-title");
const headerMessage = document.getElementById("header-message");
const tabsEl = document.querySelector(".tabs");
const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));

const templates = {
  loginRequest: document.getElementById("tpl-login-request").innerHTML,
  loginVerify: document.getElementById("tpl-login-verify").innerHTML,
  loginPending: document.getElementById("tpl-login-pending").innerHTML,
  currentDetecting: document.getElementById("tpl-current-detecting").innerHTML,
  currentNotDetected: document.getElementById("tpl-current-not-detected").innerHTML,
  currentDetected: document.getElementById("tpl-current-detected").innerHTML,
  currentTracked: document.getElementById("tpl-current-tracked").innerHTML,
  currentTrackFailed: document.getElementById("tpl-current-track-failed").innerHTML,
  trackedList: document.getElementById("tpl-tracked-list").innerHTML
};

let activeTab = "current";
let currentAuth = null;
let service = null;
let apiClient = null;
let useMockApi = false;
let detectTimer = null;
let pendingDetect = false;
let lastDetectedUrl = null;
let activeTabUrl = null;
const compareSelection = new Set();
let pendingCommentFocus = false;
let pendingTagFocus = false;

init();

async function init() {
  i18n.setLang("he");
  bindStaticEvents();
  bindNavigationEvents();

  const apiBaseUrl = await getApiBaseUrl();
  useMockApi = mockEnabled || apiBaseUrl === "mock";
  apiClient = useMockApi
    ? createMockApiClient()
    : createApiClient({
        baseUrl: apiBaseUrl,
        getToken: () => currentAuth?.access_token || currentAuth?.token
      });

  const machine = createAppMachine().withConfig({
    services: {
      loadBootstrap,
      requestCode,
      verifyCode,
      loadUser,
      detectProperty,
      checkTracked,
      trackLocal,
      trackRedox,
      loadTracked
    },
    actions: {
      persistAuth: (context) => setAuth(context.auth, storage),
      clearStoredAuth: () => clearAuth(storage),
      persistUser: (context) => setUser(context.userProfile, storage),
      clearStoredUser: () => clearUser(storage),
      persistPropertyTypes: (context) =>
        setPropertyTypes(context.propertyTypes || [], storage),
      clearStoredPropertyTypes: () => clearPropertyTypes(storage)
    },
    guards: {
      isUnauthorized: (_, event) => event.data instanceof UnauthorizedError
    }
  });

  service = interpret(machine);
  service.onTransition((state) => {
    currentAuth = state.context.auth;
    render(state);
    if (pendingDetect && canTriggerDetect(state)) {
      pendingDetect = false;
      service.send({ type: "DETECT" });
    }
    if (shouldSendPendingRedox(state)) {
      service.send({ type: "SEND_REDOX" });
    }
  });
  service.start();
  scheduleDetect(null, true);
}

function bindStaticEvents() {
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab || "current";
      if (service) render(service.state);
    });
  });

  logoutBtn.addEventListener("click", () => {
  if (service?.state?.matches("ready.auth.authenticated")) {
      service.send({ type: "LOGOUT" });
    } else {
      service.send({ type: "SHOW_LOGIN" });
    }
  });

  // refresh button removed
}

function bindNavigationEvents() {
  if (!chrome?.tabs?.onUpdated) return;

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === "complete") {
      const force = changeInfo.status === "complete";
      scheduleDetect(changeInfo.url || tab?.url || null, force);
    }
  });

  chrome.tabs.onActivated.addListener(() => {
    scheduleDetect();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "REDOX_NAVIGATION") {
      scheduleDetect(message.url || null, true);
    }
  });
}

function scheduleDetect(explicitUrl = null, force = false) {
  if (!service) return;
  if (!canTriggerDetect(service.state)) {
    pendingDetect = true;
    return;
  }
  clearTimeout(detectTimer);
  detectTimer = setTimeout(async () => {
    const url = explicitUrl || (await getActiveTabUrl());
    if (!url) return;
    if (url !== activeTabUrl) {
      activeTabUrl = url;
      updateHeader(service.state);
    }
    if (!force && url === lastDetectedUrl) return;
    lastDetectedUrl = url;
    service.send({ type: "DETECT" });
  }, 150);
}

function canTriggerDetect(state) {
  if (!state?.matches("ready")) return false;
  const current = getCurrentPageState(state);
  return !["detecting", "checkingTracked", "trackingLocal", "trackingRedox"].includes(
    current
  );
}

function isAuthenticatedState(state) {
  return state?.matches("ready.auth.authenticated");
}

function shouldSendPendingRedox(state) {
  if (!state?.matches("ready")) return false;
  if (!state?.context?.pendingRedox) return false;
  if (!isAuthenticatedState(state)) return false;
  if (!state.context.detection) return false;
  const current = getCurrentPageState(state);
  return !["trackingRedox", "detecting", "checkingTracked"].includes(current);
}

function shouldShowLogin(state) {
  if (isAuthenticatedState(state)) return false;
  if (state.context.showLogin) return true;
  return (
    state.matches("ready.auth.requestingCode") ||
    state.matches("ready.auth.authenticating") ||
    state.matches("ready.auth.unauthenticated.awaitingCode")
  );
}

function getCurrentPageState(state) {
  return state.value?.ready?.currentPage || state.value?.currentPage || null;
}

function getTrackedListState(state) {
  return state.value?.ready?.trackedList || state.value?.trackedList || null;
}

function getTrackedLabel(trackedInfo) {
  if (trackedInfo?.source === "redox") return i18n.t("current.trackedRedox");
  if (trackedInfo?.source === "local") return i18n.t("current.trackedLocal");
  return i18n.t("current.tracked");
}

async function getActiveTabUrl() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url || null;
  } catch {
    return null;
  }
}

async function getApiBaseUrl() {
  if (apiBaseOverride) return apiBaseOverride;
  const data = await storage.get(API_BASE_KEY);
  return data[API_BASE_KEY] || DEFAULT_API_BASE_URL;
}

async function loadBootstrap() {
  const localTracked = loadLocalTracked();
  const localTrackedList = listLocalTracked(localTracked);
  const auth = await getAuth(storage);
  const userProfile = await getUser(storage);
  const propertyTypes = await getPropertyTypes(storage);
  if (auth && isExpired(auth)) {
    await clearAuth(storage);
    await clearUser(storage);
    await clearPropertyTypes(storage);
    return {
      auth: null,
      localTracked,
      localTrackedList,
      userProfile: null,
      propertyTypes: [],
      signedOut: true
    };
  }
  return {
    auth: auth || null,
    localTracked,
    localTrackedList,
    userProfile,
    propertyTypes: propertyTypes || [],
    signedOut: false
  };
}

async function requestCode(_, event) {
  if (!event?.contact) throw new Error("missing_contact");
  if (apiBaseOverride || mockEnabled) {
    if (!apiClient.requestCode) return { ok: true };
    return apiClient.requestCode({ contact: event.contact });
  }
  const payload = {
    Email: "login@redox.co.il",
    PhoneNumber: String(event.contact)
  };
  const response = await authPost("/SecurityCode", payload, SECURITY_CODE_HEADERS);
  const verificationCode = extractVerificationCode(response);
  if (!verificationCode) throw new Error("missing_verification_code");
  return { verificationCode };
}

async function verifyCode(context, event) {
  const contact = context.loginContact;
  if (!contact) throw new Error("missing_contact");
  if (!event?.code) throw new Error("missing_code");
  if (apiBaseOverride || mockEnabled) {
    if (!apiClient.verifyCode) throw new Error("unsupported_verify");
    const result = await apiClient.verifyCode({ contact, code: event.code });
    const token = result?.token || result?.accessToken;
    if (!token) throw new Error("invalid_login");
    return {
      token,
      expiresAt: result?.expiresAt || null,
      user: result?.user || null
    };
  }
  if (!context.verificationCode) throw new Error("missing_verification_code");
  const payload = {
    username: String(contact),
    password: String(event.code),
    verificationCode: String(context.verificationCode)
  };
  const result = await authPost("/Token", payload, TOKEN_HEADERS);
  const token = result?.access_token || result?.token || result?.accessToken;
  if (!token) throw new Error("invalid_login");
  const expiresAt = deriveExpiresAt(result);
  return {
    ...result,
    token,
    expiresAt,
    user: result?.user || null
  };
}

async function loadUser(context) {
  const auth = context.auth;
  if (!auth) return null;
  const token = auth.access_token || auth.token;
  if (!token) return null;
  const contact =
    context.loginContact ||
    context.userProfile?.User?.Email ||
    context.userProfile?.User?.Phone ||
    "";

  if (mockEnabled || apiBaseOverride) {
    const user = await loadSampleUser();
    return { user, propertyTypes: [] };
  }

  if (!contact) return { user: context.userProfile || null, propertyTypes: [] };
  const url = `${AUTH_BASE_URL}/Users?email=${encodeURIComponent(contact)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (response.status === 401 || response.status === 403) {
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  const text = await response.text();
  if (!text) return null;
  try {
    const user = JSON.parse(text);
    const propertyTypes = await loadPropertyTypes(token);
    return { user, propertyTypes };
  } catch {
    return { user: null, propertyTypes: [] };
  }
}

async function detectProperty() {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (
    !tab?.id ||
    tab?.url?.startsWith("chrome-extension://") ||
    tab?.url?.startsWith("chrome://")
  ) {
    const tabs = await chrome.tabs.query({});
    tab = tabs.find(
      (t) =>
        t.url &&
        !t.url.startsWith("chrome-extension://") &&
        !t.url.startsWith("chrome://") &&
        !t.url.startsWith("about:")
    );
  }
  if (!tab?.id) throw new Error("no_active_tab");
  return withTimeout(detectWithRetry(tab.id, tab.url), 8000);
}

async function detectWithRetry(tabId, url) {
  const attempts = 3;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await sendDetectMessage(tabId);
      return response || { detected: false };
    } catch (error) {
      const message = error?.message || "";
      const shouldInject =
        message.includes("Receiving end does not exist") ||
        message.includes("Could not establish connection");
      if (shouldInject && isSupportedUrl(url)) {
        const injected = await injectContentScript(tabId);
        if (injected) {
          await sleep(150);
          continue;
        }
      }
      if (i < attempts - 1) {
        await sleep(200);
        continue;
      }
      throw error;
    }
  }
  return { detected: false };
}

function sendDetectMessage(tabId, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("detect_timeout"));
    }, timeoutMs);
    chrome.tabs.sendMessage(tabId, { type: "DETECT_PROPERTY" }, (response) => {
      clearTimeout(timer);
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function injectContentScript(tabId) {
  if (!chrome.scripting?.executeScript) return false;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["contentScript.js"]
    });
    return true;
  } catch {
    return false;
  }
}

function isSupportedUrl(rawUrl) {
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    const host = url.hostname;
    return (
      host === "yad2.co.il" ||
      host.endsWith(".yad2.co.il") ||
      host === "madlan.co.il" ||
      host.endsWith(".madlan.co.il") ||
      host === "localhost" ||
      host === "127.0.0.1"
    );
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms) {
  let timer = null;
  let timedOut = false;
  const timeoutValue = { detected: false, warnings: ["detect_timeout"] };
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      resolve(timeoutValue);
    }, ms);
  });

  const guarded = promise
    .then((value) => {
      if (timedOut) return timeoutValue;
      clearTimeout(timer);
      return value;
    })
    .catch((error) => {
      if (timedOut) return timeoutValue;
      clearTimeout(timer);
      throw error;
    });

  return Promise.race([guarded, timeout]);
}

async function authPost(path, payload, headers) {
  const url = `${AUTH_BASE_URL}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed: ${response.status}`);
    }
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

async function authGet(path, token) {
  const url = `${AUTH_BASE_URL}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      },
      signal: controller.signal
    });
    if (response.status === 401 || response.status === 403) {
      throw new UnauthorizedError();
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed: ${response.status}`);
    }
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function loadSampleUser() {
  try {
    const url = chrome?.runtime?.getURL
      ? chrome.runtime.getURL("data/sample-user.json")
      : "data/sample-user.json";
    const response = await fetch(url);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function loadPropertyTypes(token) {
  if (!token) return [];
  try {
    const data = await authGet("/PropertyTypes", token);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.PropertyTypes)) return data.PropertyTypes;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.Items)) return data.Items;
    return [];
  } catch {
    return [];
  }
}

function extractVerificationCode(response) {
  if (!response) return null;
  if (typeof response === "string") return response.trim();
  if (typeof response === "number") return String(response);
  return (
    response.verificationCode ||
    response.securityCode ||
    response.code ||
    response.VerificationCode ||
    response.SecurityCode ||
    response.Code ||
    null
  );
}

function deriveExpiresAt(result) {
  if (!result) return null;
  if (result.expiresAt) return result.expiresAt;
  if (result.expires_at) return result.expires_at;
  if (result.expires_in) {
    const seconds = Number(result.expires_in);
    if (Number.isFinite(seconds)) {
      return new Date(Date.now() + seconds * 1000).toISOString();
    }
  }
  return null;
}

async function checkTracked(context) {
  if (!context.detection) return { tracked: false, source: null };
  const { canonicalUrl, externalId, siteId } = context.detection;
  let baseMap = context.localTracked || {};
  let localUpdates = null;
  let localRecord = baseMap?.[canonicalUrl] || null;
  if (localRecord) {
    localUpdates = updateLocalFromDetection(baseMap, context.detection, {
      createIfMissing: true
    });
    baseMap = localUpdates.map;
    localRecord = localUpdates.record;
    saveLocalTracked(baseMap);
  }

  let redoxInfo = null;
  if (context.auth) {
    const auth = ensureAuth(context.auth);
    currentAuth = auth;
    redoxInfo = await apiClient.checkTracked({ canonicalUrl, externalId, siteId });
  }

  const redoxTracked = Boolean(redoxInfo?.tracked);
  if (redoxTracked && !localRecord) {
    localUpdates = updateLocalFromDetection(baseMap, context.detection, {
      createIfMissing: true
    });
    baseMap = localUpdates.map;
    localRecord = localUpdates.record;
    saveLocalTracked(baseMap);
  }
  const tracked = redoxTracked || Boolean(localRecord);
  const source = redoxTracked ? "redox" : localRecord ? "local" : null;

  return { tracked, source, localRecord, redoxInfo, localUpdates };
}

async function trackLocal(context, event) {
  if (!context.detection) throw new Error("missing_detection");
  const baseUpdates = updateLocalFromDetection(context.localTracked || {}, context.detection, {
    createIfMissing: true
  });
  const withDetails = updateLocalWithDetails(
    baseUpdates.map,
    context.detection,
    event?.details || {}
  );
  const updated = withDetails.map;
  const updatedRecord = withDetails.record;
  const list = listLocalTracked(updated);
  saveLocalTracked(updated);
  return {
    tracked: true,
    source: "local",
    localRecord: updatedRecord,
    localUpdates: { map: updated, list, record: updatedRecord },
    map: updated,
    list
  };
}

async function trackRedox(context) {
  const auth = ensureAuth(context.auth);
  currentAuth = auth;
  if (!context.detection) throw new Error("missing_detection");
  const { siteId, externalId, canonicalUrl, normalized } = context.detection;
  const referenceId = buildReferenceId(siteId, externalId);
  const payload = mapToRedox(
    normalized,
    {
      siteId,
      externalId,
      canonicalUrl,
      referenceId
    },
    context.propertyTypes || []
  );
  const redoxUrl = await openRedoxAddProperty(payload);
  const localUpdates = updateLocalFromDetection(context.localTracked || {}, context.detection, {
    createIfMissing: true
  });
  saveLocalTracked(localUpdates.map);
  return {
    tracked: true,
    source: "redox",
    redoxInfo: { redoxUrl },
    localRecord: localUpdates.record,
    localUpdates
  };
}

async function loadTracked(context) {
  if (!context.auth) return [];
  const auth = ensureAuth(context.auth);
  currentAuth = auth;
  return apiClient.listTracked();
}

async function openRedoxAddProperty(payload) {
  const url = buildRedoxAddPropertyUrl(payload);
  if (typeof window !== "undefined") {
    window.__redoxLastUrl = url;
  }
  if (chrome?.tabs?.create) {
    chrome.tabs.create({ url });
  } else if (window?.open) {
    window.open(url, "_blank", "noopener");
  }
  return url;
}

function buildRedoxAddPropertyUrl(payload) {
  const json = JSON.stringify(payload || {});
  const base64 = encodeBase64Utf8(json);
  return `${REDOX_APP_BASE_URL}/#/AddProperty/?data=${encodeURIComponent(base64)}`;
}

function encodeBase64Utf8(value) {
  if (value == null) return "";
  const encoder = new TextEncoder();
  const bytes = encoder.encode(String(value));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function ensureAuth(auth) {
  if (!auth) throw new UnauthorizedError();
  if (isExpired(auth)) throw new UnauthorizedError();
  return auth;
}

function render(state) {
  updateHeader(state);
  updateStatus(state);
  updateTabs(state);

  if (shouldShowLogin(state)) {
    if (
      state.matches("ready.auth.requestingCode") ||
      state.matches("ready.auth.authenticating")
    ) {
      view.innerHTML = renderTemplate(templates.loginPending, { t: i18n.t });
      return;
    }
    if (state.matches("ready.auth.unauthenticated.awaitingCode")) {
      view.innerHTML = renderTemplate(templates.loginVerify, { t: i18n.t });
      bindVerifyCode(state.context.loginContact);
      return;
    }
    view.innerHTML = renderTemplate(templates.loginRequest, { t: i18n.t });
    bindRequestCode();
    return;
  }

  if (activeTab === "tracked") {
    view.innerHTML = renderTemplate(templates.trackedList, { t: i18n.t });
    renderTrackedList(state);
    return;
  }

  const currentState = getCurrentPageState(state);
  if (!currentState) {
    view.innerHTML = renderTemplate(templates.currentDetecting, { t: i18n.t });
    return;
  }
  if (currentState === "detecting" || currentState === "checkingTracked") {
    view.innerHTML = renderTemplate(templates.currentDetecting, { t: i18n.t });
    return;
  }

  if (currentState === "notDetected") {
    view.innerHTML = renderTemplate(templates.currentNotDetected, { t: i18n.t });
    return;
  }

  if (currentState === "trackingLocal" || currentState === "trackingRedox") {
    view.innerHTML = renderTemplate(templates.currentDetecting, { t: i18n.t });
    return;
  }

  if (currentState === "trackFailed") {
    view.innerHTML = renderTemplate(templates.currentTrackFailed, { t: i18n.t });
    bindLocalTrack();
    bindSendRedox();
    bindLocalDetails(state);
    bindShare(state);
    renderLocalExtras(state);
    return;
  }

  const property = buildPropertyView(state.context.detection?.normalized);
  const localRecord = getLocalRecord(state.context, state.context.detection);
  const localView = buildLocalView(localRecord);
  const trackedLabel = getTrackedLabel(state.context.trackedInfo);

  if (currentState === "tracked") {
    view.innerHTML = renderTemplate(templates.currentTracked, {
      t: i18n.t,
      property,
      trackedLabel,
      local: localView
    });
    renderSignals(state.context.trackedInfo?.redoxInfo?.signals || []);
    bindOpenLinks(state.context.trackedInfo, state.context.detection);
    bindSendRedox();
    bindLocalDetails(state);
    bindShare(state);
    renderLocalExtras(state);
    return;
  }

  view.innerHTML = renderTemplate(templates.currentDetected, {
    t: i18n.t,
    property,
    local: localView
  });
  bindLocalTrack();
  bindSendRedox();
  bindLocalDetails(state);
  bindShare(state);
  renderLocalExtras(state);
}

function updateHeader(state) {
  if (!brandTitle) return;
  const profile = state.context.userProfile;
  const fullName = profile?.User?.FullName || "";
  const isAuthed = isAuthenticatedState(state);
  if (isAuthed && fullName) {
    brandTitle.textContent = formatMessage(i18n.t("header.welcomeUser"), {
      name: fullName
    });
  } else {
    brandTitle.textContent = i18n.t("header.welcomeGuest");
  }

  if (headerMessage) {
    if (state.context.signedOut) {
      headerMessage.textContent = i18n.t("header.signedOut");
    } else if (activeTabUrl && isRedoxAppUrl(activeTabUrl)) {
      headerMessage.textContent = i18n.t("header.redoxGreeting");
    } else {
      headerMessage.textContent = "";
    }
  }
}

function updateStatus(state) {
  if (isAuthenticatedState(state)) {
    logoutBtn.textContent = i18n.t("actions.logout");
  } else {
    logoutBtn.textContent = i18n.t("actions.login");
  }
  logoutBtn.style.display = "inline";
}

function updateTabs(state) {
  tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === activeTab;
    btn.classList.toggle("active", isActive);
    btn.textContent = i18n.t(`tabs.${btn.dataset.tab}`);
  });
}

function formatMessage(template, values = {}) {
  if (!template || typeof template !== "string") return "";
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? "");
}

function isRedoxAppUrl(rawUrl) {
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    const host = url.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return url.port === "1721";
    }
    return host === "redox.co.il" || host.endsWith(".redox.co.il");
  } catch {
    return false;
  }
}

function bindRequestCode() {
  const form = document.getElementById("request-code-form");
  const input = form?.querySelector("input[name=contact]");
  if (!form) return;
  if (input) {
    setTimeout(() => input.focus(), 0);
    input.addEventListener("input", () => {
      const value = String(input.value || "").trim();
      if (input.dataset.autosent === "1") return;
      if (/^\d{10}$/.test(value)) {
        input.dataset.autosent = "1";
        form.requestSubmit();
      }
    });
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    service.send({
      type: "SEND_CODE",
      contact: data.get("contact")
    });
  });
}

function bindVerifyCode(contact) {
  const form = document.getElementById("verify-code-form");
  const resendBtn = document.getElementById("resend-code-btn");
  const codeInput = form?.querySelector("input[name=code]");
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      service.send({
        type: "VERIFY_CODE",
        code: data.get("code")
      });
    });
  }
  if (codeInput) {
    setTimeout(() => codeInput.focus(), 0);
    codeInput.addEventListener("input", () => {
      const value = String(codeInput.value || "").trim();
      if (/^\d{4}$/.test(value)) {
        form?.requestSubmit();
      }
    });
  }
  if (resendBtn) {
    resendBtn.addEventListener("click", () => {
      if (!contact) return;
      service.send({ type: "SEND_CODE", contact });
    });
  }
}

function bindLocalTrack() {
  const btn = document.getElementById("track-btn");
  if (!btn) return;
  btn.addEventListener("click", () => service.send({ type: "TRACK_LOCAL" }));
}

function bindSendRedox() {
  const btn = document.getElementById("send-redox-btn");
  if (!btn) return;
  btn.addEventListener("click", () => service.send({ type: "SEND_REDOX" }));
}

function bindLocalDetails(state) {
  const saveBtn = document.getElementById("save-local-btn");
  const commentInput = document.getElementById("comment-input");
  const commentBtn = document.getElementById("add-comment-btn");
  const tagsInput = document.getElementById("tags-input");
  const tagsList = document.getElementById("tags-list");
  const detection = state.context.detection;

  const getCurrentTags = () => {
    const current = getLocalRecord(service.state.context, service.state.context.detection);
    return Array.isArray(current?.tags) ? current.tags : [];
  };

  const addComment = () => {
    if (!detection || !commentInput) return;
    const text = commentInput.value.trim();
    if (!text) return;
    service.send({ type: "TRACK_LOCAL", details: { comment: text } });
    pendingCommentFocus = true;
    commentInput.value = "";
  };

  if (commentInput) {
    commentInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      addComment();
    });
  }
  if (commentBtn) {
    commentBtn.addEventListener("click", () => {
      addComment();
    });
  }

  if (tagsInput) {
    const commitTags = () => {
      if (!detection) return;
      const inputValue = tagsInput.value || "";
      const newTags = normalizeTags(inputValue);
      if (!newTags.length) return;
      const merged = normalizeTags([...getCurrentTags(), ...newTags]);
      service.send({ type: "TRACK_LOCAL", details: { tags: merged } });
      pendingTagFocus = true;
      tagsInput.value = "";
    };

    tagsInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        commitTags();
      }
    });
    tagsInput.addEventListener("input", () => {
      if (tagsInput.value.includes(",")) {
        commitTags();
      }
    });
    tagsInput.addEventListener("blur", () => {
      commitTags();
    });
  }

  if (tagsList) {
    tagsList.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-tag]");
      if (!btn) return;
      const tag = decodeURIComponent(btn.dataset.tag || "");
      const updated = getCurrentTags().filter((item) => item !== tag);
      service.send({ type: "TRACK_LOCAL", details: { tags: updated } });
      pendingTagFocus = true;
    });
  }

  if (!saveBtn) return;
  saveBtn.addEventListener("click", () => {
    if (!detection) return;
    const reminderInput = document.getElementById("reminder-input");

    const details = {
      tags: normalizeTags(tagsInput?.value || ""),
      reminderAt: reminderInput?.value || ""
    };

    service.send({ type: "TRACK_LOCAL", details });
  });
}

function bindShare(state) {
  const copyBtn = document.getElementById("copy-summary-btn");
  const shareBtn = document.getElementById("share-btn");
  if (!copyBtn && !shareBtn) return;
  const detection = state.context.detection;
  const localRecord = getLocalRecord(state.context, detection);
  const text = buildShareText(detection, localRecord);

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      await copyToClipboard(text);
    });
  }
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      await shareSummary(text, detection?.canonicalUrl);
    });
  }
}

function bindOpenLinks(trackedInfo, detection) {
  const redoxBtn = document.getElementById("open-redox-btn");
  const sourceBtn = document.getElementById("open-source-btn");
  const redoxUrl =
    trackedInfo?.redoxInfo?.redoxUrl || trackedInfo?.redoxUrl || null;
  if (redoxBtn) {
    redoxBtn.addEventListener("click", () => {
      if (redoxUrl) {
        chrome.tabs.create({ url: redoxUrl });
      }
    });
  }
  if (sourceBtn) {
    sourceBtn.addEventListener("click", () => {
      if (detection?.canonicalUrl) {
        chrome.tabs.create({ url: detection.canonicalUrl });
      }
    });
  }
}

function getLocalRecord(context, detection) {
  const canonicalUrl = detection?.canonicalUrl;
  if (!canonicalUrl) return null;
  return context.localTracked?.[canonicalUrl] || null;
}

function buildLocalView(record) {
  const tags = Array.isArray(record?.tags) ? record.tags.join(", ") : "";
  const lastSeen = record?.lastSeen ? formatDateShort(record.lastSeen) : "";
  const visits = record?.visitCount ? String(record.visitCount) : "";
  const reminderAt = record?.reminderAt || "";
  const changeText = buildChangeText(record);

  return {
    notes: record?.notes || "",
    tags,
    reminderAt,
    lastSeen,
    visits,
    changeText
  };
}

function buildChangeText(record) {
  if (!record?.lastChangeAt || !record?.lastChangeFields?.length) return "";
  const date = formatDateShort(record.lastChangeAt);
  const fields = record.lastChangeFields
    .map((field) => i18n.t(`changes.${field}`) || field)
    .join(", ");
  return `${fields} | ${date}`;
}

function buildShareText(detection, record) {
  const normalized = detection?.normalized || {};
  const title = normalized.title || normalized.address || record?.title || "";
  const address = normalized.address || record?.address || "";
  const city = normalized.city || record?.city || "";
  const price =
    normalized.price != null
      ? formatPrice(normalized.price)
      : record?.price != null
        ? formatPrice(record.price)
        : "";
  const rooms =
    normalized.rooms != null
      ? formatPill(normalized.rooms, "units.rooms")
      : record?.rooms != null
        ? formatPill(record.rooms, "units.rooms")
        : "";
  const area =
    normalized.areaSqm != null
      ? formatPill(normalized.areaSqm, "units.sqm")
      : record?.areaSqm != null
        ? formatPill(record.areaSqm, "units.sqm")
        : "";
  const floor =
    normalized.floor != null
      ? formatPill(formatFloor(normalized.floor, normalized.totalFloors), "units.floor")
      : record?.floor != null
        ? formatPill(record.floor, "units.floor")
        : "";

  const parts = [title, address, city, price, rooms, area, floor].filter(Boolean);
  if (detection?.canonicalUrl) parts.push(detection.canonicalUrl);
  return parts.join(" | ");
}

async function shareSummary(text, url) {
  if (!text) return;
  if (navigator?.share) {
    try {
      await navigator.share({
        title: "Redox",
        text,
        url: url || undefined
      });
      return;
    } catch {
      // fallback to copy
    }
  }
  await copyToClipboard(text);
}

async function copyToClipboard(text) {
  if (!text) return;
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fallback below
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function formatDateShort(value) {
  try {
    return new Date(value).toLocaleDateString(i18n.getLang(), {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch {
    return value;
  }
}

function formatDateTime(value) {
  try {
    return new Date(value).toLocaleString(i18n.getLang(), {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return value;
  }
}

function renderSignals(signals) {
  const list = document.getElementById("signals-list");
  if (!list) return;
  list.innerHTML = "";
  signals.forEach((signal) => {
    const pill = document.createElement("div");
    pill.className = "signal-pill";
    pill.textContent = signal;
    list.appendChild(pill);
  });
}

function renderTrackedList(state) {
  const localContainer = document.getElementById("local-tracked-items");
  const redoxContainer = document.getElementById("tracked-items");
  const redoxHint = document.getElementById("redox-login-hint");
  const compareContainer = document.getElementById("compare-table");
  const remindersContainer = document.getElementById("reminders-list");
  if (!localContainer || !redoxContainer) return;

  const localItems = state.context.localTrackedList || [];
  if (!localItems.length) {
    localContainer.innerHTML = `<p>${escapeHtml(i18n.t("tracked.empty"))}</p>`;
  } else {
    localContainer.innerHTML = localItems
      .map((item) => renderTrackedItem({ ...item, _source: "local" }))
      .join("");
  }

  if (compareContainer) {
    renderCompareTable(compareContainer, localItems);
  }

  if (remindersContainer) {
    renderReminders(remindersContainer, localItems);
  }

  if (!isAuthenticatedState(state)) {
    redoxContainer.innerHTML = "";
    if (redoxHint) {
      redoxHint.textContent = i18n.t("tracked.loginRequired");
    }
  } else {
    if (redoxHint) redoxHint.textContent = "";
    const trackedState = getTrackedListState(state);
    if (trackedState === "failed") {
      redoxContainer.innerHTML = `<p>${escapeHtml(i18n.t("tracked.error"))}</p>`;
    } else {
      const items = state.context.trackedList || [];
      if (!items.length) {
        redoxContainer.innerHTML = `<p>${escapeHtml(i18n.t("tracked.empty"))}</p>`;
      } else {
        redoxContainer.innerHTML = items.map(renderTrackedItem).join("");
      }
    }
  }

  document.querySelectorAll("button[data-url]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const url = btn.dataset.url;
      if (url) chrome.tabs.create({ url });
    });
  });

  document.querySelectorAll("input.compare-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const id = checkbox.dataset.id;
      if (!id) return;
      if (checkbox.checked) {
        compareSelection.add(id);
      } else {
        compareSelection.delete(id);
      }
      if (compareContainer) {
        renderCompareTable(compareContainer, localItems);
      }
    });
  });
}

function renderTrackedItem(item) {
  const title = escapeHtml(item.title || item.address || "");
  const meta = escapeHtml(buildMeta(item));
  const sourceUrl = escapeHtml(item.canonicalUrl || item.sourceUrl || "");
  const redoxUrl = escapeHtml(item.redoxUrl || "");
  const tagsHtml = renderTagChips(item.tags);
  const reminder = item.reminderAt
    ? `${i18n.t("tracked.reminder")}: ${formatDateShort(item.reminderAt)}`
    : "";
  const visits = item.visitCount
    ? `${i18n.t("tracked.visits")}: ${item.visitCount}`
    : "";
  const extra = [reminder, visits].filter(Boolean).join(" | ");

  const redoxButton = redoxUrl
    ? `<button class="secondary" data-url="${redoxUrl}">${escapeHtml(
        i18n.t("actions.openRedox")
      )}</button>`
    : "";

  const checkbox =
    item._source === "local"
      ? `<input class="compare-checkbox" type="checkbox" data-id="${escapeHtml(
          item.canonicalUrl || ""
        )}" ${compareSelection.has(item.canonicalUrl) ? "checked" : ""} />`
      : "";

  return `
    <div class="tracked-item">
      <div class="title">${checkbox}${title}</div>
      <div class="meta">${meta}</div>
      ${tagsHtml ? `<div class="tag-list">${tagsHtml}</div>` : ""}
      ${extra ? `<div class="meta">${escapeHtml(extra)}</div>` : ""}
      <div class="actions">
        <button class="secondary" data-url="${sourceUrl}">${escapeHtml(
          i18n.t("actions.openSource")
        )}</button>
        ${redoxButton}
      </div>
    </div>
  `;
}

function renderCompareTable(container, items) {
  const selected = items.filter((item) => compareSelection.has(item.canonicalUrl));
  if (selected.length < 2) {
    container.innerHTML = `<p class="muted">${escapeHtml(
      i18n.t("tracked.compareEmpty")
    )}</p>`;
    return;
  }

  const headers = selected.map((item) => escapeHtml(item.title || item.address || ""));
  const rows = [
    { label: i18n.t("tracked.fieldPrice"), key: "price" },
    { label: i18n.t("tracked.fieldRooms"), key: "rooms" },
    { label: i18n.t("tracked.fieldArea"), key: "areaSqm" },
    { label: i18n.t("tracked.fieldFloor"), key: "floor" }
  ];

  const bodyRows = rows
    .map((row) => {
      const cells = selected
        .map((item) => formatCompareCell(item, row.key))
        .join("");
      return `<tr><th>${escapeHtml(row.label)}</th>${cells}</tr>`;
    })
    .join("");

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>${escapeHtml(i18n.t("tracked.compareField"))}</th>
          ${headers.map((h) => `<th>${h}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
      </tbody>
    </table>
  `;
}

function formatCompareCell(item, key) {
  let value = item[key];
  if (value == null || value === "") return "<td>-</td>";
  if (key === "price") value = formatPrice(value);
  if (key === "rooms") value = formatPill(value, "units.rooms");
  if (key === "areaSqm") value = formatPill(value, "units.sqm");
  if (key === "floor") value = formatPill(value, "units.floor");
  return `<td>${escapeHtml(value)}</td>`;
}

function renderReminders(container, items) {
  const upcoming = items
    .filter((item) => item.reminderAt)
    .sort((a, b) => Date.parse(a.reminderAt) - Date.parse(b.reminderAt))
    .slice(0, 5);

  if (!upcoming.length) {
    container.innerHTML = `<p class="muted">${escapeHtml(
      i18n.t("tracked.noReminders")
    )}</p>`;
    return;
  }

  container.innerHTML = upcoming
    .map((item) => {
      const title = escapeHtml(item.title || item.address || "");
      const date = escapeHtml(formatDateShort(item.reminderAt));
      return `<div class="tracked-item"><div class="title">${title}</div><div class="meta">${date}</div></div>`;
    })
    .join("");
}

function renderTagChips(tags, options = {}) {
  if (!Array.isArray(tags) || !tags.length) return "";
  const removable = Boolean(options.removable);
  return tags
    .map((tag) => {
      const safeText = escapeHtml(tag);
      const encoded = encodeURIComponent(tag);
      if (!removable) {
        return `<span class="tag">${safeText}</span>`;
      }
      return `<span class="tag"><span class="tag-text">${safeText}</span><button class="tag-remove" type="button" data-tag="${encoded}">x</button></span>`;
    })
    .join("");
}

function renderLocalExtras(state) {
  const detection = state.context.detection;
  const record = getLocalRecord(state.context, detection);
  renderTagsList(record);
  renderCommentsList(record);

  if (pendingCommentFocus) {
    const commentInput = document.getElementById("comment-input");
    if (commentInput) commentInput.focus();
    pendingCommentFocus = false;
  }
  if (pendingTagFocus) {
    const tagsInput = document.getElementById("tags-input");
    if (tagsInput) tagsInput.focus();
    pendingTagFocus = false;
  }
}

function renderTagsList(record) {
  const container = document.getElementById("tags-list");
  if (!container) return;
  const tags = Array.isArray(record?.tags) ? record.tags : [];
  if (!tags.length) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = renderTagChips(tags, { removable: true });
}

function renderCommentsList(record) {
  const container = document.getElementById("comments-list");
  if (!container) return;
  const comments = Array.isArray(record?.comments) ? record.comments : [];
  if (!comments.length) {
    container.innerHTML = `<span class="muted">${escapeHtml(
      i18n.t("current.noComments")
    )}</span>`;
    return;
  }
  container.innerHTML = comments
    .slice(0, 6)
    .map((comment) => {
      const text = escapeHtml(comment.text || "");
      const time = escapeHtml(formatDateTime(comment.at));
      return `<div class="comment-item"><span>${text}</span><span class="time">${time}</span></div>`;
    })
    .join("");
}

function buildMeta(item) {
  const parts = [];
  if (item.city) parts.push(item.city);
  if (item.price != null) parts.push(formatPrice(item.price));
  if (item.rooms != null) parts.push(formatPill(item.rooms, "units.rooms"));
  if (item.areaSqm != null) parts.push(formatPill(item.areaSqm, "units.sqm"));
  if (item.floor != null) {
    parts.push(formatPill(formatFloor(item.floor, item.totalFloors), "units.floor"));
  }
  return parts.join(" | ");
}

function buildPropertyView(normalized) {
  if (!normalized) {
    return {
      title: "",
      address: "",
      city: "",
      rooms: "",
      area: "",
      floor: "",
      price: ""
    };
  }
  return {
    title: normalized.address || normalized.title || "",
    address: normalized.address || "",
    city: normalized.city || "",
    rooms: formatPill(normalized.rooms, "units.rooms"),
    area: formatPill(normalized.areaSqm, "units.sqm"),
    floor: formatPill(formatFloor(normalized.floor, normalized.totalFloors), "units.floor"),
    price: normalized.price != null ? formatPrice(normalized.price) : ""
  };
}

function formatPill(value, unitKey) {
  if (value == null || value === "") return "-";
  return `${value} ${i18n.t(unitKey)}`;
}

function formatFloor(floor, totalFloors) {
  if (floor == null || floor === "") return null;
  const floorValue = String(floor).trim();
  if (totalFloors != null && totalFloors !== "") {
    return `${floorValue}/${totalFloors}`;
  }
  return floorValue;
}

function formatPrice(value) {
  try {
    return new Intl.NumberFormat(i18n.getLang(), {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 0
    }).format(value);
  } catch {
    return `${value}`;
  }
}


