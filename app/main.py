import os
import time
from fastapi import FastAPI, Request, Response
from fastapi.responses import HTMLResponse, PlainTextResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from .network import (
    ALLOWED_PING_HOSTS,
    classify_ip,
    lookup_ip_info,
    ping_latency,
    is_private_ip,
)

app = FastAPI(
    title="Kiểm Tra IP Của Tôi - Free Client IP Checker",
    description="Công cụ kiểm tra địa chỉ IP kết nối, thông tin mạng ISP, vị trí địa lý ước tính và tín hiệu mạng.",
    version="2.0.0",
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

NO_STORE_HEADERS = {"Cache-Control": "no-store, max-age=0"}


@app.get("/app.js")
async def serve_app_js():
    return FileResponse(os.path.join(STATIC_DIR, "app.js"))


def extract_client_ip(request: Request) -> dict:
    """Extracts and validates client IP strictly from request.client (never from untrusted headers)."""
    raw_host = request.client.host if (request.client and request.client.host) else None
    return classify_ip(raw_host)


@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        with open(index_file, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>Check IP Website is starting up...</h1>")


@app.get("/api/info")
async def api_info(request: Request):
    classification = extract_client_ip(request)
    user_agent = request.headers.get("user-agent", "Unknown")
    language = request.headers.get("accept-language", "vi,en")
    protocol = request.scope.get("scheme", "http").upper()
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")

    if not classification["is_valid"]:
        details, security = await lookup_ip_info(None)
        latency = await ping_latency()
        return JSONResponse(
            status_code=503,
            content={
                "status": "unavailable",
                "ip": None,
                "is_ipv6": False,
                "is_private": False,
                "details": details,
                "security": security,
                "datacenter": None,
                "latency_ms": latency,
                "user_agent": user_agent,
                "language": language,
                "protocol": protocol,
                "timestamp": timestamp,
            },
            headers=NO_STORE_HEADERS,
        )

    client_ip = classification["ip"]
    details, security = await lookup_ip_info(client_ip)
    latency = await ping_latency()

    return JSONResponse(
        status_code=200,
        content={
            "status": "success",
            "ip": client_ip,
            "is_ipv6": classification["is_ipv6"],
            "is_private": is_private_ip(client_ip),
            "details": details,
            "security": security,
            "datacenter": None,
            "latency_ms": latency,
            "user_agent": user_agent,
            "language": language,
            "protocol": protocol,
            "timestamp": timestamp,
        },
        headers=NO_STORE_HEADERS,
    )


@app.get("/api/ping")
async def api_ping(host: str = "8.8.8.8"):
    if host not in ALLOWED_PING_HOSTS:
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "error": "invalid_ping_host",
                "message": "Chỉ cho phép kiểm tra kết nối TCP cổng 53 từ server tới 8.8.8.8 hoặc 1.1.1.1.",
                "host": host,
                "latency_ms": -1.0,
            },
            headers=NO_STORE_HEADERS,
        )
    latency = await ping_latency(host)
    return JSONResponse(
        status_code=200,
        content={
            "host": host,
            "port": 53,
            "method": "server_tcp_dns",
            "latency_ms": latency,
        },
        headers=NO_STORE_HEADERS,
    )


@app.get("/ip", response_class=PlainTextResponse)
@app.get("/api/raw", response_class=PlainTextResponse)
async def api_raw(request: Request):
    """Returns plain-text client IP observed by server."""
    classification = extract_client_ip(request)
    if not classification["is_valid"]:
        return PlainTextResponse(
            content="unavailable",
            status_code=503,
            headers=NO_STORE_HEADERS,
        )
    return PlainTextResponse(
        content=classification["ip"],
        status_code=200,
        headers=NO_STORE_HEADERS,
    )


@app.get("/api/json")
async def api_json(request: Request):
    """Returns JSON summary of client IP, details, and security."""
    classification = extract_client_ip(request)
    if not classification["is_valid"]:
        details, security = await lookup_ip_info(None)
        return JSONResponse(
            status_code=503,
            content={
                "status": "unavailable",
                "ip": None,
                "details": details,
                "security": security,
            },
            headers=NO_STORE_HEADERS,
        )

    client_ip = classification["ip"]
    details, security = await lookup_ip_info(client_ip)
    return JSONResponse(
        status_code=200,
        content={
            "ip": client_ip,
            "details": details,
            "security": security,
        },
        headers=NO_STORE_HEADERS,
    )


@app.get("/robots.txt", response_class=PlainTextResponse)
async def robots_txt():
    robots_path = os.path.join(STATIC_DIR, "robots.txt")
    with open(robots_path, "r", encoding="utf-8") as f:
        content = f.read()
    return PlainTextResponse(content=content)


@app.get("/sitemap.xml")
async def sitemap_xml():
    sitemap_path = os.path.join(STATIC_DIR, "sitemap.xml")
    with open(sitemap_path, "r", encoding="utf-8") as f:
        xml_content = f.read()
    return Response(content=xml_content, media_type="application/xml")
