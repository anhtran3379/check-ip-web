"""Independent audit probes. Local synthetic traffic only; no production edits."""
import asyncio
import json
import time
from unittest.mock import patch, AsyncMock, MagicMock
import httpx
import app.network as net

async def main():
    print('IP classification:', json.dumps({ip: net.classify_ip(ip) for ip in ['3fff::1', '100:0:0:1::1', '2001:1::1']}, indent=2))
    real_client = httpx.AsyncClient
    async def serve(reader, writer):
        await reader.readuntil(b'\r\n\r\n')
        parts = [b'{"status":"success",', b'"proxy":false,', b'"hosting":false}']
        body_len = sum(map(len, parts))
        writer.write(f'HTTP/1.1 200 OK\r\nContent-Length: {body_len}\r\nConnection: close\r\n\r\n'.encode())
        await writer.drain()
        try:
            for part in parts:
                await asyncio.sleep(1.75)
                writer.write(part)
                await writer.drain()
        finally:
            writer.close()
            await writer.wait_closed()
    server = await asyncio.start_server(serve, '127.0.0.1', 0)
    port = server.sockets[0].getsockname()[1]
    class LocalTransport(httpx.AsyncHTTPTransport):
        async def handle_async_request(self, request):
            request.url = httpx.URL(f'http://127.0.0.1:{port}/')
            return await super().handle_async_request(request)
    def client_factory(**kwargs):
        return real_client(transport=LocalTransport(), trust_env=False, **kwargs)
    net.reset_lookup_state()
    try:
        with patch('app.network.httpx.AsyncClient', side_effect=client_factory):
            start = time.monotonic()
            _, security = await net.lookup_ip_info('8.8.8.8')
            elapsed = time.monotonic() - start
            print('lookup slow-body:', json.dumps({'seconds': round(elapsed, 3), 'configured_timeout': net.LOOKUP_TIMEOUT, 'status': security['detection_status']}))
            assert elapsed > net.LOOKUP_TIMEOUT and security['detection_status'] == 'not_detected'
    finally:
        server.close()
        await server.wait_closed()
    writer = MagicMock()
    async def never_closed():
        await asyncio.Future()
    writer.wait_closed = AsyncMock(side_effect=never_closed)
    with patch('app.network.asyncio.open_connection', AsyncMock(return_value=(None, writer))):
        task = asyncio.create_task(net.ping_latency(timeout=0.02))
        await asyncio.sleep(0.15)
        print('ping cleanup:', json.dumps({'still_pending': not task.done(), 'writer_close_called': writer.close.called, 'configured_timeout': 0.02}))
        assert not task.done() and writer.close.called
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

if __name__ == '__main__':
    asyncio.run(main())
