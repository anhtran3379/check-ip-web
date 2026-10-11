import uvicorn
import webbrowser
import threading
import time
import socket


def get_primary_local_ip():
    """Find the outgoing LAN address without sending network traffic."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"

def open_browser():
    time.sleep(1.2)
    webbrowser.open("http://localhost:8000")

if __name__ == "__main__":
    local_ip = get_primary_local_ip()
    print("=" * 60)
    print("  🚀 IP Inspector Server is starting!")
    print(f"  👉 Truy cập cục bộ: http://localhost:8000")
    print(f"  👉 Truy cập từ máy khác trong mạng LAN: http://{local_ip}:8000")
    print("=" * 60)

    # Automatically open browser in a background thread
    threading.Thread(target=open_browser, daemon=True).start()

    # Start FastAPI server listening on all network interfaces
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False, proxy_headers=False)
