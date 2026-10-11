"""2026-10-12 independent re-audit. Local synthetic traffic only."""
import asyncio
import json
import time
from unittest.mock import patch, AsyncMock, MagicMock
import httpx
import app.network as net

async def main():
    failures = []
    for ip, expected in [('3fff::1', False), ('100:0:0:1::1', False), ('2001:1::1', True), ('2001:1::3', True), ('64:ff9b::808:808', True)]:
        net.reset_lookup_state()
        mock_get = AsyncMock(return_value=httpx.Response(200, json={'status': 'success', 'proxy': False}))
        cm = MagicMock()
        cm.__aenter__ = AsyncMock(return_value=MagicMock(get=mock_get))
        cm.__aexit__ = AsyncMock(return_value=False)
        with patch('app.network.httpx.AsyncClient', return_value=cm):
            _, sec = await net.lookup_ip_info(ip)
        actual = net.classify_ip(ip)['lookup_eligible']
        passed = actual == expected and mock_get.call_count == int(expected)
        print(json.dumps({'case': 'F2', 'ip': ip, 'expected_public': expected, 'actual_public': actual, 'upstream_calls': mock_get.call_count, 'security_status': sec['detection_status'], 'passed': passed}))
        if not passed:
            failures.append(ip)
    real_client = httpx.AsyncClient
    async def serve(reader, writer):
        try:
            await reader.readuntil(b'\r\n\r\n')
            parts = [b'{"status":"success",', b'"proxy":false,', b'"hosting":false}']
            writer.write(f'HTTP/1.1 200 OK\r\nContent-Length: {sum(map(len, parts))}\r\nConnection: close\r\n\r\n'.encode())
            await writer.drain()
            for part in parts:
                try:
                    if await asyncio.wait_for(reader.read(1), timeout=1.75) == b'':
                        break
                except TimeoutError:
                    pass
                writer.write(part)
                await writer.drain()
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
    server = await asyncio.start_server(serve, '127.0.0.1', 0)
    port = server.sockets[0].getsockname()[1]
    class LocalTransport(httpx.AsyncHTTPTransport):
        async def handle_async_request(self, request):
            request.url = httpx.URL(f'http://127.0.0.1:{port}/')
            return await super().handle_async_request(request)
    net.reset_lookup_state()
    try:
        with patch('app.network.httpx.AsyncClient', side_effect=lambda **kw: real_client(transport=LocalTransport(), trust_env=False, **kw)):
            start = time.monotonic()
            _, sec = await net.lookup_ip_info('8.8.8.8')
            elapsed = time.monotonic() - start
            passed = elapsed < 4.5 and sec['reason'] == 'lookup_timeout' and '8.8.8.8' not in net._geo_cache
            print(json.dumps({'case': 'F1', 'seconds': round(elapsed, 3), 'reason': sec['reason'], 'passed': passed}))
            if not passed:
                failures.append('F1')
    finally:
        server.close()
        await server.wait_closed()
    writer = MagicMock()
    async def never_closed():
        await asyncio.Future()
    writer.wait_closed = AsyncMock(side_effect=never_closed)
    with patch('app.network.asyncio.open_connection', AsyncMock(return_value=(None, writer))):
        start = time.monotonic()
        await asyncio.wait_for(net.ping_latency(timeout=0.02), timeout=0.3)
        elapsed = time.monotonic() - start
        passed = elapsed < 0.15 and writer.close.called and writer.transport.abort.called
        print(json.dumps({'case': 'F4', 'seconds': round(elapsed, 3), 'close_called': writer.close.called, 'abort_called': writer.transport.abort.called, 'passed': passed}))
        if not passed:
            failures.append('F4')
    print(json.dumps({'failures': failures}))
    return bool(failures)

if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))
