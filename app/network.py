import socket
import httpx
import time

_geo_cache = {}
CACHE_TTL = 3600  # 1 hour per IP

KNOWN_VPN_HOSTS = [
  "m247", "datacamp", "ovh", "digitalocean", "linode", "vultr", "choopa",
  "hetzner", "leaseweb", "nordvpn", "expressvpn", "surfshark", "proton",
  "fastly", "amazon", "aws", "google llc", "microsoft", "azure", "cloudflare warp",
  "quadranet", "cogent", "zenlayer", "tzulo", "kamatera"
]

def is_private_ip(ip: str) -> bool:
    if not ip:
        return True
    if ip in ("127.0.0.1", "::1", "localhost"):
        return True
    if ip.startswith("10.") or ip.startswith("192.168."):
        return True
    if ip.startswith("172."):
        parts = ip.split(".")
        if len(parts) >= 2 and parts[1].isdigit():
            val = int(parts[1])
            if 16 <= val <= 31:
                return True
    if ip.startswith("fe80:") or ip.startswith("fc00:") or ip.startswith("fd00:"):
        return True
    return False

def get_flag_emoji(country_code: str) -> str:
    if not country_code or len(country_code) != 2:
        return "🌐"
    return "".join(chr(127397 + ord(c)) for c in country_code.upper())

async def lookup_ip_info(ip: str) -> tuple[dict, dict]:
    """Queries ISP, Geolocation, and VPN/Proxy security details."""
    now = time.time()
    if ip in _geo_cache:
        cached_entry = _geo_cache[ip]
        if now - cached_entry["time"] < CACHE_TTL:
            return cached_entry["details"], cached_entry["security"]

    details = {
        "isp": "Local / Internal Network" if is_private_ip(ip) else "Unknown ISP",
        "asn": None,
        "city": "Nội bộ (Local)",
        "region": None,
        "country": "Mạng Cục Bộ" if is_private_ip(ip) else "Việt Nam",
        "country_code": "VN",
        "flag_emoji": "🇻🇳",
        "latitude": None,
        "longitude": None,
        "timezone": "Asia/Ho_Chi_Minh",
        "postal": None,
    }

    security = {
        "is_vpn_or_proxy": False,
        "is_hosting": False,
        "confidence": "Thấp",
        "type": "Mạng Cục Bộ / Dân Dụng (Residential)"
    }

    if is_private_ip(ip):
        return details, security

    async with httpx.AsyncClient(timeout=4.0) as client:
        try:
            url = f"http://ip-api.com/json/{ip}?fields=status,country,countryCode,city,regionName,timezone,isp,org,as,proxy,hosting,lat,lon"
            r = await client.get(url)
            if r.status_code == 200:
                data = r.json()
                if data.get("status") == "success":
                    details["isp"] = data.get("isp") or details["isp"]
                    details["asn"] = data.get("as")
                    details["city"] = data.get("city") or details["city"]
                    details["region"] = data.get("regionName") or ""
                    details["country"] = data.get("country") or details["country"]
                    details["country_code"] = data.get("countryCode") or "VN"
                    details["flag_emoji"] = get_flag_emoji(details["country_code"])
                    details["latitude"] = data.get("lat")
                    details["longitude"] = data.get("lon")
                    details["timezone"] = data.get("timezone") or "Asia/Ho_Chi_Minh"

                    # Check VPN / Proxy flags
                    is_proxy = data.get("proxy", False)
                    is_hosting = data.get("hosting", False)

                    # Also check against known VPN hosts
                    isp_str = f"{data.get('isp', '')} {data.get('org', '')} {data.get('as', '')}".lower()
                    matched_host = any(h in isp_str for h in KNOWN_VPN_HOSTS)

                    if is_proxy or is_hosting or matched_host:
                        security["is_vpn_or_proxy"] = True
                        security["is_hosting"] = is_hosting or matched_host
                        security["confidence"] = "Rất cao" if is_proxy else "Cao"
                        security["type"] = "VPN / Proxy / Máy chủ Hosting"
        except Exception:
            pass

    _geo_cache[ip] = {
        "time": now,
        "details": details,
        "security": security
    }
    return details, security

async def ping_latency(host: str = "8.8.8.8") -> float:
    t0 = time.perf_counter()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(2.0)
        s.connect((host, 53))
        s.close()
        return round((time.perf_counter() - t0) * 1000, 1)
    except Exception:
        return -1.0
