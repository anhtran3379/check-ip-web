import {
  cleanStr,
  extractPagesClientIP,
  getFlagEmoji,
  parseCoordinate,
  normalizeTimezone,
  matchesKnownVpnHost,
  buildEmptyDetails,
  buildSecurityObject
} from "../../lib/ip.js";

const CACHE_TTL_MS = 3600 * 1000;
const DEFAULT_CACHE_MAX_SIZE = 1024;
const DEFAULT_LOOKUP_TIMEOUT_MS = 4000;
const MAX_UPSTREAM_CALLS_PER_MINUTE = 40;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_COOLDOWN_MS = 60 * 1000;
const MAX_COOLDOWN_MS = 300 * 1000;

let _clock = () => Date.now();
let _cacheMaxSize = DEFAULT_CACHE_MAX_SIZE;
let _lookupTimeoutMs = DEFAULT_LOOKUP_TIMEOUT_MS;
const _isolateCache = new Map();
const _requestTimestamps = [];
let _cooldownUntil = 0;

export function setClock(clockFn) {
  _clock = typeof clockFn === "function" ? clockFn : () => Date.now();
}

export function setTestConfig({ cacheMaxSize, lookupTimeoutMs } = {}) {
  if (typeof cacheMaxSize === "number" && cacheMaxSize >= 1) {
    _cacheMaxSize = cacheMaxSize;
  }
  if (typeof lookupTimeoutMs === "number" && lookupTimeoutMs >= 1) {
    _lookupTimeoutMs = lookupTimeoutMs;
  }
}

export function resetPagesLookupState() {
  _isolateCache.clear();
  _requestTimestamps.length = 0;
  _cooldownUntil = 0;
  _cacheMaxSize = DEFAULT_CACHE_MAX_SIZE;
  _lookupTimeoutMs = DEFAULT_LOOKUP_TIMEOUT_MS;
}

function evictExpiredCache(now) {
  for (const [key, entry] of _isolateCache.entries()) {
    if (now - entry.time >= entry.ttlMs) {
      _isolateCache.delete(key);
    }
  }
}

function storeIsolateCache(ip, upstreamData, now, ttlMs = CACHE_TTL_MS) {
  evictExpiredCache(now);
  if (_isolateCache.has(ip)) {
    _isolateCache.delete(ip);
  }
  while (_isolateCache.size >= _cacheMaxSize) {
    const oldestKey = _isolateCache.keys().next().value;
    if (oldestKey === undefined) break;
    _isolateCache.delete(oldestKey);
  }
  _isolateCache.set(ip, {
    time: now,
    ttlMs,
    data: JSON.parse(JSON.stringify(upstreamData))
  });
}

function consumeIsolateBudget(now) {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  while (_requestTimestamps.length > 0 && _requestTimestamps[0] <= cutoff) {
    _requestTimestamps.shift();
  }
  if (_requestTimestamps.length >= MAX_UPSTREAM_CALLS_PER_MINUTE) {
    return false;
  }
  _requestTimestamps.push(now);
  return true;
}

function parseRateLimitHeaders(headers, now, is429 = false) {
  if (!headers || typeof headers.get !== "function") {
    if (is429) {
      _cooldownUntil = Math.max(_cooldownUntil, now + DEFAULT_COOLDOWN_MS);
    }
    return;
  }

  const rlRaw = headers.get("x-rl");
  const ttlRaw = headers.get("x-ttl");

  let rlVal = null;
  if (rlRaw !== null && rlRaw !== undefined && String(rlRaw).trim() !== "") {
    const parsedRl = Number(String(rlRaw).trim());
    if (Number.isInteger(parsedRl)) {
      rlVal = parsedRl;
    }
  }

  let ttlMs = null;
  if (ttlRaw !== null && ttlRaw !== undefined && String(ttlRaw).trim() !== "") {
    const parsedTtl = Number(String(ttlRaw).trim());
    if (Number.isFinite(parsedTtl) && parsedTtl >= 1) {
      const clampedSec = Math.min(parsedTtl, MAX_COOLDOWN_MS / 1000);
      ttlMs = clampedSec * 1000;
    }
  }

  if (is429 || (rlVal !== null && rlVal <= 0)) {
    const cooldown = ttlMs !== null ? ttlMs : DEFAULT_COOLDOWN_MS;
    _cooldownUntil = Math.max(_cooldownUntil, now + cooldown);
  }
}

function populateFromCloudflare(details, cf) {
  if (!cf || typeof cf !== "object") return;

  const org = cleanStr(cf.asOrganization);
  if (org) {
    details.isp = org;
    details.organization = org;
  }

  if (typeof cf.asn === "number" && Number.isFinite(cf.asn) && cf.asn > 0) {
    details.asn = `AS${cf.asn}`;
  } else {
    const asnStr = cleanStr(cf.asn);
    if (asnStr) {
      details.asn = asnStr.toUpperCase().startsWith("AS") ? asnStr : `AS${asnStr}`;
    }
  }

  const city = cleanStr(cf.city);
  if (city) details.city = city;

  const region = cleanStr(cf.region);
  if (region) details.region = region;

  const cc = cleanStr(cf.country);
  if (cc && /^[A-Za-z]{2}$/.test(cc) && cc.toUpperCase() !== "XX") {
    details.country_code = cc.toUpperCase();
    details.country = details.country_code;
    details.flag_emoji = getFlagEmoji(details.country_code);
  }

  const lat = parseCoordinate(cf.latitude, -90, 90);
  const lon = parseCoordinate(cf.longitude, -180, 180);
  if (lat !== null && lon !== null) {
    details.latitude = lat;
    details.longitude = lon;
  }

  const tz = normalizeTimezone(cf.timezone);
  if (tz) details.timezone = tz;

  const postal = cleanStr(cf.postalCode);
  if (postal) details.postal = postal;

  const colo = cleanStr(cf.colo);
  if (colo) details.colo = colo;
}

function applyUpstreamData(details, data) {
  const isp = cleanStr(data.isp);
  if (isp) details.isp = isp;

  const org = cleanStr(data.org);
  if (org) details.organization = org;

  const asn = cleanStr(data.as);
  if (asn) details.asn = asn;

  const city = cleanStr(data.city);
  if (city) details.city = city;

  const region = cleanStr(data.regionName);
  if (region) details.region = region;

  const country = cleanStr(data.country);
  if (country) details.country = country;

  const cc = cleanStr(data.countryCode);
  if (cc && /^[A-Za-z]{2}$/.test(cc) && cc.toUpperCase() !== "XX") {
    details.country_code = cc.toUpperCase();
    details.flag_emoji = getFlagEmoji(details.country_code);
  }

  const lat = parseCoordinate(data.lat, -90, 90);
  const lon = parseCoordinate(data.lon, -180, 180);
  if (lat !== null && lon !== null) {
    details.latitude = lat;
    details.longitude = lon;
  }

  const tz = normalizeTimezone(data.timezone);
  if (tz) details.timezone = tz;

  const zip = cleanStr(data.zip);
  if (zip) details.postal = zip;

  const rawProxy = data.proxy;
  const rawHosting = data.hosting;
  const hasValidProxy = typeof rawProxy === "boolean";
  const isHostingFlag = rawHosting === true;
  const asnMatched = matchesKnownVpnHost(details.isp, details.organization, details.asn);
  const isHosting = isHostingFlag || asnMatched;

  if (!hasValidProxy) {
    return {
      cacheable: false,
      security: buildSecurityObject({
        detection_status: "unknown",
        source: "ip-api",
        reason: isHosting ? "missing_proxy_flag_hosting_signal" : "missing_proxy_flag",
        is_hosting: isHosting
      })
    };
  }

  if (rawProxy === true) {
    return {
      cacheable: true,
      security: buildSecurityObject({
        detection_status: "suspected",
        source: "ip-api",
        reason: isHosting ? "proxy_and_hosting_detected" : "proxy_detected",
        is_hosting: isHosting
      })
    };
  }

  const reason = isHostingFlag
    ? "hosting_signal_only"
    : (asnMatched ? "asn_hosting_signal" : "no_proxy_signal");

  return {
    cacheable: true,
    security: buildSecurityObject({
      detection_status: "not_detected",
      source: "ip-api",
      reason,
      is_hosting: isHosting
    })
  };
}

function buildFallbackSecurityFromCf(details, failureReason) {
  const asnMatched = matchesKnownVpnHost(details.isp, details.organization, details.asn);
  return buildSecurityObject({
    detection_status: "unknown",
    source: asnMatched ? "asn_heuristic" : "none",
    reason: failureReason,
    is_hosting: asnMatched
  });
}

export async function onRequest(context) {
  const { request } = context;
  const cf = (request && request.cf) || {};
  const colo = cleanStr(cf.colo);

  const extracted = extractPagesClientIP(request);
  if (!extracted.ok) {
    const errorPayload = {
      status: "unavailable",
      ip: null,
      is_ipv6: false,
      is_private: false,
      details: buildEmptyDetails(),
      security: buildSecurityObject({
        detection_status: "unknown",
        source: "none",
        reason: extracted.reason,
        is_hosting: false
      }),
      datacenter: colo,
      user_agent: (request && request.headers && request.headers.get("user-agent")) || "Unknown",
      timestamp: new Date(_clock()).toISOString()
    };

    return new Response(JSON.stringify(errorPayload), {
      status: extracted.status_code,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store, max-age=0"
      }
    });
  }

  const { classification } = extracted;
  const clientIP = classification.ip;
  const details = buildEmptyDetails();
  details.colo = colo;

  if (!classification.lookup_eligible) {
    const localPayload = {
      status: "success",
      ip: clientIP,
      is_ipv6: classification.is_ipv6,
      is_private: true,
      details,
      security: buildSecurityObject({
        detection_status: "not_applicable",
        source: "local",
        reason: "non_public_ip",
        is_hosting: false
      }),
      datacenter: colo,
      user_agent: (request && request.headers && request.headers.get("user-agent")) || "Unknown",
      timestamp: new Date(_clock()).toISOString()
    };

    return new Response(JSON.stringify(localPayload), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store, max-age=0"
      }
    });
  }

  populateFromCloudflare(details, cf);

  const now = _clock();
  evictExpiredCache(now);

  let security = null;
  const cacheAdapter = (context && context.cache) || null;
  const cacheKeyUrl = `https://cache.check-ip.internal/ip-api/${encodeURIComponent(clientIP)}`;

  if (request && request.signal && request.signal.aborted) {
    throw request.signal.reason || new DOMException("Aborted", "AbortError");
  }

  if (_isolateCache.has(clientIP)) {
    const cached = _isolateCache.get(clientIP);
    _isolateCache.delete(clientIP);
    _isolateCache.set(clientIP, cached);
    const evalResult = applyUpstreamData(details, cached.data);
    security = evalResult.security;
  } else if (cacheAdapter && typeof cacheAdapter.match === "function") {
    try {
      const cachedRes = await cacheAdapter.match(cacheKeyUrl);
      if (request && request.signal && request.signal.aborted) {
        throw request.signal.reason || new DOMException("Aborted", "AbortError");
      }
      if (cachedRes && cachedRes.ok) {
        const cachedData = await cachedRes.json();
        if (request && request.signal && request.signal.aborted) {
          throw request.signal.reason || new DOMException("Aborted", "AbortError");
        }
        if (cachedData && cachedData.status === "success" && typeof cachedData.proxy === "boolean") {
          const nowAfterCache = _clock();
          let remainingTtlMs = CACHE_TTL_MS;
          if (cachedRes.headers && typeof cachedRes.headers.get === "function") {
            const cachedAtRaw = cachedRes.headers.get("x-cached-at");
            const ageRaw = cachedRes.headers.get("age");
            if (cachedAtRaw !== null && cachedAtRaw !== undefined && String(cachedAtRaw).trim() !== "") {
              const cachedAt = Number(String(cachedAtRaw).trim());
              if (Number.isFinite(cachedAt)) {
                remainingTtlMs = CACHE_TTL_MS - Math.max(0, nowAfterCache - cachedAt);
              }
            } else if (ageRaw !== null && ageRaw !== undefined && String(ageRaw).trim() !== "") {
              const ageSec = Number(String(ageRaw).trim());
              if (Number.isFinite(ageSec) && ageSec >= 0) {
                remainingTtlMs = CACHE_TTL_MS - ageSec * 1000;
              }
            }
          }
          if (remainingTtlMs > 0) {
            storeIsolateCache(clientIP, cachedData, nowAfterCache, Math.min(CACHE_TTL_MS, remainingTtlMs));
            const evalResult = applyUpstreamData(details, cachedData);
            security = evalResult.security;
          }
        }
      }
    } catch (cacheErr) {
      if (request && request.signal && request.signal.aborted) {
        throw cacheErr && cacheErr.name === "AbortError"
          ? cacheErr
          : new DOMException("Aborted", "AbortError");
      }
      // Ignore cache adapter read errors
    }
  }

  if (!security) {
    if (now < _cooldownUntil) {
      security = buildFallbackSecurityFromCf(details, "rate_limit_cooldown");
    } else if (!consumeIsolateBudget(now)) {
      security = buildFallbackSecurityFromCf(details, "budget_exhausted");
    } else {
      const apiUrl = `http://ip-api.com/json/${clientIP}?fields=status,message,country,countryCode,city,regionName,zip,timezone,isp,org,as,proxy,hosting,lat,lon`;
      const controller = new AbortController();
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort(new DOMException("Lookup timed out", "AbortError"));
      }, _lookupTimeoutMs);

      const onRequestAbort = () => {
        controller.abort(request.signal.reason || new DOMException("Aborted", "AbortError"));
      };

      if (request && request.signal) {
        if (request.signal.aborted) {
          clearTimeout(timer);
          throw request.signal.reason || new DOMException("Aborted", "AbortError");
        }
        request.signal.addEventListener("abort", onRequestAbort, { once: true });
      }

      try {
        const fetchFn = (context && context.fetch) || globalThis.fetch;
        const res = await fetchFn(apiUrl, { signal: controller.signal });

        if (request && request.signal && request.signal.aborted && !timedOut) {
          throw request.signal.reason || new DOMException("Aborted", "AbortError");
        }
        if (timedOut || controller.signal.aborted) {
          throw new DOMException("Lookup timed out", "AbortError");
        }

        const nowAfter = _clock();
        parseRateLimitHeaders(res.headers, nowAfter, res.status === 429);

        if (res.status === 429) {
          security = buildFallbackSecurityFromCf(details, "lookup_rate_limited");
        } else if (res.status !== 200) {
          security = buildFallbackSecurityFromCf(details, "lookup_http_error");
        } else {
          let data = null;
          try {
            data = await res.json();
          } catch (jsonErr) {
            if (request && request.signal && request.signal.aborted && !timedOut) {
              throw jsonErr && jsonErr.name === "AbortError"
                ? jsonErr
                : new DOMException("Aborted", "AbortError");
            }
            if (timedOut || controller.signal.aborted || (jsonErr && jsonErr.name === "AbortError")) {
              throw jsonErr && jsonErr.name === "AbortError"
                ? jsonErr
                : new DOMException("Lookup timed out", "AbortError");
            }
            security = buildFallbackSecurityFromCf(details, "lookup_invalid_json");
          }

          if (!security) {
            if (request && request.signal && request.signal.aborted && !timedOut) {
              throw request.signal.reason || new DOMException("Aborted", "AbortError");
            }
            if (timedOut || controller.signal.aborted) {
              throw new DOMException("Lookup timed out", "AbortError");
            }

            const nowAfterBody = _clock();
            if (!data || typeof data !== "object" || data.status !== "success") {
              security = buildFallbackSecurityFromCf(details, "lookup_status_fail");
            } else {
              const evalResult = applyUpstreamData(details, data);
              security = evalResult.security;
              if (evalResult.cacheable) {
                storeIsolateCache(clientIP, data, nowAfterBody);
                if (cacheAdapter && typeof cacheAdapter.put === "function") {
                  try {
                    const cacheRes = new Response(JSON.stringify(data), {
                      headers: {
                        "Content-Type": "application/json",
                        "Cache-Control": "public, max-age=3600",
                        "X-Cached-At": String(nowAfterBody)
                      }
                    });
                    await cacheAdapter.put(cacheKeyUrl, cacheRes);
                  } catch {
                    // Ignore cache adapter write errors
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        if (request && request.signal && request.signal.aborted && !timedOut) {
          throw err && err.name === "AbortError"
            ? err
            : new DOMException("Aborted", "AbortError");
        }
        if (timedOut || controller.signal.aborted || (err && err.name === "AbortError")) {
          security = buildFallbackSecurityFromCf(details, "lookup_timeout");
        } else {
          security = buildFallbackSecurityFromCf(details, "lookup_network_error");
        }
      } finally {
        clearTimeout(timer);
        if (request && request.signal) {
          request.signal.removeEventListener("abort", onRequestAbort);
        }
      }
    }
  }

  const responseData = {
    status: "success",
    ip: clientIP,
    is_ipv6: classification.is_ipv6,
    is_private: false,
    details,
    security,
    datacenter: details.colo,
    user_agent: (request && request.headers && request.headers.get("user-agent")) || "Unknown",
    timestamp: new Date(_clock()).toISOString()
  };

  return new Response(JSON.stringify(responseData), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
