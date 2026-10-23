const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT_DIR = path.resolve(__dirname, "..");
const FIXTURES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures.json"), "utf8")
);

const sharedEsmContext = vm.createContext({
  fetch: globalThis.fetch,
  Request: globalThis.Request,
  Response: globalThis.Response,
  Headers: globalThis.Headers,
  AbortController: globalThis.AbortController,
  DOMException: globalThis.DOMException,
  URL: globalThis.URL,
  Intl: globalThis.Intl,
  setTimeout,
  clearTimeout,
  Date,
  Math,
  JSON,
  Number,
  String,
  Boolean,
  Array,
  Object,
  Map,
  Set,
  RegExp,
  Error,
  encodeURIComponent,
  parseInt,
  console
});

const moduleCache = new Map();

async function loadEsmModule(relPath) {
  const fullPath = path.resolve(ROOT_DIR, relPath);
  if (moduleCache.has(fullPath)) {
    const existing = moduleCache.get(fullPath);
    if (existing.status === "unlinked") {
      await existing.link(linker);
    }
    if (existing.status === "linked") {
      await existing.evaluate();
    }
    return existing.namespace;
  }

  async function linker(specifier, referencingModule) {
    const refDir = path.dirname(referencingModule.identifier);
    const resolvedPath = path.resolve(refDir, specifier);
    if (moduleCache.has(resolvedPath)) {
      return moduleCache.get(resolvedPath);
    }
    const code = fs.readFileSync(resolvedPath, "utf8");
    const mod = new vm.SourceTextModule(code, {
      identifier: resolvedPath,
      context: sharedEsmContext
    });
    moduleCache.set(resolvedPath, mod);
    await mod.link(linker);
    return mod;
  }

  const code = fs.readFileSync(fullPath, "utf8");
  const rootMod = new vm.SourceTextModule(code, {
    identifier: fullPath,
    context: sharedEsmContext
  });
  moduleCache.set(fullPath, rootMod);
  await rootMod.link(linker);
  await rootMod.evaluate();
  return rootMod.namespace;
}

function createDomStub(options = {}) {
  const elements = new Map();

  function makeClassList(initial = []) {
    const set = new Set(initial);
    return {
      add(...tokens) {
        for (const t of tokens) set.add(t);
      },
      remove(...tokens) {
        for (const t of tokens) set.delete(t);
      },
      contains(token) {
        return set.has(token);
      },
      toArray() {
        return Array.from(set);
      }
    };
  }

  function createElement(id, initialClasses = []) {
    const attrs = new Map();
    const el = {
      id,
      innerText: "",
      value: "",
      className: initialClasses.join(" "),
      style: {},
      parentNode: null,
      classList: makeClassList(initialClasses),
      setAttribute(k, v) {
        attrs.set(k, String(v));
      },
      getAttribute(k) {
        return attrs.has(k) ? attrs.get(k) : null;
      },
      get textContent() { return this.innerText; },
      set textContent(value) { this.innerText = value; },
      addEventListener(event, handler) {
        this["on" + event] = handler;
      },
      focus() {},
      select() {}
    };
    return el;
  }

  const knownIds = [
    "header-edge",
    "refresh-btn",
    "refresh-icon",
    "hero-ip-label",
    "client-ip-hero",
    "ip-type-badge",
    "ip-isp-badge",
    "hero-isp",
    "ip-location-badge",
    "hero-flag",
    "hero-location",
    "vpn-status-badge",
    "vpn-icon",
    "vpn-badge-text",
    "security-card",
    "sec-icon-bg",
    "sec-main-icon",
    "sec-tag",
    "sec-desc",
    "timezone-mismatch-alert",
    "tz-alert-text",
    "sec-type",
    "detail-isp",
    "detail-asn",
    "detail-city",
    "detail-country",
    "detail-tz",
    "detail-coords",
    "detail-browser",
    "detail-screen",
    "curl-plain",
    "curl-json",
    "toast",
    "toast-message"
  ];

  for (const id of knownIds) {
    const initial = id === "timezone-mismatch-alert" ? ["hidden"] : [];
    elements.set(id, createElement(id, initial));
  }

  const bodyChildren = [];
  const localizedElements = [];
  const html = fs.readFileSync(path.join(ROOT_DIR, "public", "index.html"), "utf8");
  for (const match of html.matchAll(/<[^>]+\bdata-i18n(?:-[\w-]+)?="[^"]+"[^>]*>/g)) {
    const attrs = [...match[0].matchAll(/\b(id|data-i18n(?:-[\w-]+)?)="([^"]*)"/g)];
    const id = attrs.find(attr => attr[1] === "id")?.[2];
    const element = (id && elements.get(id)) || createElement(id);
    for (const [, name, value] of attrs) element.setAttribute(name, value);
    if (id) elements.set(id, element);
    localizedElements.push(element);
  }
  const schema = createElement("structured-data");
  schema.textContent = /id="structured-data"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1];
  elements.set("structured-data", schema);
  const document = {
    documentElement: { lang: "vi" },
    querySelectorAll(selector) {
      const marker = /^\[([\w-]+)\]$/.exec(selector)[1];
      return localizedElements.filter(element => element.getAttribute(marker) !== null);
    },
    body: {
      appendChild(child) {
        child.parentNode = document.body;
        bodyChildren.push(child);
        return child;
      },
      removeChild(child) {
        const idx = bodyChildren.indexOf(child);
        if (idx !== -1) bodyChildren.splice(idx, 1);
        child.parentNode = null;
        return child;
      }
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
    createElement(tag) {
      return createElement(tag);
    },
    execCommand: options.execCommand || (() => false),
    addEventListener(event, handler) {
      if (event === "DOMContentLoaded") {
        document._domLoadedHandler = handler;
      }
    }
  };

  const clientTz = options.clientTimezone || "Asia/Ho_Chi_Minh";
  const RealDateTimeFormat = Intl.DateTimeFormat;
  function StubDateTimeFormat(locale, opts) {
    if (!opts || !opts.timeZone) {
      return {
        resolvedOptions() {
          return { timeZone: clientTz };
        }
      };
    }
    return new RealDateTimeFormat(locale, opts);
  }

  const windowObj = {
    location: { origin: options.origin || "https://check-ip-web.pages.dev" },
    localStorage: options.storage || {
      getItem() { return null; },
      setItem() {}
    },
    screen: options.screen || { width: 1920, height: 1080 }
  };

  const navigatorObj = {
    userAgent: options.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
    clipboard: options.clipboard
  };

  const sandbox = {
    window: windowObj,
    document,
    navigator: navigatorObj,
    lucide: options.lucide,
    fetch: options.fetch || (async () => new Response("{}", { status: 200 })),
    AbortController: globalThis.AbortController,
    Intl: { DateTimeFormat: StubDateTimeFormat },
    setTimeout,
    clearTimeout,
    Promise,
    Error,
    Number,
    String,
    Boolean,
    Object,
    Array,
    RegExp,
    Math,
    JSON,
    console
  };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT_DIR, "public", "i18n.js"), "utf8"), ctx);
  const appCode = fs.readFileSync(path.join(ROOT_DIR, "public", "app.js"), "utf8");
  vm.runInContext(appCode, ctx);

  return { ctx, document, elements, sandbox };
}

test("Shared fixtures parity in lib/ip.js", async () => {
  const ipLib = await loadEsmModule("lib/ip.js");

  for (const item of FIXTURES.ip_cases) {
    const res = ipLib.classifyIP(item.input);
    assert.equal(res.is_valid, item.is_valid, `is_valid mismatch for ${item.input}`);
    assert.equal(res.is_ipv6, item.is_ipv6, `is_ipv6 mismatch for ${item.input}`);
    assert.equal(res.is_public, item.is_public, `is_public mismatch for ${item.input}`);
    assert.equal(res.is_private, item.is_private, `is_private mismatch for ${item.input}`);
    assert.equal(res.lookup_eligible, item.lookup_eligible, `lookup_eligible mismatch for ${item.input}`);
    assert.equal(res.category, item.category, `category mismatch for ${item.input}`);
  }

  assert.equal(ipLib.normalizeTimezone("Asia/Saigon"), "Asia/Ho_Chi_Minh");
  assert.equal(ipLib.normalizeTimezone("Asia/Ho_Chi_Minh"), "Asia/Ho_Chi_Minh");
  assert.equal(ipLib.normalizeTimezone("Etc/UTC"), "UTC");
  assert.equal(ipLib.normalizeTimezone("Invalid/Zone_Name"), null);
});

test("functions/ip.js validates CF-Connecting-IP and rejects X-Forwarded-For fallback", async () => {
  const ipFn = await loadEsmModule("functions/ip.js");

  // Valid IPv4
  const resV4 = await ipFn.onRequest({
    request: new Request("https://check-ip-web.pages.dev/ip", {
      headers: { "cf-connecting-ip": "8.8.8.8" }
    })
  });
  assert.equal(resV4.status, 200);
  assert.equal(await resV4.text(), "8.8.8.8\n");
  assert.equal(resV4.headers.get("cache-control"), "no-store, max-age=0");

  // Missing CF-Connecting-IP with spoofed X-Forwarded-For must fail 503
  const resMissing = await ipFn.onRequest({
    request: new Request("https://check-ip-web.pages.dev/ip", {
      headers: { "x-forwarded-for": "1.1.1.1" }
    })
  });
  assert.equal(resMissing.status, 503);
  assert.equal(await resMissing.text(), "unavailable\n");

  // Invalid CF-Connecting-IP must fail 400
  const resInvalid = await ipFn.onRequest({
    request: new Request("https://check-ip-web.pages.dev/ip", {
      headers: { "cf-connecting-ip": "1.1.1.1, 2.2.2.2" }
    })
  });
  assert.equal(resInvalid.status, 400);
  assert.equal(await resInvalid.text(), "unavailable\n");
});

test("functions/api/info.js and json.js handle missing/private/public IPs, caching, rate limits, and cf fallback", async () => {
  const infoFn = await loadEsmModule("functions/api/info.js");
  const jsonFn = await loadEsmModule("functions/api/json.js");

  let fakeNow = 1700000000000;
  infoFn.setClock(() => fakeNow);
  infoFn.resetPagesLookupState();

  // 1. Missing CF-Connecting-IP -> 503 unavailable
  const resMissing = await infoFn.onRequest({
    request: new Request("https://check-ip-web.pages.dev/api/info", {
      headers: { "x-forwarded-for": "8.8.8.8" }
    })
  });
  assert.equal(resMissing.status, 503);
  const bodyMissing = await resMissing.json();
  assert.equal(bodyMissing.status, "unavailable");
  assert.equal(bodyMissing.ip, null);
  assert.equal(bodyMissing.security.detection_status, "unknown");

  // 2. Non-public IP (CGNAT 100.64.0.1) -> 200 not_applicable without upstream call
  let upstreamCount = 0;
  const resPrivate = await infoFn.onRequest({
    request: new Request("https://check-ip-web.pages.dev/api/info", {
      headers: { "cf-connecting-ip": "100.64.0.1" }
    }),
    fetch: async () => {
      upstreamCount++;
      throw new Error("Should not call upstream for non-public IP");
    }
  });
  assert.equal(resPrivate.status, 200);
  const bodyPrivate = await resPrivate.json();
  assert.equal(bodyPrivate.is_private, true);
  assert.equal(bodyPrivate.security.detection_status, "not_applicable");
  assert.equal(upstreamCount, 0);

  // 3. Public IP with proxy=false, hosting=true, lat=0, lon=0 + cache hit on 2nd request
  infoFn.resetPagesLookupState();
  let fetchCalls = 0;
  const mockUpstreamHosting = async () => {
    fetchCalls++;
    return new Response(
      JSON.stringify({
        status: "success",
        country: "Singapore",
        countryCode: "SG",
        city: "Singapore",
        regionName: "Central",
        zip: "018989",
        timezone: "Asia/Singapore",
        isp: "DigitalOcean, LLC",
        org: "DigitalOcean",
        as: "AS14061 DigitalOcean, LLC",
        proxy: false,
        hosting: true,
        lat: 0,
        lon: 0
      }),
      { status: 200, headers: { "x-rl": "39", "x-ttl": "60" } }
    );
  };

  const reqPublic1 = new Request("https://check-ip-web.pages.dev/api/info", {
    headers: { "cf-connecting-ip": "8.8.8.8" }
  });
  reqPublic1.cf = { colo: "SIN", country: "SG" };

  const resPublic1 = await infoFn.onRequest({
    request: reqPublic1,
    fetch: mockUpstreamHosting
  });
  const bodyPublic1 = await resPublic1.json();
  assert.equal(fetchCalls, 1);
  assert.equal(bodyPublic1.security.detection_status, "not_detected");
  assert.equal(bodyPublic1.security.is_vpn_or_proxy, false);
  assert.equal(bodyPublic1.security.is_hosting, true);
  assert.equal(bodyPublic1.details.latitude, 0);
  assert.equal(bodyPublic1.details.longitude, 0);

  // Second call via functions/api/json.js hits isolate cache
  const resPublic2 = await jsonFn.onRequest({
    request: reqPublic1,
    fetch: mockUpstreamHosting
  });
  const bodyPublic2 = await resPublic2.json();
  assert.equal(fetchCalls, 1);
  assert.equal(bodyPublic2.security.detection_status, "not_detected");

  // Advance clock past 3600s TTL -> re-fetches
  fakeNow += 3601 * 1000;
  await infoFn.onRequest({
    request: reqPublic1,
    fetch: mockUpstreamHosting
  });
  assert.equal(fetchCalls, 2);

  // 4. Upstream failure preserves request.cf metadata and keeps detection_status: "unknown"
  infoFn.resetPagesLookupState();
  const reqCfFallback = new Request("https://check-ip-web.pages.dev/api/info", {
    headers: { "cf-connecting-ip": "1.1.1.1" }
  });
  reqCfFallback.cf = {
    colo: "SGN",
    city: "Ho Chi Minh City",
    country: "VN",
    asOrganization: "Viettel Group",
    asn: 7552,
    timezone: "Asia/Saigon",
    latitude: "10.823",
    longitude: "106.629"
  };

  let failCalls = 0;
  const resFallback = await infoFn.onRequest({
    request: reqCfFallback,
    fetch: async () => {
      failCalls++;
      return new Response("Server Error", { status: 500 });
    }
  });
  const bodyFallback = await resFallback.json();
  assert.equal(failCalls, 1);
  assert.equal(bodyFallback.details.city, "Ho Chi Minh City");
  assert.equal(bodyFallback.details.country_code, "VN");
  assert.equal(bodyFallback.details.isp, "Viettel Group");
  assert.equal(bodyFallback.details.asn, "AS7552");
  assert.equal(bodyFallback.details.timezone, "Asia/Ho_Chi_Minh");
  assert.equal(bodyFallback.security.detection_status, "unknown");
  assert.equal(bodyFallback.security.is_vpn_or_proxy, false);

  // Failed lookup was NOT cached -> next call invokes fetch again
  await infoFn.onRequest({
    request: reqCfFallback,
    fetch: async () => {
      failCalls++;
      return new Response("Server Error", { status: 500 });
    }
  });
  assert.equal(failCalls, 2);

  // 5. HTTP 429 triggers cooldown and suppresses subsequent upstream call
  infoFn.resetPagesLookupState();
  let rlCalls = 0;
  await infoFn.onRequest({
    request: reqCfFallback,
    fetch: async () => {
      rlCalls++;
      return new Response("Too Many Requests", {
        status: 429,
        headers: { "x-rl": "0", "x-ttl": "120" }
      });
    }
  });
  assert.equal(rlCalls, 1);

  const resCooldown = await infoFn.onRequest({
    request: reqCfFallback,
    fetch: async () => {
      rlCalls++;
      return new Response("{}", { status: 200 });
    }
  });
  const bodyCooldown = await resCooldown.json();
  assert.equal(rlCalls, 1);
  assert.equal(bodyCooldown.security.detection_status, "unknown");
  assert.equal(bodyCooldown.security.reason, "rate_limit_cooldown");

  // 6. Missing boolean proxy flag returns unknown and does not cache
  infoFn.resetPagesLookupState();
  let missingProxyCalls = 0;
  const resMissingProxy = await infoFn.onRequest({
    request: reqCfFallback,
    fetch: async () => {
      missingProxyCalls++;
      return new Response(
        JSON.stringify({ status: "success", country: "VN", countryCode: "VN", hosting: true }),
        { status: 200 }
      );
    }
  });
  const bodyMissingProxy = await resMissingProxy.json();
  assert.equal(bodyMissingProxy.security.detection_status, "unknown");
  assert.equal(bodyMissingProxy.security.is_hosting, true);
  assert.equal(missingProxyCalls, 1);

  // 7. 40 calls/minute budget cap
  infoFn.resetPagesLookupState();
  let budgetCalls = 0;
  for (let i = 1; i <= 40; i++) {
    const reqBudget = new Request("https://check-ip-web.pages.dev/api/info", {
      headers: { "cf-connecting-ip": `8.8.8.${i}` }
    });
    await infoFn.onRequest({
      request: reqBudget,
      fetch: async () => {
        budgetCalls++;
        return new Response("Error", { status: 500 });
      }
    });
  }
  assert.equal(budgetCalls, 40);
  const req41 = new Request("https://check-ip-web.pages.dev/api/info", {
    headers: { "cf-connecting-ip": "8.8.8.200" }
  });
  const res41 = await infoFn.onRequest({
    request: req41,
    fetch: async () => {
      budgetCalls++;
      return new Response("{}", { status: 200 });
    }
  });
  const body41 = await res41.json();
  assert.equal(budgetCalls, 40);
  assert.equal(body41.security.detection_status, "unknown");
  assert.equal(body41.security.reason, "budget_exhausted");

  // 8. LRU eviction when cacheMaxSize is reached and hanging lookup aborted at deadline
  infoFn.resetPagesLookupState();
  infoFn.setTestConfig({ cacheMaxSize: 2, lookupTimeoutMs: 30 });
  let lruFetches = 0;
  const mockLruFetch = async () => {
    lruFetches++;
    return new Response(
      JSON.stringify({ status: "success", country: "US", countryCode: "US", proxy: false, hosting: false }),
      { status: 200 }
    );
  };
  const makeIpReq = ip =>
    new Request("https://check-ip-web.pages.dev/api/info", {
      headers: { "cf-connecting-ip": ip }
    });

  await infoFn.onRequest({ request: makeIpReq("8.8.8.8"), fetch: mockLruFetch });
  await infoFn.onRequest({ request: makeIpReq("1.1.1.1"), fetch: mockLruFetch });
  assert.equal(lruFetches, 2);
  // Touch 8.8.8.8 so 1.1.1.1 becomes oldest
  await infoFn.onRequest({ request: makeIpReq("8.8.8.8"), fetch: mockLruFetch });
  assert.equal(lruFetches, 2);
  // Insert 9.9.9.9 -> evicts 1.1.1.1
  await infoFn.onRequest({ request: makeIpReq("9.9.9.9"), fetch: mockLruFetch });
  assert.equal(lruFetches, 3);
  // 8.8.8.8 still cached, 1.1.1.1 requires re-fetch
  await infoFn.onRequest({ request: makeIpReq("8.8.8.8"), fetch: mockLruFetch });
  assert.equal(lruFetches, 3);
  await infoFn.onRequest({ request: makeIpReq("1.1.1.1"), fetch: mockLruFetch });
  assert.equal(lruFetches, 4);

  // Hanging lookup is aborted at deadline (30ms) and returns lookup_timeout without caching
  let abortSignalFired = false;
  const resTimeout = await infoFn.onRequest({
    request: makeIpReq("8.8.4.4"),
    fetch: (_url, opts) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          abortSignalFired = true;
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        });
      })
  });
  const bodyTimeout = await resTimeout.json();
  assert.equal(abortSignalFired, true);
  assert.equal(bodyTimeout.security.detection_status, "unknown");
  assert.equal(bodyTimeout.security.reason, "lookup_timeout");
  infoFn.resetPagesLookupState();
});

test("F2/F3 & context.cache: special-range lookup eligibility, response body abort/timeout vs invalid JSON, and cache adapter remaining TTL", async () => {
  const infoFn = await loadEsmModule("functions/api/info.js");
  const ipLib = await loadEsmModule("lib/ip.js");
  let fakeNow = 1700000000000;
  infoFn.setClock(() => fakeNow);
  infoFn.resetPagesLookupState();

  const makeReq = (ip, signal) =>
    new Request("https://check-ip-web.pages.dev/api/info", {
      headers: { "cf-connecting-ip": ip },
      signal
    });

  // 1. F2: Non-public IANA special-purpose ranges and prefix boundaries never call upstream
  const nonPublicSpecials = [
    "3fff::1",
    "100:0:0:1::1",
    "64:ff9b:1::1",
    "64:ff9b::1:0:0",
    "64:ff9a:ffff:ffff:ffff:ffff:ffff:ffff",
    "2001::1",
    "2001:1::",
    "2001:1::4",
    "2001:2::1",
    "192.0.0.1",
    "192.0.0.8",
    "fec0::1",
    "4000::1"
  ];
  for (const ip of nonPublicSpecials) {
    const cls = ipLib.classifyIP(ip);
    assert.equal(cls.is_public, false, `Expected is_public=false for ${ip}`);
    assert.equal(cls.is_private, true, `Expected is_private=true for ${ip}`);
    assert.equal(cls.lookup_eligible, false, `Expected lookup_eligible=false for ${ip}`);

    let called = 0;
    const res = await infoFn.onRequest({
      request: makeReq(ip),
      fetch: async () => {
        called++;
        throw new Error(`Upstream must not be called for ${ip}`);
      }
    });
    const body = await res.json();
    assert.equal(called, 0, `Expected 0 upstream calls for ${ip}`);
    assert.equal(body.is_private, true, `Expected is_private=true for ${ip}`);
    assert.equal(body.security.detection_status, "not_applicable", `Expected not_applicable for ${ip}`);
  }

  // 2. F2: Public exceptions inside special parent blocks (including 64:ff9b::/96 and 2001:1::3/128) DO call upstream
  const publicExceptions = [
    "64:ff9b::808:808",
    "64:ff9b::101:101",
    "2001:1::1",
    "2001:1::2",
    "2001:1::3",
    "2001:3::1",
    "2001:4:112::1",
    "2001:20::1",
    "2001:30::1",
    "192.0.0.9",
    "192.0.0.10"
  ];
  for (const ip of publicExceptions) {
    const cls = ipLib.classifyIP(ip);
    assert.equal(cls.is_public, true, `Expected is_public=true for ${ip}`);
    assert.equal(cls.is_private, false, `Expected is_private=false for ${ip}`);
    assert.equal(cls.lookup_eligible, true, `Expected lookup_eligible=true for ${ip}`);

    infoFn.resetPagesLookupState();
    let called = 0;
    const res = await infoFn.onRequest({
      request: makeReq(ip),
      fetch: async () => {
        called++;
        return new Response(
          JSON.stringify({ status: "success", country: "US", countryCode: "US", proxy: false, hosting: false }),
          { status: 200 }
        );
      }
    });
    const body = await res.json();
    assert.equal(called, 1, `Expected 1 upstream call for public exception ${ip}`);
    assert.equal(body.is_private, false, `Expected is_private=false for ${ip}`);
    assert.equal(body.security.detection_status, "not_detected", `Expected not_detected for ${ip}`);
  }

  // 3. F3: Client abort while reading response body (res.json()) propagates AbortError and does not cache
  infoFn.resetPagesLookupState();
  const clientAbortDuringBody = new AbortController();
  await assert.rejects(
    async () => {
      await infoFn.onRequest({
        request: makeReq("8.8.8.8", clientAbortDuringBody.signal),
        fetch: async (_url, opts) => ({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () =>
            new Promise((_resolve, reject) => {
              opts.signal.addEventListener(
                "abort",
                () => {
                  const err = new Error("The operation was aborted");
                  err.name = "AbortError";
                  reject(err);
                },
                { once: true }
              );
              setTimeout(() => clientAbortDuringBody.abort(), 10);
            })
        })
      });
    },
    err => err && err.name === "AbortError"
  );

  // 4. F3: Client abort at body completion boundary (res.json() resolves right as request.signal is aborted)
  const clientAbortAtBoundary = new AbortController();
  await assert.rejects(
    async () => {
      await infoFn.onRequest({
        request: makeReq("8.8.8.8", clientAbortAtBoundary.signal),
        fetch: async () => ({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => {
            clientAbortAtBoundary.abort();
            return { status: "success", country: "US", countryCode: "US", proxy: false, hosting: false };
          }
        })
      });
    },
    err => err && err.name === "AbortError"
  );

  // Verify neither aborted call populated cache
  let postAbortCalls = 0;
  await infoFn.onRequest({
    request: makeReq("8.8.8.8"),
    fetch: async () => {
      postAbortCalls++;
      return new Response(
        JSON.stringify({ status: "success", country: "US", countryCode: "US", proxy: false, hosting: false }),
        { status: 200 }
      );
    }
  });
  assert.equal(postAbortCalls, 1);

  // 5. F3: Lookup deadline timeout during res.json() returns lookup_timeout (not lookup_invalid_json)
  infoFn.resetPagesLookupState();
  infoFn.setTestConfig({ lookupTimeoutMs: 25 });
  const resBodyTimeout = await infoFn.onRequest({
    request: makeReq("8.8.4.4"),
    fetch: async (_url, opts) => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener(
            "abort",
            () => {
              reject(new SyntaxError("Unexpected end of JSON input after timeout abort"));
            },
            { once: true }
          );
        })
    })
  });
  const bodyTimeoutJson = await resBodyTimeout.json();
  assert.equal(bodyTimeoutJson.security.detection_status, "unknown");
  assert.equal(bodyTimeoutJson.security.reason, "lookup_timeout");

  // 6. Genuine invalid JSON (without timeout or client abort) still returns lookup_invalid_json
  infoFn.resetPagesLookupState();
  const resInvalidJson = await infoFn.onRequest({
    request: makeReq("8.8.4.4"),
    fetch: async () => new Response("{not-valid-json", { status: 200 })
  });
  const bodyInvalidJson = await resInvalidJson.json();
  assert.equal(bodyInvalidJson.security.detection_status, "unknown");
  assert.equal(bodyInvalidJson.security.reason, "lookup_invalid_json");

  // 7. Optional context.cache adapter: put, match with remaining TTL preservation, and error resilience
  infoFn.resetPagesLookupState();
  const edgeCacheStore = new Map();
  let cachePutCount = 0;
  let cacheMatchCount = 0;
  const mockCacheAdapter = {
    async match(key) {
      cacheMatchCount++;
      const stored = edgeCacheStore.get(key);
      return stored ? stored.clone() : null;
    },
    async put(key, response) {
      cachePutCount++;
      edgeCacheStore.set(key, response.clone());
    }
  };

  let upstreamForCache = 0;
  const mockSuccessFetch = async () => {
    upstreamForCache++;
    return new Response(
      JSON.stringify({ status: "success", country: "JP", countryCode: "JP", proxy: true, hosting: false }),
      { status: 200 }
    );
  };

  // Initial lookup populates both _isolateCache and mockCacheAdapter at t=0
  const resCache1 = await infoFn.onRequest({
    request: makeReq("1.0.0.1"),
    fetch: mockSuccessFetch,
    cache: mockCacheAdapter
  });
  const bodyCache1 = await resCache1.json();
  assert.equal(upstreamForCache, 1);
  assert.equal(cacheMatchCount, 1);
  assert.equal(cachePutCount, 1);
  assert.equal(bodyCache1.security.detection_status, "suspected");

  // Simulate new isolate 3500s later (clear _isolateCache, keep edgeCacheStore)
  infoFn.resetPagesLookupState();
  infoFn.setClock(() => fakeNow);
  fakeNow += 3500 * 1000;

  const resCache2 = await infoFn.onRequest({
    request: makeReq("1.0.0.1"),
    fetch: mockSuccessFetch,
    cache: mockCacheAdapter
  });
  const bodyCache2 = await resCache2.json();
  assert.equal(upstreamForCache, 1, "Should hit context.cache without calling upstream");
  assert.equal(bodyCache2.security.detection_status, "suspected");

  // Advance another 101s (total 3601s > 3600s original TTL): must expire in _isolateCache too!
  fakeNow += 101 * 1000;
  edgeCacheStore.clear(); // Edge cache also expired
  await infoFn.onRequest({
    request: makeReq("1.0.0.1"),
    fetch: mockSuccessFetch,
    cache: mockCacheAdapter
  });
  assert.equal(upstreamForCache, 2, "Remaining TTL from X-Cached-At must expire at 3600s total, not reset to +3600s");

  // Broken context.cache adapter must not break lookup
  infoFn.resetPagesLookupState();
  const brokenCacheAdapter = {
    async match() {
      throw new Error("Cache match failure");
    },
    async put() {
      throw new Error("Cache put failure");
    }
  };
  const resBrokenCache = await infoFn.onRequest({
    request: makeReq("9.9.9.9"),
    fetch: mockSuccessFetch,
    cache: brokenCacheAdapter
  });
  const bodyBrokenCache = await resBrokenCache.json();
  assert.equal(resBrokenCache.status, 200);
  assert.equal(bodyBrokenCache.security.detection_status, "suspected");

  infoFn.resetPagesLookupState();
});

test("Static HTML and SEO files contain neutral initial states and unified canonical URLs", () => {
  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, "public", "index.html"), "utf8");
  const robotsTxt = fs.readFileSync(path.join(ROOT_DIR, "public", "robots.txt"), "utf8");
  const sitemapXml = fs.readFileSync(path.join(ROOT_DIR, "public", "sitemap.xml"), "utf8");

  assert.ok(!indexHtml.includes("checkip.vn"), "index.html must not contain checkip.vn URL");
  assert.ok(indexHtml.includes("https://check-ip-web.pages.dev/"));
  assert.ok(robotsTxt.includes("https://check-ip-web.pages.dev/sitemap.xml"));
  assert.ok(sitemapXml.includes("<loc>https://check-ip-web.pages.dev/</loc>"));

  // Ensure initial HTML does not claim "An toàn" or "Kết nối trực tiếp (Không dùng VPN / Proxy)"
  assert.ok(!indexHtml.includes("Kết nối trực tiếp (Không dùng VPN / Proxy)"));
  assert.ok(!indexHtml.includes(">An toàn<"));

  // Ensure app/static duplicate files are removed
  assert.equal(fs.existsSync(path.join(ROOT_DIR, "app", "static", "app.js")), false);
  assert.equal(fs.existsSync(path.join(ROOT_DIR, "app", "static", "index.html")), false);
});

test("public/app.js renders security states, timezone comparison, coordinates 0, UA parsing, clipboard, and latest-request-wins", async () => {
  // 1. Timezone alias normalization: Asia/Saigon vs Asia/Ho_Chi_Minh must NOT trigger mismatch alert
  const env1 = createDomStub({ clientTimezone: "Asia/Saigon", lucide: undefined });
  env1.ctx.renderUI({
    status: "success",
    ip: "8.8.8.8",
    is_ipv6: false,
    is_private: false,
    details: {
      isp: "Google LLC",
      organization: "Google",
      asn: "AS15169",
      city: "Mountain View",
      country: "United States",
      country_code: "US",
      flag_emoji: "🇺🇸",
      latitude: 0,
      longitude: 0,
      timezone: "Asia/Ho_Chi_Minh",
      colo: "SGN"
    },
    security: {
      detection_status: "not_detected",
      is_vpn_or_proxy: false,
      is_hosting: false
    },
    datacenter: "SGN"
  });

  assert.equal(env1.elements.get("hero-ip-label").innerText, "Địa chỉ IP công cộng (Public IP) của bạn");
  assert.equal(env1.elements.get("detail-coords").innerText, "Tọa độ: 0.000, 0.000");
  assert.equal(env1.elements.get("timezone-mismatch-alert").classList.contains("hidden"), true);
  assert.equal(env1.elements.get("vpn-badge-text").innerText, "Chưa phát hiện dấu hiệu VPN/Proxy");

  // 2. Genuine timezone difference shows auxiliary alert without turning security status into suspected
  env1.ctx.renderUI({
    status: "success",
    ip: "8.8.8.8",
    is_ipv6: false,
    is_private: false,
    details: {
      timezone: "America/New_York"
    },
    security: {
      detection_status: "not_detected",
      is_vpn_or_proxy: false,
      is_hosting: false
    }
  });
  assert.equal(env1.elements.get("timezone-mismatch-alert").classList.contains("hidden"), false);
  assert.equal(env1.elements.get("vpn-badge-text").innerText, "Chưa phát hiện dấu hiệu VPN/Proxy");

  // 3. Private IP renders local IP label and not_applicable status
  env1.ctx.renderUI({
    status: "success",
    ip: "127.0.0.1",
    is_ipv6: false,
    is_private: true,
    details: {},
    security: {
      detection_status: "not_applicable",
      is_vpn_or_proxy: false,
      is_hosting: false
    }
  });
  assert.equal(env1.elements.get("hero-ip-label").innerText, "Địa chỉ IP nội bộ (Local IP) của bạn");
  assert.equal(env1.elements.get("vpn-badge-text").innerText, "IP nội bộ");

  // 4. User-Agent parsing order against shared fixtures
  for (const uaCase of FIXTURES.user_agent_cases) {
    const parsed = env1.ctx.parseUserAgent(uaCase.ua);
    assert.equal(parsed.browser, uaCase.browser, `browser mismatch for ${uaCase.name}`);
    assert.equal(parsed.os, uaCase.os, `os mismatch for ${uaCase.name}`);
    assert.equal(parsed.label, uaCase.label, `label mismatch for ${uaCase.name}`);
  }

  // 5. Clipboard verification: fails when both clipboard API and execCommand fail
  const envClipFail = createDomStub({
    clipboard: {
      writeText: async () => {
        throw new Error("Clipboard denied");
      }
    },
    execCommand: () => false
  });
  const copyFailResult = await envClipFail.ctx.copyText("8.8.8.8");
  assert.equal(copyFailResult, false);
  assert.ok(envClipFail.elements.get("toast-message").innerText.includes("Không thể sao chép tự động"));

  // Succeeds when execCommand returns true
  const envClipFallbackOk = createDomStub({
    clipboard: {
      writeText: async () => {
        throw new Error("Clipboard denied");
      }
    },
    execCommand: () => true
  });
  const copyOkResult = await envClipFallbackOk.ctx.copyText("8.8.8.8");
  assert.equal(copyOkResult, true);
  assert.equal(envClipFallbackOk.elements.get("toast-message").innerText, "Đã sao chép: 8.8.8.8");

  // 6. Concurrent fetchData() calls: latest request wins (both stale success and stale error ignored)
  let deferreds = [];
  const envRace = createDomStub({
    fetch: () =>
      new Promise((resolve, reject) => {
        deferreds.push({ resolve, reject });
      })
  });

  const p1 = envRace.ctx.fetchData();
  const p2 = envRace.ctx.fetchData();
  assert.equal(deferreds.length, 2);

  // Resolve second request first with 1.1.1.1
  deferreds[1].resolve(
    new Response(
      JSON.stringify({
        status: "success",
        ip: "1.1.1.1",
        is_ipv6: false,
        is_private: false,
        details: {},
        security: { detection_status: "not_detected" }
      }),
      { status: 200 }
    )
  );
  await p2;
  assert.equal(envRace.elements.get("client-ip-hero").innerText, "1.1.1.1");

  // Reject first (stale) request later -> must NOT overwrite 1.1.1.1 with error state
  deferreds[0].reject(new Error("Network error on stale request"));
  await p1;
  assert.equal(envRace.elements.get("client-ip-hero").innerText, "1.1.1.1");

  // 7. DOMContentLoaded startup without lucide still fetches and renders IP
  const envStartup = createDomStub({
    lucide: undefined,
    fetch: async () =>
      new Response(
        JSON.stringify({
          status: "success",
          ip: "9.9.9.9",
          is_ipv6: false,
          is_private: false,
          details: { isp: "Quad9" },
          security: { detection_status: "not_detected" }
        }),
        { status: 200 }
      )
  });
  assert.equal(typeof envStartup.document._domLoadedHandler, "function");
  envStartup.document._domLoadedHandler();
  await new Promise(r => setTimeout(r, 20));
  assert.equal(envStartup.elements.get("client-ip-hero").innerText, "9.9.9.9");
});

test("language selection persists, updates cached results and metadata, and works without storage", () => {
  const saved = new Map();
  const storage = {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value)
  };
  let calls = 0;
  const env = createDomStub({ storage, fetch: () => { calls++; } });
  vm.runInContext('initializeLanguage()', env.ctx);
  assert.equal(env.document.documentElement.lang, "vi");
  vm.runInContext(`renderUI({ip:"8.8.8.8",is_private:false,
    details:{isp:"Example ISP",latitude:0,longitude:0},
    security:{detection_status:"not_detected",is_hosting:true}})`, env.ctx);
  env.elements.get("language-select").onchange({ target: { value: "en" } });
  assert.equal(env.document.documentElement.lang, "en");
  assert.equal(saved.get("checkip-language"), "en");
  assert.equal(env.elements.get("client-ip-hero").innerText, "8.8.8.8");
  assert.equal(env.elements.get("detail-isp").innerText, "Example ISP");
  assert.equal(env.elements.get("detail-coords").innerText, "Coordinates: 0.000, 0.000");
  assert.equal(env.elements.get("vpn-badge-text").innerText, "No VPN/Proxy signals detected (Hosting IP)");
  assert.equal(calls, 0, "Switching language must not perform a lookup");
  const meta = env.document.querySelectorAll("[data-i18n-content]")
    .find(element => element.getAttribute("data-i18n-content") === "meta.language");
  assert.equal(meta.getAttribute("content"), "English");
  const schema = JSON.parse(env.elements.get("structured-data").textContent);
  assert.equal(schema["@graph"][0].inLanguage, "en");
  assert.equal(schema["@graph"][1].mainEntity[3].name, "How can I hide or change my IP address?");
  const reopened = createDomStub({ storage });
  vm.runInContext('initializeLanguage()', reopened.ctx);
  assert.equal(reopened.document.documentElement.lang, "en");
  vm.runInContext('setLanguage("vi")', env.ctx);
  assert.equal(env.elements.get("detail-coords").innerText, "Tọa độ: 0.000, 0.000");
  assert.equal(meta.getAttribute("content"), "Vietnamese");
  assert.equal(vm.runInContext('setLanguage("unsupported")', env.ctx), false);
  assert.equal(env.document.documentElement.lang, "vi");

  const blocked = createDomStub({ storage: {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); }
  }});
  vm.runInContext('initializeLanguage(); setLanguage("en"); renderErrorState()', blocked.ctx);
  assert.equal(blocked.document.documentElement.lang, "en");
  assert.equal(blocked.elements.get("client-ip-hero").innerText, "Unknown");
  vm.runInContext('setLanguage("vi")', blocked.ctx);
  assert.equal(blocked.elements.get("client-ip-hero").innerText, "Không xác định");
});

test("language changes during a lookup and clipboard operations use the current language", async () => {
  let resolve;
  let calls = 0;
  const env = createDomStub({
    fetch: () => { calls++; return new Promise(done => { resolve = done; }); },
    clipboard: { writeText: async () => {} }
  });
  const pending = vm.runInContext('fetchData()', env.ctx);
  vm.runInContext('setLanguage("en")', env.ctx);
  resolve(new Response(JSON.stringify({ ip: "192.168.1.2", is_private: true,
    details: {}, security: { detection_status: "not_applicable" } })));
  await pending;
  assert.equal(calls, 1);
  assert.equal(env.elements.get("hero-ip-label").innerText, "Your local IP address");
  assert.equal(env.elements.get("vpn-badge-text").innerText, "Local IP");
  await vm.runInContext('copyHeroIP()', env.ctx);
  assert.equal(env.elements.get("toast-message").innerText, "Copied: 192.168.1.2");
  vm.runInContext('clearTimeout(toastTimer)', env.ctx);
  env.sandbox.fetch = async () => { throw new Error("offline"); };
  await vm.runInContext('fetchData()', env.ctx);
  assert.equal(env.elements.get("hero-isp").innerText, "Unknown");
  assert.match(env.elements.get("toast-message").innerText, /^Could not load IP information:/);
  vm.runInContext('clearTimeout(toastTimer)', env.ctx);
});
