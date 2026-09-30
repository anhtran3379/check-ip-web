import socket
import httpx
import time

# Cache for client IP geo lookups to ensure blazing fast response & prevent rate limits
_geo_cache = {}
CACHE_TTL = 3600  # 1 hour per IP

def is_private_ip(ip: str) -> bool:
    """Checks if an IP address is a private / local address."""
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

async def lookup_ip_info(ip: str) -> dict:
    """Queries ISP, Geolocation, and connection details for a specific client IP."""
    now = time.time()
    if ip in _geo_cache:
        cached_entry = _geo_cache[ip]
        if now - cached_entry["time"] < CACHE_TTL:
            return cached_entry["data"]

    # Fallback structure
    result = {
        "ip": ip,
        "is_private": is_private_ip(ip),
        "isp": "Local / Internal Network" if is_private_ip(ip) else "Unknown ISP",
        "organization": None,
        "city": "Nội bộ (Local)",
        "region": None,
        "country": "Mạng Cục Bộ" if is_private_ip(ip) else "Unknown",
        "country_code": "VN",
        "flag_emoji": "🇻🇳" if is_private_ip(ip) else "🌐",
        "latitude": None,
        "longitude": None,
        "timezone": "Asia/Ho_Chi_Minh",
        "postal": None,
        "type": "IPv6" if ":" in ip else "IPv4"
    }

    if is_private_ip(ip):
        return result

    # Query public provider
    async with httpx.AsyncClient(timeout=4.0) as client:
        try:
            r = await client.get(f"https://ipwho.is/{ip}")
            if r.status_code == 200:
                data = r.json()
                if data.get("success", True):
                    conn = data.get("connection", {})
                    result["isp"] = conn.get("isp") or data.get("isp") or "Unknown"
                    result["organization"] = conn.get("org") or data.get("org")
                    result["city"] = data.get("city") or "Unknown"
                    result["region"] = data.get("region") or ""
                    result["country"] = data.get("country") or "Unknown"
                    result["country_code"] = data.get("country_code") or ""
                    result["flag_emoji"] = data.get("flag", {}).get("emoji", "🌐")
                    result["latitude"] = data.get("latitude")
                    result["longitude"] = data.get("longitude")
                    result["timezone"] = data.get("timezone", {}).get("id") or "UTC"
                    result["postal"] = data.get("postal")
        except Exception:
            pass

    _geo_cache[ip] = {
        "time": now,
        "data": result
    }
    return result

async def ping_latency(host: str = "8.8.8.8") -> float:
    """Measures quick TCP connect latency in milliseconds."""
    t0 = time.perf_counter()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(2.0)
        s.connect((host, 53))
        s.close()
        return round((time.perf_counter() - t0) * 1000, 1)
    except Exception:
        return -1.0
