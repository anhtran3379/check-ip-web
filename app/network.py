import asyncio
import ipaddress
import time
from collections import OrderedDict
from typing import Callable, Optional
import httpx

CACHE_TTL = 3600.0  # 1 hour per successful lookup
CACHE_MAX_SIZE = 1024
LOOKUP_TIMEOUT = 4.0
PING_TIMEOUT = 2.0
MAX_UPSTREAM_CALLS_PER_MINUTE = 40
RATE_LIMIT_WINDOW = 60.0
DEFAULT_COOLDOWN_SECONDS = 60.0
MAX_COOLDOWN_SECONDS = 300.0

ALLOWED_PING_HOSTS = frozenset({"8.8.8.8", "1.1.1.1"})

KNOWN_VPN_HOSTS = (
    "m247", "datacamp", "ovh", "digitalocean", "linode", "vultr", "choopa",
    "hetzner", "leaseweb", "nordvpn", "expressvpn", "surfshark", "proton",
    "fastly", "amazon", "aws", "google llc", "microsoft", "azure", "cloudflare",
    "quadranet", "cogent", "zenlayer", "tzulo", "kamatera"
)

TIMEZONE_ALIASES = {
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
    "asia/rangoon": "Asia/Yangon",
}

_IPV4_CGNAT = ipaddress.IPv4Network("100.64.0.0/10")
_IPV4_IETF = ipaddress.IPv4Network("192.0.0.0/24")
_IPV4_TEST1 = ipaddress.IPv4Network("192.0.2.0/24")
_IPV4_6TO4_ANYCAST = ipaddress.IPv4Network("192.88.99.0/24")
_IPV4_BENCHMARK = ipaddress.IPv4Network("198.18.0.0/15")
_IPV4_TEST2 = ipaddress.IPv4Network("198.51.100.0/24")
_IPV4_TEST3 = ipaddress.IPv4Network("203.0.113.0/24")

_IPV6_GLOBAL_UNICAST = ipaddress.IPv6Network("2000::/3")
_IPV6_NAT64_WKP = ipaddress.IPv6Network("64:ff9b::/96")
_IPV6_IETF = ipaddress.IPv6Network("2001::/23")
_IPV6_IETF_PUBLIC_EXCEPTIONS = (
    ipaddress.IPv6Network("2001:1::1/128"),
    ipaddress.IPv6Network("2001:1::2/128"),
    ipaddress.IPv6Network("2001:1::3/128"),
    ipaddress.IPv6Network("2001:3::/32"),
    ipaddress.IPv6Network("2001:4:112::/48"),
    ipaddress.IPv6Network("2001:20::/28"),
    ipaddress.IPv6Network("2001:30::/28"),
)
_IPV6_BENCHMARK = ipaddress.IPv6Network("2001:2::/48")
_IPV6_DOC_1 = ipaddress.IPv6Network("2001:db8::/32")
_IPV6_DOC_2 = ipaddress.IPv6Network("3fff::/20")
_IPV6_6TO4 = ipaddress.IPv6Network("2002::/16")

# Injectable monotonic clock for deterministic testing
_clock: Callable[[], float] = time.monotonic

_geo_cache: OrderedDict[str, dict] = OrderedDict()
_request_timestamps: list[float] = []
_cooldown_until: float = 0.0


def set_clock(clock_fn: Optional[Callable[[], float]] = None) -> None:
    """Sets or resets the internal monotonic clock function (used by tests)."""
    global _clock
    _clock = clock_fn if clock_fn is not None else time.monotonic


def reset_lookup_state() -> None:
    """Clears lookup cache, rate-limit budget, and cooldown state."""
    global _cooldown_until
    _geo_cache.clear()
    _request_timestamps.clear()
    _cooldown_until = 0.0


def _classify_ipv4(addr: ipaddress.IPv4Address) -> tuple[bool, str]:
    packed = addr.packed
    a, b, _, d = packed[0], packed[1], packed[2], packed[3]
    if a == 0:
        return False, "unspecified"
    if a == 10:
        return False, "private"
    if addr in _IPV4_CGNAT:
        return False, "cgnat"
    if a == 127:
        return False, "loopback"
    if a == 169 and b == 254:
        return False, "link_local"
    if a == 172 and 16 <= b <= 31:
        return False, "private"
    if addr in _IPV4_IETF:
        # RFC 7723 (192.0.0.9/32 PCP Anycast) and RFC 8155 (192.0.0.10/32 TURN Anycast) are globally reachable
        if d in (9, 10):
            return True, "public"
        return False, "reserved"
    if addr in _IPV4_TEST1 or addr in _IPV4_TEST2 or addr in _IPV4_TEST3:
        return False, "documentation"
    if addr in _IPV4_6TO4_ANYCAST:
        return False, "reserved"
    if a == 192 and b == 168:
        return False, "private"
    if addr in _IPV4_BENCHMARK:
        return False, "benchmarking"
    if 224 <= a <= 239:
        return False, "multicast"
    if a >= 240:
        return False, "reserved"
    return True, "public"


def _classify_ipv6(addr: ipaddress.IPv6Address) -> tuple[bool, str]:
    if addr.is_unspecified:
        return False, "unspecified"
    if addr.is_loopback:
        return False, "loopback"
    if addr.ipv4_mapped is not None:
        return _classify_ipv4(addr.ipv4_mapped)

    w0 = (int(addr) >> 112) & 0xFFFF
    if (w0 & 0xFE00) == 0xFC00:
        return False, "private"
    if (w0 & 0xFFC0) == 0xFE80:
        return False, "link_local"
    if (w0 & 0xFF00) == 0xFF00:
        return False, "multicast"

    # RFC 6052 Well-Known Prefix 64:ff9b::/96 is globally reachable per IANA IPv6 Special-Purpose Registry
    # (unlike 64:ff9b:1::/48 RFC 8215 local-use translation prefix, which is not globally reachable)
    if addr in _IPV6_NAT64_WKP:
        return True, "public"

    # Outside 64:ff9b::/96, only IANA Global Unicast (2000::/3) can be globally reachable; all other blocks
    # (including ::/8, 64:ff9b:1::/48, 100::/64, 100:0:0:1::/64, 5f00::/16, fec0::/10, etc.) are reserved
    if addr not in _IPV6_GLOBAL_UNICAST:
        return False, "reserved"

    # Inside 2000::/3, evaluate more-specific special-purpose prefixes first
    if addr in _IPV6_IETF:
        if any(addr in net for net in _IPV6_IETF_PUBLIC_EXCEPTIONS):
            return True, "public"
        if addr in _IPV6_BENCHMARK:
            return False, "benchmarking"
        return False, "reserved"

    if addr in _IPV6_DOC_1 or addr in _IPV6_DOC_2:
        return False, "documentation"

    if addr in _IPV6_6TO4:
        return False, "reserved"

    return True, "public"


def classify_ip(raw_ip: object) -> dict:
    """Validates and classifies an IP string into public vs non-public/invalid."""
    if not isinstance(raw_ip, str):
        return {
            "is_valid": False,
            "ip": None,
            "version": None,
            "is_ipv6": False,
            "is_public": False,
            "is_private": False,
            "lookup_eligible": False,
            "category": "invalid",
        }

    if raw_ip != raw_ip.strip() or not raw_ip or "," in raw_ip or "%" in raw_ip or " " in raw_ip:
        return {
            "is_valid": False,
            "ip": None,
            "version": None,
            "is_ipv6": False,
            "is_public": False,
            "is_private": False,
            "lookup_eligible": False,
            "category": "invalid",
        }

    try:
        addr = ipaddress.ip_address(raw_ip)
    except ValueError:
        return {
            "is_valid": False,
            "ip": None,
            "version": None,
            "is_ipv6": False,
            "is_public": False,
            "is_private": False,
            "lookup_eligible": False,
            "category": "invalid",
        }

    if isinstance(addr, ipaddress.IPv4Address):
        is_pub, category = _classify_ipv4(addr)
        return {
            "is_valid": True,
            "ip": raw_ip,
            "version": 4,
            "is_ipv6": False,
            "is_public": is_pub,
            "is_private": not is_pub,
            "lookup_eligible": is_pub,
            "category": category,
        }

    is_pub, category = _classify_ipv6(addr)
    return {
        "is_valid": True,
        "ip": raw_ip,
        "version": 6,
        "is_ipv6": True,
        "is_public": is_pub,
        "is_private": not is_pub,
        "lookup_eligible": is_pub,
        "category": category,
    }


def is_private_ip(ip: object) -> bool:
    """Returns True if ip is a valid non-public IP; False if public or invalid."""
    info = classify_ip(ip)
    if not info["is_valid"]:
        return False
    return bool(info["is_private"])


def get_flag_emoji(country_code: Optional[str]) -> str:
    if not isinstance(country_code, str) or len(country_code) != 2 or not country_code.isascii() or not country_code.isalpha():
        return "🌐"
    return "".join(chr(127397 + ord(c)) for c in country_code.upper())


def parse_coordinate(val: object, min_val: float, max_val: float) -> Optional[float]:
    if val is None or isinstance(val, bool):
        return None
    if isinstance(val, str):
        if not val.strip():
            return None
        try:
            num = float(val)
        except ValueError:
            return None
    elif isinstance(val, (int, float)):
        num = float(val)
    else:
        return None

    if num != num or num == float("inf") or num == float("-inf"):
        return None
    if num < min_val or num > max_val:
        return None
    return num


def normalize_timezone(tz: object) -> Optional[str]:
    if not isinstance(tz, str):
        return None
    trimmed = tz.strip()
    if not trimmed:
        return None
    lower = trimmed.lower()
    if lower in TIMEZONE_ALIASES:
        return TIMEZONE_ALIASES[lower]
    # Basic structural validation for IANA timezone names (e.g. Region/City)
    if "/" in trimmed and not trimmed.startswith("/") and not trimmed.endswith("/") and " " not in trimmed:
        return trimmed
    return None


def matches_known_vpn_host(*texts: Optional[str]) -> bool:
    combined = " ".join(t for t in texts if isinstance(t, str) and t).lower()
    if not combined:
        return False
    return any(host in combined for host in KNOWN_VPN_HOSTS)


def build_empty_details() -> dict:
    return {
        "isp": None,
        "organization": None,
        "asn": None,
        "city": None,
        "region": None,
        "country": None,
        "country_code": None,
        "flag_emoji": "🌐",
        "latitude": None,
        "longitude": None,
        "timezone": None,
        "postal": None,
        "colo": None,
    }


def build_security_object(
    detection_status: str = "unknown",
    source: str = "none",
    reason: str = "unknown",
    is_hosting: bool = False,
) -> dict:
    hosting_flag = bool(is_hosting)
    if detection_status == "suspected":
        return {
            "is_vpn_or_proxy": True,
            "is_hosting": hosting_flag,
            "detection_status": "suspected",
            "source": source,
            "reason": reason,
            "confidence": "Cao",
            "type": "Có dấu hiệu VPN/Proxy (Kèm tín hiệu Hosting)" if hosting_flag else "Có dấu hiệu VPN/Proxy",
        }
    if detection_status == "not_detected":
        return {
            "is_vpn_or_proxy": False,
            "is_hosting": hosting_flag,
            "detection_status": "not_detected",
            "source": source,
            "reason": reason,
            "confidence": "Trung bình",
            "type": "Tín hiệu IP Hosting / Trung tâm dữ liệu" if hosting_flag else "Chưa phát hiện dấu hiệu VPN/Proxy",
        }
    if detection_status == "not_applicable":
        return {
            "is_vpn_or_proxy": False,
            "is_hosting": False,
            "detection_status": "not_applicable",
            "source": source,
            "reason": reason,
            "confidence": "Không áp dụng",
            "type": "IP nội bộ",
        }
    return {
        "is_vpn_or_proxy": False,
        "is_hosting": hosting_flag,
        "detection_status": "unknown",
        "source": source,
        "reason": reason,
        "confidence": "Không xác định",
        "type": "Tín hiệu IP Hosting (Chưa đủ dữ liệu VPN/Proxy)" if hosting_flag else "Chưa đủ dữ liệu để đánh giá",
    }


def _evict_expired_cache(now: float) -> None:
    expired_keys = [
        k for k, entry in _geo_cache.items()
        if (now - entry["time"]) >= entry.get("ttl", CACHE_TTL)
    ]
    for k in expired_keys:
        _geo_cache.pop(k, None)


def _store_cache(ip: str, details: dict, security: dict, now: float, ttl: float = CACHE_TTL) -> None:
    _evict_expired_cache(now)
    if ip in _geo_cache:
        _geo_cache.pop(ip, None)
    while len(_geo_cache) >= CACHE_MAX_SIZE:
        _geo_cache.popitem(last=False)
    _geo_cache[ip] = {
        "time": now,
        "ttl": ttl,
        "details": dict(details),
        "security": dict(security),
    }


def _parse_rate_limit_headers(headers: httpx.Headers, now: float, is_429: bool = False) -> None:
    global _cooldown_until
    rl_raw = headers.get("x-rl")
    ttl_raw = headers.get("x-ttl")

    rl_val: Optional[int] = None
    if rl_raw is not None:
        try:
            rl_val = int(rl_raw.strip())
        except ValueError:
            rl_val = None

    ttl_val: Optional[float] = None
    if ttl_raw is not None:
        try:
            parsed_ttl = float(ttl_raw.strip())
            if parsed_ttl == parsed_ttl and 1.0 <= parsed_ttl <= MAX_COOLDOWN_SECONDS:
                ttl_val = parsed_ttl
            elif parsed_ttl > MAX_COOLDOWN_SECONDS:
                ttl_val = MAX_COOLDOWN_SECONDS
        except ValueError:
            ttl_val = None

    if is_429 or (rl_val is not None and rl_val <= 0):
        cooldown = ttl_val if ttl_val is not None else DEFAULT_COOLDOWN_SECONDS
        _cooldown_until = max(_cooldown_until, now + cooldown)


def _consume_budget(now: float) -> bool:
    cutoff = now - RATE_LIMIT_WINDOW
    while _request_timestamps and _request_timestamps[0] <= cutoff:
        _request_timestamps.pop(0)
    if len(_request_timestamps) >= MAX_UPSTREAM_CALLS_PER_MINUTE:
        return False
    _request_timestamps.append(now)
    return True


def _clean_str(val: object) -> Optional[str]:
    if not isinstance(val, str):
        return None
    s = val.strip()
    return s if s else None


async def lookup_ip_info(ip: object) -> tuple[dict, dict]:
    """Queries ISP, Geolocation, and VPN/Proxy security details with strict validation and caching."""
    classification = classify_ip(ip)
    details = build_empty_details()

    if not classification["is_valid"]:
        return details, build_security_object(
            detection_status="unknown",
            source="none",
            reason="invalid_ip",
            is_hosting=False,
        )

    if not classification["lookup_eligible"]:
        return details, build_security_object(
            detection_status="not_applicable",
            source="local",
            reason="non_public_ip",
            is_hosting=False,
        )

    clean_ip = classification["ip"]
    now = _clock()
    _evict_expired_cache(now)

    if clean_ip in _geo_cache:
        entry = _geo_cache.pop(clean_ip)
        _geo_cache[clean_ip] = entry
        return dict(entry["details"]), dict(entry["security"])

    if now < _cooldown_until:
        return details, build_security_object(
            detection_status="unknown",
            source="none",
            reason="rate_limit_cooldown",
            is_hosting=False,
        )

    if not _consume_budget(now):
        return details, build_security_object(
            detection_status="unknown",
            source="none",
            reason="budget_exhausted",
            is_hosting=False,
        )

    url = (
        f"http://ip-api.com/json/{clean_ip}"
        "?fields=status,message,country,countryCode,city,regionName,zip,timezone,isp,org,as,proxy,hosting,lat,lon"
    )

    deadline_start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=LOOKUP_TIMEOUT) as client:
            remaining_timeout = max(0.001, LOOKUP_TIMEOUT - (time.monotonic() - deadline_start))
            async with asyncio.timeout(remaining_timeout):
                r = await client.get(url)
    except asyncio.CancelledError:
        raise
    except (httpx.TimeoutException, TimeoutError):
        return details, build_security_object(
            detection_status="unknown",
            source="none",
            reason="lookup_timeout",
            is_hosting=False,
        )
    except Exception:
        return details, build_security_object(
            detection_status="unknown",
            source="none",
            reason="lookup_network_error",
            is_hosting=False,
        )

    now_after = _clock()
    _parse_rate_limit_headers(r.headers, now_after, is_429=(r.status_code == 429))

    if r.status_code == 429:
        return details, build_security_object(
            detection_status="unknown",
            source="none",
            reason="lookup_rate_limited",
            is_hosting=False,
        )

    if r.status_code != 200:
        return details, build_security_object(
            detection_status="unknown",
            source="none",
            reason="lookup_http_error",
            is_hosting=False,
        )

    try:
        data = r.json()
    except Exception:
        return details, build_security_object(
            detection_status="unknown",
            source="none",
            reason="lookup_invalid_json",
            is_hosting=False,
        )

    if not isinstance(data, dict) or data.get("status") != "success":
        return details, build_security_object(
            detection_status="unknown",
            source="none",
            reason="lookup_status_fail",
            is_hosting=False,
        )

    details["isp"] = _clean_str(data.get("isp"))
    details["organization"] = _clean_str(data.get("org"))
    details["asn"] = _clean_str(data.get("as"))
    details["city"] = _clean_str(data.get("city"))
    details["region"] = _clean_str(data.get("regionName"))
    details["country"] = _clean_str(data.get("country"))

    raw_cc = _clean_str(data.get("countryCode"))
    if raw_cc and len(raw_cc) == 2 and raw_cc.isascii() and raw_cc.isalpha():
        details["country_code"] = raw_cc.upper()
    else:
        details["country_code"] = None

    details["flag_emoji"] = get_flag_emoji(details["country_code"])
    details["latitude"] = parse_coordinate(data.get("lat"), -90.0, 90.0)
    details["longitude"] = parse_coordinate(data.get("lon"), -180.0, 180.0)
    details["timezone"] = normalize_timezone(data.get("timezone"))
    details["postal"] = _clean_str(data.get("zip"))

    raw_proxy = data.get("proxy")
    raw_hosting = data.get("hosting")

    has_valid_proxy = isinstance(raw_proxy, bool)
    is_hosting_flag = raw_hosting is True
    asn_matched = matches_known_vpn_host(details["isp"], details["organization"], details["asn"])
    is_hosting = is_hosting_flag or asn_matched

    if not has_valid_proxy:
        security = build_security_object(
            detection_status="unknown",
            source="ip-api",
            reason="missing_proxy_flag_hosting_signal" if is_hosting else "missing_proxy_flag",
            is_hosting=is_hosting,
        )
        return details, security

    if raw_proxy is True:
        security = build_security_object(
            detection_status="suspected",
            source="ip-api",
            reason="proxy_and_hosting_detected" if is_hosting else "proxy_detected",
            is_hosting=is_hosting,
        )
    else:
        if is_hosting_flag:
            reason = "hosting_signal_only"
        elif asn_matched:
            reason = "asn_hosting_signal"
        else:
            reason = "no_proxy_signal"
        security = build_security_object(
            detection_status="not_detected",
            source="ip-api",
            reason=reason,
            is_hosting=is_hosting,
        )

    _store_cache(clean_ip, details, security, now_after)
    return details, security


def _abort_writer_transport(writer: object) -> None:
    try:
        transport = getattr(writer, "transport", None)
        if transport is not None and hasattr(transport, "abort") and callable(transport.abort):
            transport.abort()
    except Exception:
        pass


async def ping_latency(host: str = "8.8.8.8", port: int = 53, timeout: float = PING_TIMEOUT) -> float:
    """Measures async TCP connect latency to an allowed DNS host (8.8.8.8 or 1.1.1.1) on port 53."""
    if host not in ALLOWED_PING_HOSTS:
        return -1.0

    t0 = _clock()
    writer = None
    try:
        conn_coro = asyncio.open_connection(host, port)
        _, writer = await asyncio.wait_for(conn_coro, timeout=timeout)
        elapsed = round((_clock() - t0) * 1000.0, 1)
        return max(0.0, elapsed)
    except asyncio.CancelledError:
        raise
    except Exception:
        return -1.0
    finally:
        if writer is not None:
            try:
                writer.close()
            except Exception:
                _abort_writer_transport(writer)
            else:
                cleanup_timeout = min(0.2, max(0.005, float(timeout)))
                try:
                    await asyncio.wait_for(writer.wait_closed(), timeout=cleanup_timeout)
                except asyncio.CancelledError:
                    _abort_writer_transport(writer)
                    raise
                except Exception:
                    _abort_writer_transport(writer)
