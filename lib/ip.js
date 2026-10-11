// Shared IP validation, classification, timezone normalization, and security contract helpers

const KNOWN_VPN_HOSTS = [
  "m247", "datacamp", "ovh", "digitalocean", "linode", "vultr", "choopa",
  "hetzner", "leaseweb", "nordvpn", "expressvpn", "surfshark", "proton",
  "fastly", "amazon", "aws", "google llc", "microsoft", "azure", "cloudflare",
  "quadranet", "cogent", "zenlayer", "tzulo", "kamatera"
];

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

export function cleanStr(val) {
  if (typeof val !== "string") return null;
  const s = val.trim();
  return s.length > 0 ? s : null;
}

export function parseIPv4(str) {
  if (typeof str !== "string") return null;
  const match = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/.exec(str);
  if (!match) return null;
  const octets = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4])
  ];
  for (const n of octets) {
    if (n < 0 || n > 255) return null;
  }
  return octets;
}

export function parseIPv6(str) {
  if (typeof str !== "string" || str.length === 0) return null;
  if (str.includes("%") || str.includes(" ")) return null;
  if ((str.startsWith(":") && !str.startsWith("::")) || (str.endsWith(":") && !str.endsWith("::"))) {
    return null;
  }

  let working = str;
  const lastColon = working.lastIndexOf(":");
  if (lastColon === -1) return null;

  let ipv4Tail = null;
  const tailCandidate = working.slice(lastColon + 1);
  if (tailCandidate.includes(".")) {
    const v4 = parseIPv4(tailCandidate);
    if (!v4) return null;
    ipv4Tail = [
      ((v4[0] << 8) | v4[1]) >>> 0,
      ((v4[2] << 8) | v4[3]) >>> 0
    ];
    working = working.slice(0, lastColon + 1) + "0:0";
  }

  const doubleColonParts = working.split("::");
  if (doubleColonParts.length > 2) return null;

  let words = [];
  if (doubleColonParts.length === 2) {
    const leftRaw = doubleColonParts[0];
    const rightRaw = doubleColonParts[1];
    const left = leftRaw === "" ? [] : leftRaw.split(":");
    const right = rightRaw === "" ? [] : rightRaw.split(":");
    if (left.length + right.length >= 8) return null;
    const missing = 8 - (left.length + right.length);
    const combined = [...left, ...Array(missing).fill("0"), ...right];
    for (const group of combined) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      words.push(parseInt(group, 16));
    }
  } else {
    const groups = working.split(":");
    if (groups.length !== 8) return null;
    for (const group of groups) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      words.push(parseInt(group, 16));
    }
  }

  if (words.length !== 8) return null;
  if (ipv4Tail) {
    words[6] = ipv4Tail[0];
    words[7] = ipv4Tail[1];
  }
  return words;
}

function classifyIPv4Octets(octets) {
  const [a, b, c, d] = octets;
  if (a === 0) return { is_public: false, category: "unspecified" };
  if (a === 10) return { is_public: false, category: "private" };
  if (a === 100 && b >= 64 && b <= 127) return { is_public: false, category: "cgnat" };
  if (a === 127) return { is_public: false, category: "loopback" };
  if (a === 169 && b === 254) return { is_public: false, category: "link_local" };
  if (a === 172 && b >= 16 && b <= 31) return { is_public: false, category: "private" };
  if (a === 192 && b === 0 && c === 0) {
    if (d === 9 || d === 10) {
      return { is_public: true, category: "public" };
    }
    return { is_public: false, category: "reserved" };
  }
  if (a === 192 && b === 0 && c === 2) return { is_public: false, category: "documentation" };
  if (a === 192 && b === 88 && c === 99) return { is_public: false, category: "reserved" };
  if (a === 192 && b === 168) return { is_public: false, category: "private" };
  if (a === 198 && (b === 18 || b === 19)) return { is_public: false, category: "benchmarking" };
  if (a === 198 && b === 51 && c === 100) return { is_public: false, category: "documentation" };
  if (a === 203 && b === 0 && c === 113) return { is_public: false, category: "documentation" };
  if (a >= 224 && a <= 239) return { is_public: false, category: "multicast" };
  if (a >= 240) return { is_public: false, category: "reserved" };
  return { is_public: true, category: "public" };
}

function classifyIPv6Words(words) {
  const [w0, w1, w2, w3, w4, w5, w6, w7] = words;

  if (w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0 && w6 === 0 && w7 === 0) {
    return { is_public: false, category: "unspecified", mapped_ipv4: false };
  }
  if (w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0 && w6 === 0 && w7 === 1) {
    return { is_public: false, category: "loopback", mapped_ipv4: false };
  }
  if (w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0xffff) {
    const octets = [(w6 >> 8) & 0xff, w6 & 0xff, (w7 >> 8) & 0xff, w7 & 0xff];
    const v4Class = classifyIPv4Octets(octets);
    return {
      is_public: v4Class.is_public,
      category: v4Class.category,
      mapped_ipv4: true
    };
  }
  if ((w0 & 0xfe00) === 0xfc00) {
    return { is_public: false, category: "private", mapped_ipv4: false };
  }
  if ((w0 & 0xffc0) === 0xfe80) {
    return { is_public: false, category: "link_local", mapped_ipv4: false };
  }
  if ((w0 & 0xff00) === 0xff00) {
    return { is_public: false, category: "multicast", mapped_ipv4: false };
  }

  // RFC 6052 Well-Known Prefix 64:ff9b::/96 is globally reachable per IANA IPv6 Special-Purpose Registry
  // (unlike 64:ff9b:1::/48 RFC 8215 local-use translation prefix, which is not globally reachable)
  if (w0 === 0x0064 && w1 === 0xff9b && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0) {
    return { is_public: true, category: "public", mapped_ipv4: false };
  }

  // Outside 64:ff9b::/96, only IANA Global Unicast (2000::/3) can be globally reachable; all other blocks
  // (including ::/8, 64:ff9b:1::/48, 100::/64, 100:0:0:1::/64, 5f00::/16, fec0::/10, etc.) are reserved
  if ((w0 & 0xe000) !== 0x2000) {
    return { is_public: false, category: "reserved", mapped_ipv4: false };
  }

  // Inside 2000::/3, evaluate more-specific special-purpose prefixes first
  if (w0 === 0x2001 && w1 < 0x0200) {
    // 2001:1::1/128 (PCP Anycast), 2001:1::2/128 (TURN Anycast), and 2001:1::3/128 (DNS-SD SRP Anycast)
    if (w1 === 0x0001 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0 && w6 === 0 && (w7 === 1 || w7 === 2 || w7 === 3)) {
      return { is_public: true, category: "public", mapped_ipv4: false };
    }
    // 2001:3::/32 (AMT)
    if (w1 === 0x0003) {
      return { is_public: true, category: "public", mapped_ipv4: false };
    }
    // 2001:4:112::/48 (AS112-v6)
    if (w1 === 0x0004 && w2 === 0x0112) {
      return { is_public: true, category: "public", mapped_ipv4: false };
    }
    // 2001:20::/28 (ORCHIDv2) and 2001:30::/28 (DETs)
    if ((w1 & 0xfff0) === 0x0020 || (w1 & 0xfff0) === 0x0030) {
      return { is_public: true, category: "public", mapped_ipv4: false };
    }
    // 2001:2::/48 (Benchmarking)
    if (w1 === 0x0002 && w2 === 0x0000) {
      return { is_public: false, category: "benchmarking", mapped_ipv4: false };
    }
    return { is_public: false, category: "reserved", mapped_ipv4: false };
  }

  // 2001:db8::/32 (Documentation) and 3fff::/20 (RFC 9637 Documentation)
  if ((w0 === 0x2001 && w1 === 0x0db8) || (w0 === 0x3fff && (w1 & 0xf000) === 0x0000)) {
    return { is_public: false, category: "documentation", mapped_ipv4: false };
  }

  // 2002::/16 (6to4)
  if (w0 === 0x2002) {
    return { is_public: false, category: "reserved", mapped_ipv4: false };
  }

  return { is_public: true, category: "public", mapped_ipv4: false };
}

export function classifyIP(rawIp) {
  if (typeof rawIp !== "string") {
    return {
      is_valid: false,
      ip: null,
      version: null,
      is_ipv6: false,
      is_public: false,
      is_private: false,
      lookup_eligible: false,
      category: "invalid"
    };
  }

  if (rawIp !== rawIp.trim() || rawIp.length === 0 || rawIp.includes(",")) {
    return {
      is_valid: false,
      ip: null,
      version: null,
      is_ipv6: false,
      is_public: false,
      is_private: false,
      lookup_eligible: false,
      category: "invalid"
    };
  }

  const v4 = parseIPv4(rawIp);
  if (v4) {
    const res = classifyIPv4Octets(v4);
    return {
      is_valid: true,
      ip: rawIp,
      version: 4,
      is_ipv6: false,
      is_public: res.is_public,
      is_private: !res.is_public,
      lookup_eligible: res.is_public,
      category: res.category
    };
  }

  const v6 = parseIPv6(rawIp);
  if (v6) {
    const res = classifyIPv6Words(v6);
    return {
      is_valid: true,
      ip: rawIp,
      version: 6,
      is_ipv6: true,
      is_public: res.is_public,
      is_private: !res.is_public,
      lookup_eligible: res.is_public,
      category: res.category
    };
  }

  return {
    is_valid: false,
    ip: null,
    version: null,
    is_ipv6: false,
    is_public: false,
    is_private: false,
    lookup_eligible: false,
    category: "invalid"
  };
}

export function extractPagesClientIP(request) {
  const rawHeader = request && request.headers ? request.headers.get("cf-connecting-ip") : null;
  if (rawHeader === null || rawHeader === undefined || rawHeader === "") {
    return {
      ok: false,
      status_code: 503,
      reason: "missing_client_ip",
      classification: classifyIP(null)
    };
  }
  const classification = classifyIP(rawHeader);
  if (!classification.is_valid) {
    return {
      ok: false,
      status_code: 400,
      reason: "invalid_client_ip",
      classification
    };
  }
  return {
    ok: true,
    status_code: 200,
    reason: "ok",
    classification
  };
}

export function getFlagEmoji(countryCode) {
  if (typeof countryCode !== "string" || !/^[A-Za-z]{2}$/.test(countryCode)) {
    return "🌐";
  }
  const upper = countryCode.toUpperCase();
  if (upper === "XX") return "🌐";
  const codePoints = upper
    .split("")
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function parseCoordinate(val, min, max) {
  if (val === null || val === undefined || typeof val === "boolean") return null;
  if (typeof val === "string" && val.trim() === "") return null;
  const num = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(num)) return null;
  if (num < min || num > max) return null;
  return num;
}

export function normalizeTimezone(tz) {
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

export function matchesKnownVpnHost(...texts) {
  const combined = texts
    .filter(t => typeof t === "string" && t.length > 0)
    .join(" ")
    .toLowerCase();
  if (!combined) return false;
  return KNOWN_VPN_HOSTS.some(host => combined.includes(host));
}

export function buildEmptyDetails() {
  return {
    isp: null,
    organization: null,
    asn: null,
    city: null,
    region: null,
    country: null,
    country_code: null,
    flag_emoji: "🌐",
    latitude: null,
    longitude: null,
    timezone: null,
    postal: null,
    colo: null
  };
}

export function buildSecurityObject({
  detection_status = "unknown",
  source = "none",
  reason = "unknown",
  is_hosting = false
} = {}) {
  const hostingFlag = Boolean(is_hosting);
  if (detection_status === "suspected") {
    return {
      is_vpn_or_proxy: true,
      is_hosting: hostingFlag,
      detection_status: "suspected",
      source,
      reason,
      confidence: "Cao",
      type: hostingFlag ? "Có dấu hiệu VPN/Proxy (Kèm tín hiệu Hosting)" : "Có dấu hiệu VPN/Proxy"
    };
  }

  if (detection_status === "not_detected") {
    return {
      is_vpn_or_proxy: false,
      is_hosting: hostingFlag,
      detection_status: "not_detected",
      source,
      reason,
      confidence: "Trung bình",
      type: hostingFlag
        ? "Tín hiệu IP Hosting / Trung tâm dữ liệu"
        : "Chưa phát hiện dấu hiệu VPN/Proxy"
    };
  }

  if (detection_status === "not_applicable") {
    return {
      is_vpn_or_proxy: false,
      is_hosting: false,
      detection_status: "not_applicable",
      source,
      reason,
      confidence: "Không áp dụng",
      type: "IP nội bộ"
    };
  }

  return {
    is_vpn_or_proxy: false,
    is_hosting: hostingFlag,
    detection_status: "unknown",
    source,
    reason,
    confidence: "Không xác định",
    type: hostingFlag
      ? "Tín hiệu IP Hosting (Chưa đủ dữ liệu VPN/Proxy)"
      : "Chưa đủ dữ liệu để đánh giá"
  };
}
