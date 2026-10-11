let currentIP = "";
let activeRequestId = 0;
let activeAbortController = null;
let toastTimer = null;

const FETCH_TIMEOUT_MS = 6000;

const TIMEZONE_ALIASES = {
  "asia/saigon": "Asia/Ho_Chi_Minh",
  "asia/hanoi": "Asia/Ho_Chi_Minh",
  "asia/ho_chi_minh": "Asia/Ho_Chi_Minh",
  "etc/utc": "UTC",
  "etc/gmt": "UTC",
  "gmt": "UTC",
  "utc": "UTC",
  "us/eastern": "America/New_York",
  "us/pacific": "America/Los_Angeles",
  "us/central": "America/Chicago",
  "us/mountain": "America/Denver",
  "europe/kiev": "Europe/Kyiv",
  "asia/calcutta": "Asia/Kolkata",
  "asia/katmandu": "Asia/Kathmandu",
  "asia/rangoon": "Asia/Yangon"
};

function safeCreateIcons() {
  try {
    if (typeof lucide !== "undefined" && lucide && typeof lucide.createIcons === "function") {
      lucide.createIcons();
    }
  } catch {
    // Do not allow icon errors to block app execution
  }
}

function isValidIPv4(str) {
  if (typeof str !== "string") return false;
  const match = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/.exec(str);
  if (!match) return false;
  for (let i = 1; i <= 4; i++) {
    const n = Number(match[i]);
    if (n < 0 || n > 255) return false;
  }
  return true;
}

function isValidIPv6(str) {
  if (typeof str !== "string" || str.length === 0) return false;
  if (str.includes("%") || str.includes(" ")) return false;
  if ((str.startsWith(":") && !str.startsWith("::")) || (str.endsWith(":") && !str.endsWith("::"))) {
    return false;
  }

  let working = str;
  const lastColon = working.lastIndexOf(":");
  if (lastColon === -1) return false;

  const tail = working.slice(lastColon + 1);
  if (tail.includes(".")) {
    if (!isValidIPv4(tail)) return false;
    working = working.slice(0, lastColon + 1) + "0:0";
  }

  const parts = working.split("::");
  if (parts.length > 2) return false;

  if (parts.length === 2) {
    const left = parts[0] === "" ? [] : parts[0].split(":");
    const right = parts[1] === "" ? [] : parts[1].split(":");
    if (left.length + right.length >= 8) return false;
    const all = [...left, ...right];
    return all.every(g => /^[0-9a-fA-F]{1,4}$/.test(g));
  }

  const groups = working.split(":");
  if (groups.length !== 8) return false;
  return groups.every(g => /^[0-9a-fA-F]{1,4}$/.test(g));
}

function isValidIP(str) {
  if (typeof str !== "string") return false;
  if (str !== str.trim() || str.length === 0 || str.includes(",")) return false;
  return isValidIPv4(str) || isValidIPv6(str);
}

function normalizeTimezone(tz) {
  if (typeof tz !== "string") return null;
  const trimmed = tz.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(TIMEZONE_ALIASES, lower)) {
    return TIMEZONE_ALIASES[lower];
  }

  try {
    const resolved = new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).resolvedOptions().timeZone;
    if (resolved) {
      const resolvedLower = resolved.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(TIMEZONE_ALIASES, resolvedLower)) {
        return TIMEZONE_ALIASES[resolvedLower];
      }
      return resolved;
    }
    return trimmed;
  } catch {
    return null;
  }
}

function parseCoordinate(val, min, max) {
  if (val === null || val === undefined || typeof val === "boolean") return null;
  if (typeof val === "string" && val.trim() === "") return null;
  const num = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(num)) return null;
  if (num < min || num > max) return null;
  return num;
}

function parseUserAgent(uaString) {
  const ua = typeof uaString === "string" ? uaString : "";

  let browser = "Khác";
  if (ua.includes("OPR/") || ua.includes("Opera/") || ua.includes("OPiOS/")) {
    browser = "Opera";
  } else if (ua.includes("Edg/") || ua.includes("EdgA/") || ua.includes("EdgiOS/")) {
    browser = "Edge";
  } else if (ua.includes("Firefox/") || ua.includes("FxiOS/")) {
    browser = "Firefox";
  } else if (ua.includes("Chrome/") || ua.includes("CriOS/")) {
    browser = "Chrome";
  } else if (ua.includes("Safari/")) {
    browser = "Safari";
  }

  let os = "Khác";
  if (ua.includes("iPhone") || ua.includes("iPad") || ua.includes("iPod") || ua.includes("like Mac")) {
    os = "iOS";
  } else if (ua.includes("Android")) {
    os = "Android";
  } else if (ua.includes("Win")) {
    os = "Windows";
  } else if (ua.includes("Mac")) {
    os = "macOS";
  } else if (ua.includes("Linux")) {
    os = "Linux";
  }

  return { browser, os, label: `${browser} trên ${os}` };
}

function detectBrowserAndScreen() {
  const nav = typeof navigator !== "undefined" ? navigator : {};
  const parsed = parseUserAgent(nav.userAgent || "");

  const browserEl = typeof document !== "undefined" ? document.getElementById("detail-browser") : null;
  const screenEl = typeof document !== "undefined" ? document.getElementById("detail-screen") : null;

  if (browserEl) browserEl.innerText = parsed.label;
  if (screenEl) {
    const scr = typeof window !== "undefined" && window.screen ? window.screen : null;
    if (scr && typeof scr.width === "number" && typeof scr.height === "number") {
      screenEl.innerText = `Màn hình: ${scr.width} × ${scr.height} px`;
    } else {
      screenEl.innerText = "Màn hình: Không xác định";
    }
  }
}

function updateCurlUrls() {
  if (typeof window === "undefined" || !window.location || !window.location.origin) return;
  const origin = window.location.origin;
  const curlPlain = document.getElementById("curl-plain");
  const curlJson = document.getElementById("curl-json");
  if (curlPlain) curlPlain.innerText = `curl -s ${origin}/ip`;
  if (curlJson) curlJson.innerText = `curl -s ${origin}/api/json`;
}

async function fetchData() {
  const requestId = ++activeRequestId;

  if (activeAbortController) {
    try {
      activeAbortController.abort();
    } catch {
      // Ignore abort errors on previous controller
    }
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  activeAbortController = controller;

  const refreshIcon = typeof document !== "undefined" ? document.getElementById("refresh-icon") : null;
  if (refreshIcon && refreshIcon.classList) {
    refreshIcon.classList.add("animate-spin");
  }

  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    if (controller) {
      try {
        controller.abort();
      } catch {
        // Ignore
      }
    }
  }, FETCH_TIMEOUT_MS);

  try {
    const fetchOpts = { cache: "no-store" };
    if (controller) {
      fetchOpts.signal = controller.signal;
    }

    const res = await fetch("/api/info", fetchOpts);
    if (requestId !== activeRequestId) return;

    if (!res.ok) {
      throw new Error(`Lỗi phản hồi từ máy chủ (${res.status})`);
    }

    const data = await res.json();
    if (requestId !== activeRequestId) return;

    if (!data || typeof data !== "object" || data.status === "unavailable") {
      throw new Error("Thông tin IP hiện không khả dụng");
    }

    renderUI(data);
  } catch (err) {
    if (requestId !== activeRequestId) return;

    const isAbort = err && (err.name === "AbortError" || err.code === 20);
    if (isAbort && !timedOut) {
      return;
    }

    const msg = timedOut
      ? "Quá thời gian chờ phản hồi từ máy chủ"
      : (err && err.message ? err.message : "Lỗi kết nối mạng");

    renderErrorState();
    showToast("Không thể tải thông tin IP: " + msg);
  } finally {
    clearTimeout(timeoutId);
    if (requestId === activeRequestId) {
      activeAbortController = null;
      if (refreshIcon && refreshIcon.classList) {
        refreshIcon.classList.remove("animate-spin");
      }
    }
  }
}

function renderErrorState() {
  currentIP = "";

  const heroLabel = document.getElementById("hero-ip-label");
  if (heroLabel) heroLabel.innerText = "Địa chỉ IP kết nối của bạn";

  const heroIp = document.getElementById("client-ip-hero");
  if (heroIp) heroIp.innerText = "Không xác định";

  const typeBadge = document.getElementById("ip-type-badge");
  if (typeBadge) typeBadge.innerText = "Không xác định";

  const heroIsp = document.getElementById("hero-isp");
  if (heroIsp) heroIsp.innerText = "Không xác định";

  const heroFlag = document.getElementById("hero-flag");
  if (heroFlag) heroFlag.innerText = "🌐";

  const heroLocation = document.getElementById("hero-location");
  if (heroLocation) heroLocation.innerText = "Không xác định";

  const edgeBadge = document.getElementById("header-edge");
  if (edgeBadge) edgeBadge.innerText = "Không xác định";

  const detailIsp = document.getElementById("detail-isp");
  if (detailIsp) detailIsp.innerText = "Không xác định";

  const detailAsn = document.getElementById("detail-asn");
  if (detailAsn) detailAsn.innerText = "Không xác định";

  const detailCity = document.getElementById("detail-city");
  if (detailCity) detailCity.innerText = "Không xác định";

  const detailCountry = document.getElementById("detail-country");
  if (detailCountry) detailCountry.innerText = "🌐 Không xác định";

  const detailTz = document.getElementById("detail-tz");
  if (detailTz) detailTz.innerText = "Không xác định";

  const detailCoords = document.getElementById("detail-coords");
  if (detailCoords) detailCoords.innerText = "Tọa độ: Không xác định";

  renderSecurityStatus({}, { detection_status: "unknown", source: "none", reason: "fetch_error", is_hosting: false });
  safeCreateIcons();
}

function renderUI(data) {
  const rawIp = data && typeof data.ip === "string" ? data.ip.trim() : "";
  const validIp = isValidIP(rawIp) ? rawIp : "";
  currentIP = validIp;

  const isPrivate = Boolean(data && data.is_private === true);
  const details = (data && typeof data.details === "object" && data.details) ? data.details : {};
  const security = (data && typeof data.security === "object" && data.security) ? data.security : {};

  // Hero Label & IP
  const heroLabel = document.getElementById("hero-ip-label");
  if (heroLabel) {
    if (!validIp) {
      heroLabel.innerText = "Địa chỉ IP kết nối của bạn";
    } else if (isPrivate) {
      heroLabel.innerText = "Địa chỉ IP nội bộ (Local IP) của bạn";
    } else {
      heroLabel.innerText = "Địa chỉ IP công cộng (Public IP) của bạn";
    }
  }

  const heroIp = document.getElementById("client-ip-hero");
  if (heroIp) {
    heroIp.innerText = validIp || "Không xác định";
  }

  const typeBadge = document.getElementById("ip-type-badge");
  if (typeBadge) {
    if (!validIp) {
      typeBadge.innerText = "Không xác định";
    } else {
      const family = validIp.includes(":") ? "IPv6" : "IPv4";
      typeBadge.innerText = isPrivate ? `${family} (Nội bộ)` : family;
    }
  }

  const cleanIsp = typeof details.isp === "string" && details.isp.trim() ? details.isp.trim() : null;
  const cleanOrg = typeof details.organization === "string" && details.organization.trim() ? details.organization.trim() : null;
  const cleanAsn = typeof details.asn === "string" && details.asn.trim() ? details.asn.trim() : null;
  const cleanCity = typeof details.city === "string" && details.city.trim() ? details.city.trim() : null;
  const cleanCountry = typeof details.country === "string" && details.country.trim() ? details.country.trim() : null;
  const cleanFlag = typeof details.flag_emoji === "string" && details.flag_emoji.trim() ? details.flag_emoji.trim() : "🌐";

  const heroIsp = document.getElementById("hero-isp");
  if (heroIsp) {
    heroIsp.innerText = cleanIsp || (isPrivate ? "Mạng nội bộ" : "Không xác định");
  }

  const heroFlag = document.getElementById("hero-flag");
  if (heroFlag) {
    heroFlag.innerText = cleanFlag;
  }

  const heroLocation = document.getElementById("hero-location");
  if (heroLocation) {
    const locParts = [cleanCity, cleanCountry].filter(Boolean);
    if (locParts.length > 0) {
      heroLocation.innerText = locParts.join(", ");
    } else {
      heroLocation.innerText = isPrivate ? "Mạng nội bộ" : "Không xác định";
    }
  }

  // Edge Datacenter / Server Latency Badge
  const edgeBadge = document.getElementById("header-edge");
  if (edgeBadge) {
    const rawDc = (data && typeof data.datacenter === "string" && data.datacenter.trim())
      ? data.datacenter.trim()
      : (typeof details.colo === "string" && details.colo.trim() ? details.colo.trim() : null);

    if (rawDc) {
      const dcName = rawDc === "SGN" ? "TP.HCM (SGN)" : (rawDc === "HAN" ? "Hà Nội (HAN)" : rawDc);
      edgeBadge.innerText = `Edge: ${dcName}`;
    } else if (data && typeof data.latency_ms === "number" && Number.isFinite(data.latency_ms) && data.latency_ms >= 0) {
      edgeBadge.innerText = `TCP DNS: ${data.latency_ms} ms`;
    } else {
      edgeBadge.innerText = "Máy chủ trực tiếp";
    }
  }

  // Detail Cards
  const detailIsp = document.getElementById("detail-isp");
  if (detailIsp) {
    detailIsp.innerText = cleanIsp || (isPrivate ? "Mạng nội bộ" : "Không xác định");
  }

  const detailAsn = document.getElementById("detail-asn");
  if (detailAsn) {
    if (cleanAsn) {
      detailAsn.innerText = `Số hiệu mạng: ${cleanAsn}`;
    } else if (cleanOrg) {
      detailAsn.innerText = cleanOrg;
    } else {
      detailAsn.innerText = isPrivate ? "Không áp dụng" : "Không xác định";
    }
  }

  const detailCity = document.getElementById("detail-city");
  if (detailCity) {
    detailCity.innerText = cleanCity || (isPrivate ? "Nội bộ" : "Không xác định");
  }

  const detailCountry = document.getElementById("detail-country");
  if (detailCountry) {
    if (cleanCountry) {
      detailCountry.innerText = `${cleanFlag} ${cleanCountry}`;
    } else {
      detailCountry.innerText = isPrivate ? "🌐 Mạng nội bộ" : "🌐 Không xác định";
    }
  }

  const detailTz = document.getElementById("detail-tz");
  const normalizedIpTz = normalizeTimezone(details.timezone);
  if (detailTz) {
    detailTz.innerText = normalizedIpTz ? details.timezone.trim() : "Không xác định";
  }

  const detailCoords = document.getElementById("detail-coords");
  if (detailCoords) {
    const lat = parseCoordinate(details.latitude, -90, 90);
    const lon = parseCoordinate(details.longitude, -180, 180);
    if (lat !== null && lon !== null) {
      detailCoords.innerText = `Tọa độ: ${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    } else {
      detailCoords.innerText = "Tọa độ: Không xác định";
    }
  }

  renderSecurityStatus(details, security);
  safeCreateIcons();
}

function renderSecurityStatus(details, security) {
  const vpnBadge = document.getElementById("vpn-status-badge");
  const vpnText = document.getElementById("vpn-badge-text");
  const vpnIcon = document.getElementById("vpn-icon");
  const secCard = document.getElementById("security-card");
  const secTag = document.getElementById("sec-tag");
  const secDesc = document.getElementById("sec-desc");
  const secType = document.getElementById("sec-type");
  const secIconBg = document.getElementById("sec-icon-bg");
  const secMainIcon = document.getElementById("sec-main-icon");
  const tzAlert = document.getElementById("timezone-mismatch-alert");
  const tzAlertText = document.getElementById("tz-alert-text");

  // Auxiliary Timezone Comparison (never changes VPN detection status)
  let rawClientTz = null;
  try {
    rawClientTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    rawClientTz = null;
  }

  const rawIpTz = details && typeof details.timezone === "string" ? details.timezone.trim() : null;
  const normClientTz = normalizeTimezone(rawClientTz);
  const normIpTz = normalizeTimezone(rawIpTz);

  if (normClientTz && normIpTz && normClientTz !== normIpTz) {
    if (tzAlert) tzAlert.classList.remove("hidden");
    if (tzAlertText) {
      tzAlertText.innerText = `Thông tin phụ: Múi giờ thiết bị (${rawClientTz}) khác với múi giờ theo IP (${rawIpTz}).`;
    }
  } else if (tzAlert) {
    tzAlert.classList.add("hidden");
  }

  const validStatuses = ["unknown", "not_applicable", "not_detected", "suspected"];
  const rawStatus = security && typeof security.detection_status === "string" ? security.detection_status : "unknown";
  const status = validStatuses.includes(rawStatus) ? rawStatus : "unknown";
  const isHosting = Boolean(security && security.is_hosting === true);

  if (status === "suspected") {
    if (vpnBadge) {
      vpnBadge.className = "px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5";
    }
    if (vpnText) vpnText.innerText = "Có dấu hiệu VPN/Proxy";
    if (vpnIcon) {
      vpnIcon.setAttribute("data-lucide", "alert-triangle");
      vpnIcon.className = "w-3.5 h-3.5 text-amber-400";
    }
    if (secCard) {
      secCard.className = "glass-box rounded-2xl p-5 border-l-4 border-l-amber-500 flex flex-col md:flex-row md:items-center justify-between gap-4";
    }
    if (secTag) {
      secTag.innerText = "Có dấu hiệu VPN/Proxy";
      secTag.className = "text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30";
    }
    if (secDesc) {
      secDesc.innerText = "Dữ liệu tra cứu ghi nhận dấu hiệu kết nối qua VPN, Proxy hoặc nút mạng trung gian. Kết quả chỉ mang tính tham khảo kỹ thuật.";
    }
    if (secType) {
      secType.innerText = isHosting ? "Có dấu hiệu VPN/Proxy (Kèm tín hiệu Hosting)" : "Có dấu hiệu VPN/Proxy";
      secType.className = "text-amber-300 font-semibold";
    }
    if (secIconBg) {
      secIconBg.className = "p-2.5 rounded-xl bg-amber-500/10 text-amber-400 flex-shrink-0 mt-0.5";
    }
    if (secMainIcon) {
      secMainIcon.setAttribute("data-lucide", "shield-alert");
    }
    return;
  }

  if (status === "not_detected") {
    if (isHosting) {
      if (vpnBadge) {
        vpnBadge.className = "px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5";
      }
      if (vpnText) vpnText.innerText = "Chưa phát hiện dấu hiệu VPN/Proxy (IP Hosting)";
      if (vpnIcon) {
        vpnIcon.setAttribute("data-lucide", "server");
        vpnIcon.className = "w-3.5 h-3.5 text-cyan-400";
      }
      if (secCard) {
        secCard.className = "glass-box rounded-2xl p-5 border-l-4 border-l-cyan-500 flex flex-col md:flex-row md:items-center justify-between gap-4";
      }
      if (secTag) {
        secTag.innerText = "Tín hiệu IP Hosting";
        secTag.className = "text-[11px] font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30";
      }
      if (secDesc) {
        secDesc.innerText = "Chưa phát hiện dấu hiệu VPN/Proxy từ cờ proxy, nhưng địa chỉ IP thuộc dải trung tâm dữ liệu/hosting. Dữ liệu tra cứu có giới hạn, không thể kết luận chắc chắn.";
      }
      if (secType) {
        secType.innerText = "Tín hiệu IP Hosting / Trung tâm dữ liệu";
        secType.className = "text-cyan-300 font-semibold";
      }
      if (secIconBg) {
        secIconBg.className = "p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 flex-shrink-0 mt-0.5";
      }
      if (secMainIcon) {
        secMainIcon.setAttribute("data-lucide", "server");
      }
    } else {
      if (vpnBadge) {
        vpnBadge.className = "px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5";
      }
      if (vpnText) vpnText.innerText = "Chưa phát hiện dấu hiệu VPN/Proxy";
      if (vpnIcon) {
        vpnIcon.setAttribute("data-lucide", "info");
        vpnIcon.className = "w-3.5 h-3.5 text-indigo-400";
      }
      if (secCard) {
        secCard.className = "glass-box rounded-2xl p-5 border-l-4 border-l-indigo-500 flex flex-col md:flex-row md:items-center justify-between gap-4";
      }
      if (secTag) {
        secTag.innerText = "Chưa phát hiện dấu hiệu VPN/Proxy";
        secTag.className = "text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30";
      }
      if (secDesc) {
        secDesc.innerText = "Chưa phát hiện dấu hiệu VPN/Proxy trong dữ liệu tra cứu hiện tại. Kết quả có giới hạn theo cơ sở dữ liệu nguồn và không khẳng định tuyệt đối.";
      }
      if (secType) {
        secType.innerText = "Chưa phát hiện dấu hiệu VPN/Proxy";
        secType.className = "text-indigo-300 font-semibold";
      }
      if (secIconBg) {
        secIconBg.className = "p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 flex-shrink-0 mt-0.5";
      }
      if (secMainIcon) {
        secMainIcon.setAttribute("data-lucide", "info");
      }
    }
    return;
  }

  if (status === "not_applicable") {
    if (vpnBadge) {
      vpnBadge.className = "px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1.5";
    }
    if (vpnText) vpnText.innerText = "IP nội bộ";
    if (vpnIcon) {
      vpnIcon.setAttribute("data-lucide", "network");
      vpnIcon.className = "w-3.5 h-3.5 text-slate-400";
    }
    if (secCard) {
      secCard.className = "glass-box rounded-2xl p-5 border-l-4 border-l-slate-500 flex flex-col md:flex-row md:items-center justify-between gap-4";
    }
    if (secTag) {
      secTag.innerText = "IP nội bộ";
      secTag.className = "text-[11px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700";
    }
    if (secDesc) {
      secDesc.innerText = "Địa chỉ thuộc phạm vi mạng nội bộ hoặc dải đặc biệt; không áp dụng đánh giá VPN/Proxy công cộng.";
    }
    if (secType) {
      secType.innerText = "IP nội bộ";
      secType.className = "text-slate-300 font-semibold";
    }
    if (secIconBg) {
      secIconBg.className = "p-2.5 rounded-xl bg-slate-800 text-slate-400 flex-shrink-0 mt-0.5";
    }
    if (secMainIcon) {
      secMainIcon.setAttribute("data-lucide", "network");
    }
    return;
  }

  // Default: "unknown"
  if (vpnBadge) {
    vpnBadge.className = "px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1.5";
  }
  if (vpnText) vpnText.innerText = "Chưa đủ dữ liệu để đánh giá";
  if (vpnIcon) {
    vpnIcon.setAttribute("data-lucide", "help-circle");
    vpnIcon.className = "w-3.5 h-3.5 text-slate-400";
  }
  if (secCard) {
    secCard.className = "glass-box rounded-2xl p-5 border-l-4 border-l-slate-600 flex flex-col md:flex-row md:items-center justify-between gap-4";
  }
  if (secTag) {
    secTag.innerText = "Chưa đủ dữ liệu để đánh giá";
    secTag.className = "text-[11px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700";
  }
  if (secDesc) {
    secDesc.innerText = isHosting
      ? "Ghi nhận tín hiệu mạng lưu trữ (Hosting/ASN), nhưng chưa đủ dữ liệu tra cứu để đánh giá trạng thái VPN/Proxy."
      : "Chưa đủ dữ liệu để đánh giá trạng thái VPN/Proxy do thông tin tra cứu không đầy đủ hoặc tạm thời gián đoạn.";
  }
  if (secType) {
    secType.innerText = isHosting
      ? "Tín hiệu IP Hosting (Chưa đủ dữ liệu VPN/Proxy)"
      : "Chưa đủ dữ liệu để đánh giá";
    secType.className = "text-slate-300 font-semibold";
  }
  if (secIconBg) {
    secIconBg.className = "p-2.5 rounded-xl bg-slate-800 text-slate-400 flex-shrink-0 mt-0.5";
  }
  if (secMainIcon) {
    secMainIcon.setAttribute("data-lucide", "help-circle");
  }
}

function fallbackCopyToClipboard(text) {
  if (typeof document === "undefined" || !document.body || typeof document.createElement !== "function" || typeof document.execCommand !== "function") {
    return false;
  }

  let textarea = null;
  try {
    textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    if (typeof textarea.focus === "function") textarea.focus();
    if (typeof textarea.select === "function") textarea.select();
    const ok = Boolean(document.execCommand("copy"));
    return ok;
  } catch {
    return false;
  } finally {
    if (textarea && textarea.parentNode) {
      try {
        textarea.parentNode.removeChild(textarea);
      } catch {
        // Ignore removal errors
      }
    }
  }
}

async function copyText(text) {
  if (typeof text !== "string" || !text.trim()) {
    showToast("Không có dữ liệu hợp lệ để sao chép");
    return false;
  }

  const value = text.trim();

  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`Đã sao chép: ${value}`);
      return true;
    } catch {
      // Fall through to execCommand fallback
    }
  }

  const fallbackOk = fallbackCopyToClipboard(value);
  if (fallbackOk) {
    showToast(`Đã sao chép: ${value}`);
    return true;
  }

  showToast("Không thể sao chép tự động. Vui lòng sao chép thủ công.");
  return false;
}

function copyHeroIP() {
  if (!currentIP) {
    showToast("Chưa có địa chỉ IP hợp lệ để sao chép");
    return Promise.resolve(false);
  }
  return copyText(currentIP);
}

function showToast(message) {
  if (typeof document === "undefined") return;
  const toast = document.getElementById("toast");
  const toastMsg = document.getElementById("toast-message");
  if (!toast || !toastMsg) return;

  toastMsg.innerText = message;
  if (toast.classList) {
    toast.classList.remove("translate-y-20", "opacity-0");
    toast.classList.add("translate-y-0", "opacity-100");
  }

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (toast.classList) {
      toast.classList.remove("translate-y-0", "opacity-100");
      toast.classList.add("translate-y-20", "opacity-0");
    }
  }, 2500);
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("DOMContentLoaded", () => {
    safeCreateIcons();
    detectBrowserAndScreen();
    fetchData();
    updateCurlUrls();
  });
}
