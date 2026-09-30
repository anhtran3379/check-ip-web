import socket
import psutil
import httpx
import subprocess
import json
import time

def get_hostname() -> str:
    try:
        return socket.gethostname()
    except Exception:
        return "Unknown"

def get_primary_local_ip() -> str:
    """Finds the primary outbound local IPv4 address."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Does not actually transmit packets, just resolves route
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def get_default_gateway() -> str:
    """Attempts to retrieve the default gateway on Windows or fallback."""
    try:
        cmd = "Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Select-Object -First 1 -ExpandProperty NextHop"
        out = subprocess.check_output(["powershell", "-NoProfile", "-Command", cmd], text=True, timeout=2).strip()
        if out:
            return out
    except Exception:
        pass
    return "Unavailable"

def get_network_interfaces() -> list:
    """Extracts clean list of network interfaces with IPv4, IPv6, MAC, and status."""
    stats = psutil.net_if_stats()
    addrs = psutil.net_if_addrs()
    interfaces = []

    for name, addr_list in addrs.items():
        stat = stats.get(name)
        is_up = stat.isup if stat else False
        speed = stat.speed if stat else 0

        ipv4_list = []
        ipv6_list = []
        mac_address = None

        for item in addr_list:
            # Address family mapping
            # AF_INET = 2 (IPv4)
            # AF_INET6 = 23 on Windows (or socket.AF_INET6)
            # AF_LINK = -1 on Windows (MAC address)
            fam = item.family
            if fam == socket.AF_INET:
                ipv4_list.append({
                    "ip": item.address,
                    "netmask": item.netmask,
                    "broadcast": item.broadcast
                })
            elif fam == getattr(socket, 'AF_INET6', 23):
                # Clean scope id if present (e.g., fe80::...%12)
                clean_ip = item.address.split('%')[0]
                ipv6_list.append({
                    "ip": clean_ip,
                    "netmask": item.netmask
                })
            elif fam == psutil.AF_LINK or str(fam) == "-1":
                mac_address = item.address

        # Only list if it has at least an IP or is UP or MAC is known
        interfaces.append({
            "name": name,
            "is_up": is_up,
            "speed_mbps": speed,
            "mac": mac_address or "N/A",
            "ipv4": ipv4_list,
            "ipv6": ipv6_list,
            "is_primary": any(ip_info["ip"] == get_primary_local_ip() for ip_info in ipv4_list)
        })

    # Sort so active/primary interfaces come first
    interfaces.sort(key=lambda x: (not x["is_primary"], not x["is_up"], x["name"]))
    return interfaces

async def get_public_ip_info() -> dict:
    """Queries public IPv4, IPv6, and ISP/Geo information."""
    result = {
        "ipv4": None,
        "ipv6": None,
        "isp": None,
        "organization": None,
        "city": None,
        "region": None,
        "country": None,
        "country_code": None,
        "flag_emoji": "",
        "latitude": None,
        "longitude": None,
        "timezone": None,
        "error": None
    }

    async with httpx.AsyncClient(timeout=4.0) as client:
        # Try fetching full geo & ISP info first from ipwho.is
        try:
            r = await client.get("https://ipwho.is/")
            if r.status_code == 200:
                data = r.json()
                if data.get("success", True):
                    fetched_ip = data.get("ip")
                    if ":" in fetched_ip:
                        result["ipv6"] = fetched_ip
                    else:
                        result["ipv4"] = fetched_ip
                    
                    conn = data.get("connection", {})
                    result["isp"] = conn.get("isp") or data.get("isp")
                    result["organization"] = conn.get("org") or data.get("org")
                    result["city"] = data.get("city")
                    result["region"] = data.get("region")
                    result["country"] = data.get("country")
                    result["country_code"] = data.get("country_code")
                    result["flag_emoji"] = data.get("flag", {}).get("emoji", "")
                    result["latitude"] = data.get("latitude")
                    result["longitude"] = data.get("longitude")
                    result["timezone"] = data.get("timezone", {}).get("id")
        except Exception as e:
            result["error"] = str(e)

        # If IPv4 is missing, fetch from api4.ipify.org
        if not result["ipv4"]:
            try:
                r_v4 = await client.get("https://api4.ipify.org?format=json")
                if r_v4.status_code == 200:
                    result["ipv4"] = r_v4.json().get("ip")
            except Exception:
                pass

        # If IPv6 is missing, attempt to fetch from api6.ipify.org
        if not result["ipv6"]:
            try:
                r_v6 = await client.get("https://api6.ipify.org?format=json")
                if r_v6.status_code == 200:
                    result["ipv6"] = r_v6.json().get("ip")
            except Exception:
                pass

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
