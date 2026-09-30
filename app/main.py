import os
import time
from fastapi import FastAPI, Request, Response
from fastapi.responses import HTMLResponse, PlainTextResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from .network import (
    lookup_ip_info,
    ping_latency,
    is_private_ip
)

app = FastAPI(
    title="Kiểm Tra IP Của Tôi - Free Client IP Checker",
    description="Công cụ kiểm tra địa chỉ IP hiện tại, vị trí, nhà mạng ISP, DNS và tốc độ mạng chính xác nhất.",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public")
if not os.path.exists(STATIC_DIR):
    os.makedirs(STATIC_DIR, exist_ok=True)

from fastapi.responses import FileResponse

@app.get("/app.js")
async def serve_app_js():
    return FileResponse(os.path.join(STATIC_DIR, "app.js"))

def extract_client_ip(request: Request) -> str:
    """Extracts client IP checking Cloudflare, reverse proxies, and fallback."""
    # 1. Cloudflare header
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()

    # 2. X-Forwarded-For (standard proxy header)
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # First IP is the original client
        return forwarded.split(",")[0].strip()

    # 3. X-Real-IP (NGINX / generic proxies)
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    # 4. Standard client host
    if request.client and request.client.host:
        return request.client.host

    return "127.0.0.1"

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        with open(index_file, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>Check IP Website is starting up...</h1>")

@app.get("/api/info")
async def api_info(request: Request):
    client_ip = extract_client_ip(request)
    geo_data = await lookup_ip_info(client_ip)
    latency = await ping_latency()
    user_agent = request.headers.get("user-agent", "Unknown")

    return {
        "status": "success",
        "ip": client_ip,
        "is_private": is_private_ip(client_ip),
        "details": geo_data,
        "latency_ms": latency,
        "user_agent": user_agent,
        "language": request.headers.get("accept-language", "vi,en"),
        "protocol": request.scope.get("scheme", "http").upper(),
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }

@app.get("/api/ping")
async def api_ping(host: str = "8.8.8.8"):
    latency = await ping_latency(host)
    return {"host": host, "latency_ms": latency}

# Developer friendly endpoints (cURL like icanhazip / ifconfig.co)
@app.get("/ip", response_class=PlainTextResponse)
@app.get("/api/raw", response_class=PlainTextResponse)
async def api_raw(request: Request):
    """curl https://yourdomain.com/ip"""
    client_ip = extract_client_ip(request)
    return client_ip

@app.get("/api/json")
async def api_json(request: Request):
    """curl https://yourdomain.com/api/json"""
    client_ip = extract_client_ip(request)
    geo_data = await lookup_ip_info(client_ip)
    return JSONResponse(content=geo_data)

# SEO Technical Files
@app.get("/robots.txt", response_class=PlainTextResponse)
async def robots_txt():
    content = """User-agent: *
Allow: /
Disallow: /api/

Sitemap: https://checkip.vn/sitemap.xml
"""
    return PlainTextResponse(content=content)

@app.get("/sitemap.xml")
async def sitemap_xml():
    xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://checkip.vn/</loc>
    <lastmod>2026-09-30</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>"""
    return Response(content=xml_content, media_type="application/xml")
