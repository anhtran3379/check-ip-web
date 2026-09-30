import os
import time
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from .network import (
    get_hostname,
    get_primary_local_ip,
    get_default_gateway,
    get_network_interfaces,
    get_public_ip_info,
    ping_latency
)

app = FastAPI(title="Local & Public IP Checker", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory cache for public IP
_public_cache = {
    "timestamp": 0,
    "data": None
}
CACHE_TTL = 60  # seconds

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(STATIC_DIR):
    os.makedirs(STATIC_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

def get_client_ip(request: Request) -> str:
    # Check headers in case behind reverse proxy
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        with open(index_file, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>Check IP Local Server is running. UI loading...</h1>")

@app.get("/api/info")
async def api_info(request: Request, refresh: bool = False):
    now = time.time()
    global _public_cache

    if refresh or not _public_cache["data"] or (now - _public_cache["timestamp"] > CACHE_TTL):
        public_data = await get_public_ip_info()
        _public_cache["data"] = public_data
        _public_cache["timestamp"] = now
    else:
        public_data = _public_cache["data"]

    client_ip = get_client_ip(request)
    primary_local_ip = get_primary_local_ip()
    gateway = get_default_gateway()
    hostname = get_hostname()
    interfaces = get_network_interfaces()
    latency = await ping_latency()

    return {
        "status": "success",
        "client_ip": client_ip,
        "is_accessing_locally": client_ip in ("127.0.0.1", "::1", primary_local_ip),
        "primary_local_ip": primary_local_ip,
        "hostname": hostname,
        "default_gateway": gateway,
        "public": public_data,
        "latency_ms": latency,
        "interfaces": interfaces,
        "server_time": time.strftime("%Y-%m-%d %H:%M:%S")
    }

@app.get("/api/ping")
async def api_ping(host: str = "8.8.8.8"):
    latency = await ping_latency(host)
    return {"host": host, "latency_ms": latency}

@app.get("/api/raw", response_class=PlainTextResponse)
async def api_raw(request: Request, type: str = "public"):
    """Useful for terminal curl commands:
    curl http://localhost:8000/api/raw
    curl http://localhost:8000/api/raw?type=local
    curl http://localhost:8000/api/raw?type=client
    """
    if type == "local":
        return get_primary_local_ip()
    elif type == "client":
        return get_client_ip(request)
    else:
        # Default public
        public_info = await get_public_ip_info()
        return public_info.get("ipv4") or public_info.get("ipv6") or "Unknown"
