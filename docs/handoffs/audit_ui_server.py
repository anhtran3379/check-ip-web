"""UI audit fixture. Serves production assets with a synthetic long IPv6 API response."""
from fastapi.responses import JSONResponse
import uvicorn
from app.main import app as production_app
from app.network import build_empty_details, build_security_object

async def app(scope, receive, send):
    if scope['type'] == 'http' and scope['path'] == '/api/info':
        data = {
            'status': 'success', 'ip': '2606:4700:1234:5678:90ab:cdef:1234:5678',
            'is_private': False, 'is_ipv6': True, 'datacenter': None, 'latency_ms': -1,
            'details': {**build_empty_details(), 'latitude': 0, 'longitude': 0},
            'security': build_security_object('unknown', 'none', 'audit_fixture', False),
        }
        await JSONResponse(data, headers={'Cache-Control': 'no-store'})(scope, receive, send)
    else:
        await production_app(scope, receive, send)

if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=18001, proxy_headers=False, access_log=False)
