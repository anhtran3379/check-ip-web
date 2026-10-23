import ast
import asyncio
import json
import os
import socket
import subprocess
import sys
import time
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi.testclient import TestClient
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

import app.main as main_mod
import app.network as net_mod

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures.json")


def make_mock_response(status_code=200, json_data=None, text_data="", headers=None):
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.headers = httpx.Headers(headers or {})
    if json_data is not None:
        resp.json.return_value = json_data
    else:
        resp.json.side_effect = ValueError("Invalid JSON")
    resp.text = text_data
    return resp


def patch_async_client(get_mock):
    client_instance = MagicMock()
    client_instance.get = get_mock
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client_instance)
    cm.__aexit__ = AsyncMock(return_value=False)
    return patch("app.network.httpx.AsyncClient", return_value=cm)


class TestPythonSyntaxAndBaseline(unittest.TestCase):
    def test_python_files_compile_cleanly(self):
        py_files = [
            os.path.join(ROOT_DIR, "app", "main.py"),
            os.path.join(ROOT_DIR, "app", "network.py"),
            os.path.join(ROOT_DIR, "run.py"),
        ]
        for path in py_files:
            with self.subTest(path=path):
                with open(path, "r", encoding="utf-8") as f:
                    source = f.read()
                tree = ast.parse(source, filename=path)
                compile(tree, filename=path, mode="exec")

    def test_run_py_preserves_codex_helpers_and_disables_proxy_headers(self):
        run_path = os.path.join(ROOT_DIR, "run.py")
        with open(run_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("def get_primary_local_ip():", content)
        self.assertIn('return "127.0.0.1"', content)
        self.assertIn("proxy_headers=False", content)

    def test_app_static_removed_and_public_is_canonical(self):
        self.assertFalse(os.path.exists(os.path.join(ROOT_DIR, "app", "static", "app.js")))
        self.assertFalse(os.path.exists(os.path.join(ROOT_DIR, "app", "static", "index.html")))
        with open(os.path.join(ROOT_DIR, "public", "index.html"), "r", encoding="utf-8") as f:
            html = f.read()
        self.assertIn('<script src="/app.js"></script>', html)
        self.assertNotIn("/static/app.js", html)
        self.assertNotIn("https://checkip.vn", html)


class TestIPClassificationAndHelpers(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(FIXTURES_PATH, "r", encoding="utf-8") as f:
            cls.fixtures = json.load(f)

    def test_shared_ip_fixtures(self):
        for case in self.fixtures["ip_cases"]:
            with self.subTest(ip=case["input"]):
                res = net_mod.classify_ip(case["input"])
                self.assertEqual(res["is_valid"], case["is_valid"])
                self.assertEqual(res["is_ipv6"], case["is_ipv6"])
                self.assertEqual(res["is_public"], case["is_public"])
                self.assertEqual(res["is_private"], case["is_private"])
                self.assertEqual(res["lookup_eligible"], case["lookup_eligible"])
                self.assertEqual(res["category"], case["category"])

    def test_timezone_normalization(self):
        self.assertEqual(net_mod.normalize_timezone("Asia/Saigon"), "Asia/Ho_Chi_Minh")
        self.assertEqual(net_mod.normalize_timezone("Asia/Ho_Chi_Minh"), "Asia/Ho_Chi_Minh")
        self.assertEqual(net_mod.normalize_timezone("America/New_York"), "America/New_York")
        self.assertIsNone(net_mod.normalize_timezone(""))
        self.assertIsNone(net_mod.normalize_timezone(None))
        self.assertIsNone(net_mod.normalize_timezone("InvalidZoneWithoutSlash"))

    def test_coordinate_parsing_preserves_zero_and_rejects_invalid(self):
        self.assertEqual(net_mod.parse_coordinate(0, -90, 90), 0.0)
        self.assertEqual(net_mod.parse_coordinate("0", -180, 180), 0.0)
        self.assertEqual(net_mod.parse_coordinate("-45.125", -90, 90), -45.125)
        self.assertIsNone(net_mod.parse_coordinate("", -90, 90))
        self.assertIsNone(net_mod.parse_coordinate("   ", -90, 90))
        self.assertIsNone(net_mod.parse_coordinate(None, -90, 90))
        self.assertIsNone(net_mod.parse_coordinate(True, -90, 90))
        self.assertIsNone(net_mod.parse_coordinate(False, -90, 90))
        self.assertIsNone(net_mod.parse_coordinate(float("nan"), -90, 90))
        self.assertIsNone(net_mod.parse_coordinate(float("inf"), -90, 90))
        self.assertIsNone(net_mod.parse_coordinate(91, -90, 90))
        self.assertIsNone(net_mod.parse_coordinate(-181, -180, 180))


class TestLookupCacheBudgetAndSecurityContract(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        net_mod.reset_lookup_state()
        self.fake_now = 1000.0
        net_mod.set_clock(lambda: self.fake_now)

    def tearDown(self):
        net_mod.set_clock(None)
        net_mod.reset_lookup_state()

    async def test_non_public_and_invalid_ips_never_call_upstream(self):
        mock_get = AsyncMock()
        with patch_async_client(mock_get):
            non_public_ips = [
                "127.0.0.1", "10.0.0.1", "172.16.5.4", "192.168.1.10", "100.64.0.1",
                "192.0.0.1", "192.0.0.8", "192.0.0.11", "::1", "fe80::1",
                "::ffff:192.168.1.1", "::ffff:192.0.0.1", "3fff::1",
                "3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff", "100::1", "100:0:0:1::1",
                "64:ff9b:1::1", "64:ff9b::1:0:0", "64:ff9a:ffff:ffff:ffff:ffff:ffff:ffff",
                "2001::1", "2001:1::", "2001:1::4", "2001:2::1", "2001:1ff:ffff:ffff:ffff:ffff:ffff:ffff",
                "4000::1", "5f00::1", "fec0::1",
            ]
            for ip in non_public_ips:
                cls = net_mod.classify_ip(ip)
                self.assertFalse(cls["is_public"], f"Expected is_public=False for {ip}")
                self.assertTrue(cls["is_private"], f"Expected is_private=True for {ip}")
                self.assertFalse(cls["lookup_eligible"], f"Expected lookup_eligible=False for {ip}")
                details, sec = await net_mod.lookup_ip_info(ip)
                self.assertEqual(sec["detection_status"], "not_applicable", f"Failed for {ip}")
                self.assertEqual(sec["source"], "local")
                self.assertFalse(sec["is_vpn_or_proxy"])
                self.assertIsNone(details["city"])
                self.assertIsNone(details["country"])
                self.assertEqual(details["flag_emoji"], "🌐")

            for bad_ip in ["", "localhost", "testclient", "999.999.999.999", None]:
                details, sec = await net_mod.lookup_ip_info(bad_ip)
                self.assertEqual(sec["detection_status"], "unknown")
                self.assertEqual(sec["reason"], "invalid_ip")
                self.assertFalse(sec["is_vpn_or_proxy"])

            mock_get.assert_not_called()

        # Verify globally reachable exceptions inside 64:ff9b::/96, 192.0.0.0/24, and 2001::/23 DO call upstream
        resp_ok = make_mock_response(200, {
            "status": "success",
            "country": "United States",
            "countryCode": "US",
            "isp": "IANA Exception",
            "proxy": False,
            "hosting": False,
        })
        public_exceptions = [
            "192.0.0.9", "192.0.0.10", "::ffff:192.0.0.9",
            "64:ff9b::808:808", "64:ff9b::101:101",
            "2001:1::1", "2001:1::2", "2001:1::3", "2001:3::1", "2001:4:112::1",
            "2001:20::1", "2001:30::1", "2001:200::1", "3fff:1000::1",
        ]
        mock_pub = AsyncMock(return_value=resp_ok)
        with patch_async_client(mock_pub):
            for idx, ip in enumerate(public_exceptions, start=1):
                cls = net_mod.classify_ip(ip)
                self.assertTrue(cls["is_public"], f"Expected is_public=True for {ip}")
                self.assertFalse(cls["is_private"], f"Expected is_private=False for {ip}")
                self.assertTrue(cls["lookup_eligible"], f"Expected lookup_eligible=True for {ip}")
                _, sec = await net_mod.lookup_ip_info(ip)
                self.assertEqual(sec["detection_status"], "not_detected", f"Failed for {ip}")
                self.assertEqual(mock_pub.call_count, idx, f"Expected upstream call for {ip}")

    async def test_vpn_suspected_vs_hosting_signal_vs_not_detected(self):
        # 1. proxy=True -> suspected
        resp_proxy = make_mock_response(200, {
            "status": "success",
            "country": "Singapore",
            "countryCode": "SG",
            "city": "Singapore",
            "timezone": "Asia/Singapore",
            "isp": "Example VPN",
            "org": "Example VPN",
            "as": "AS9009 M247",
            "proxy": True,
            "hosting": True,
            "lat": 0,
            "lon": 0,
        })
        with patch_async_client(AsyncMock(return_value=resp_proxy)):
            details, sec = await net_mod.lookup_ip_info("8.8.8.8")
            self.assertEqual(sec["detection_status"], "suspected")
            self.assertTrue(sec["is_vpn_or_proxy"])
            self.assertTrue(sec["is_hosting"])
            self.assertEqual(details["latitude"], 0.0)
            self.assertEqual(details["longitude"], 0.0)

        # 2. proxy=False, hosting=True -> not_detected (hosting signal only, NOT suspected)
        resp_hosting = make_mock_response(200, {
            "status": "success",
            "country": "United States",
            "countryCode": "US",
            "city": "Ashburn",
            "timezone": "America/New_York",
            "isp": "Amazon.com",
            "org": "AWS",
            "as": "AS16509 Amazon",
            "proxy": False,
            "hosting": True,
            "lat": 39.0438,
            "lon": -77.4874,
        })
        with patch_async_client(AsyncMock(return_value=resp_hosting)):
            details, sec = await net_mod.lookup_ip_info("1.1.1.1")
            self.assertEqual(sec["detection_status"], "not_detected")
            self.assertFalse(sec["is_vpn_or_proxy"])
            self.assertTrue(sec["is_hosting"])
            self.assertEqual(sec["reason"], "hosting_signal_only")

        # 3. proxy=False, hosting=False -> not_detected
        resp_clean = make_mock_response(200, {
            "status": "success",
            "country": "Japan",
            "countryCode": "JP",
            "city": "Tokyo",
            "timezone": "Asia/Tokyo",
            "isp": "Sample Telecom",
            "org": "Sample Telecom",
            "as": "AS12345 Sample",
            "proxy": False,
            "hosting": False,
        })
        with patch_async_client(AsyncMock(return_value=resp_clean)):
            details, sec = await net_mod.lookup_ip_info("9.9.9.9")
            self.assertEqual(sec["detection_status"], "not_detected")
            self.assertFalse(sec["is_vpn_or_proxy"])
            self.assertFalse(sec["is_hosting"])
            self.assertEqual(sec["reason"], "no_proxy_signal")

    async def test_upstream_errors_and_missing_proxy_flag_return_unknown_and_do_not_cache(self):
        # Missing proxy flag
        resp_missing_flag = make_mock_response(200, {
            "status": "success",
            "country": "Germany",
            "countryCode": "DE",
            "isp": "Hetzner Online",
            "hosting": True,
        })
        with patch_async_client(AsyncMock(return_value=resp_missing_flag)):
            details, sec = await net_mod.lookup_ip_info("8.8.4.4")
            self.assertEqual(sec["detection_status"], "unknown")
            self.assertFalse(sec["is_vpn_or_proxy"])
            self.assertTrue(sec["is_hosting"])
            self.assertEqual(sec["reason"], "missing_proxy_flag_hosting_signal")
            self.assertNotIn("8.8.4.4", net_mod._geo_cache)

        # Timeout
        with patch_async_client(AsyncMock(side_effect=httpx.TimeoutException("Timed out"))):
            details, sec = await net_mod.lookup_ip_info("8.8.4.4")
            self.assertEqual(sec["detection_status"], "unknown")
            self.assertEqual(sec["reason"], "lookup_timeout")
            self.assertIsNone(details["country"])
            self.assertEqual(details["flag_emoji"], "🌐")
            self.assertNotIn("8.8.4.4", net_mod._geo_cache)

        # HTTP 500
        with patch_async_client(AsyncMock(return_value=make_mock_response(500, {}))):
            _, sec = await net_mod.lookup_ip_info("8.8.4.4")
            self.assertEqual(sec["detection_status"], "unknown")
            self.assertEqual(sec["reason"], "lookup_http_error")

        # Invalid JSON
        with patch_async_client(AsyncMock(return_value=make_mock_response(200, None))):
            _, sec = await net_mod.lookup_ip_info("8.8.4.4")
            self.assertEqual(sec["detection_status"], "unknown")
            self.assertEqual(sec["reason"], "lookup_invalid_json")

        # status=fail
        with patch_async_client(AsyncMock(return_value=make_mock_response(200, {"status": "fail"}))):
            _, sec = await net_mod.lookup_ip_info("8.8.4.4")
            self.assertEqual(sec["detection_status"], "unknown")
            self.assertEqual(sec["reason"], "lookup_status_fail")

    async def test_cache_ttl_lru_eviction_cooldown_and_budget(self):
        call_count = 0

        async def fake_get(url, *args, **kwargs):
            nonlocal call_count
            call_count += 1
            return make_mock_response(200, {
                "status": "success",
                "country": "Australia",
                "countryCode": "AU",
                "isp": "APNIC",
                "proxy": False,
                "hosting": False,
            })

        with patch_async_client(AsyncMock(side_effect=fake_get)):
            await net_mod.lookup_ip_info("1.1.1.1")
            self.assertEqual(call_count, 1)

            # Within TTL (3599s later): served from cache
            self.fake_now += 3599.0
            await net_mod.lookup_ip_info("1.1.1.1")
            self.assertEqual(call_count, 1)

            # Expired (3601s from initial): re-fetched
            self.fake_now += 2.0
            await net_mod.lookup_ip_info("1.1.1.1")
            self.assertEqual(call_count, 2)

            # LRU eviction when cache reaches CACHE_MAX_SIZE
            net_mod.reset_lookup_state()
            with patch.object(net_mod, "CACHE_MAX_SIZE", 2):
                await net_mod.lookup_ip_info("8.8.8.8")
                await net_mod.lookup_ip_info("1.1.1.1")
                # Touch 8.8.8.8 so 1.1.1.1 becomes least recently used
                await net_mod.lookup_ip_info("8.8.8.8")
                await net_mod.lookup_ip_info("9.9.9.9")
                self.assertIn("8.8.8.8", net_mod._geo_cache)
                self.assertIn("9.9.9.9", net_mod._geo_cache)
                self.assertNotIn("1.1.1.1", net_mod._geo_cache)

        # Test X-Rl=0 and X-Ttl cooldown
        net_mod.reset_lookup_state()
        resp_rl = make_mock_response(
            429,
            {"status": "fail"},
            headers={"X-Rl": "0", "X-Ttl": "45"},
        )
        mock_rl = AsyncMock(return_value=resp_rl)
        with patch_async_client(mock_rl):
            _, sec1 = await net_mod.lookup_ip_info("8.8.8.8")
            self.assertEqual(sec1["reason"], "lookup_rate_limited")
            self.assertEqual(mock_rl.call_count, 1)

            # During 45s cooldown, upstream is not called
            self.fake_now += 30.0
            _, sec2 = await net_mod.lookup_ip_info("9.9.9.9")
            self.assertEqual(sec2["reason"], "rate_limit_cooldown")
            self.assertEqual(mock_rl.call_count, 1)

            # After 46s, cooldown expires
            self.fake_now += 16.0
            await net_mod.lookup_ip_info("9.9.9.9")
            self.assertEqual(mock_rl.call_count, 2)

        # Test 40 calls/minute budget
        net_mod.reset_lookup_state()
        mock_budget = AsyncMock(return_value=make_mock_response(500, {}))
        with patch_async_client(mock_budget):
            for i in range(40):
                ip = f"8.8.8.{i + 1}"
                _, s = await net_mod.lookup_ip_info(ip)
                self.assertEqual(s["reason"], "lookup_http_error")
            self.assertEqual(mock_budget.call_count, 40)

            # 41st call within the same 60s window hits budget_exhausted without calling upstream
            _, s_41 = await net_mod.lookup_ip_info("8.8.8.200")
            self.assertEqual(s_41["reason"], "budget_exhausted")
            self.assertEqual(mock_budget.call_count, 40)

    async def test_cancellation_propagates_and_does_not_cache(self):
        async def cancelled_get(*args, **kwargs):
            raise asyncio.CancelledError()

        with patch_async_client(AsyncMock(side_effect=cancelled_get)):
            with self.assertRaises(asyncio.CancelledError):
                await net_mod.lookup_ip_info("8.8.8.8")
            self.assertNotIn("8.8.8.8", net_mod._geo_cache)

    async def test_slow_body_trickle_respects_total_lookup_deadline_and_caller_cancel(self):
        real_client = httpx.AsyncClient
        server_Disconnected = asyncio.Event()
        chunks_sent = 0

        async def serve(reader, writer):
            nonlocal chunks_sent
            try:
                await reader.readuntil(b"\r\n\r\n")
                parts = [b'{"status":"success",', b'"proxy":false,', b'"hosting":false}']
                body_len = sum(map(len, parts))
                writer.write(
                    f"HTTP/1.1 200 OK\r\nContent-Length: {body_len}\r\nConnection: close\r\n\r\n".encode()
                )
                await writer.drain()
                for part in parts:
                    try:
                        eof = await asyncio.wait_for(reader.read(1), timeout=1.75)
                        if eof == b"":
                            break
                    except asyncio.TimeoutError:
                        pass
                    writer.write(part)
                    await writer.drain()
                    chunks_sent += 1
            except Exception:
                server_Disconnected.set()
            finally:
                try:
                    writer.close()
                    await writer.wait_closed()
                except Exception:
                    pass
                server_Disconnected.set()

        server = await asyncio.start_server(serve, "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]

        class LocalTransport(httpx.AsyncHTTPTransport):
            async def handle_async_request(self, request):
                request.url = httpx.URL(f"http://127.0.0.1:{port}/")
                return await super().handle_async_request(request)

        def client_factory(**kwargs):
            return real_client(transport=LocalTransport(verify=False), trust_env=False, **kwargs)

        try:
            with patch("app.network.httpx.AsyncClient", side_effect=client_factory):
                start = time.monotonic()
                _, sec = await net_mod.lookup_ip_info("8.8.8.8")
                elapsed = time.monotonic() - start

                self.assertEqual(sec["detection_status"], "unknown")
                self.assertEqual(sec["reason"], "lookup_timeout")
                self.assertLessEqual(elapsed, net_mod.LOOKUP_TIMEOUT + 0.45)
                self.assertNotIn("8.8.8.8", net_mod._geo_cache)
                await asyncio.wait_for(server_Disconnected.wait(), timeout=1.0)
                self.assertLess(chunks_sent, 3)

                # Caller cancellation during trickle lookup propagates CancelledError and does not cache
                cancel_task = asyncio.create_task(net_mod.lookup_ip_info("1.1.1.1"))
                await asyncio.sleep(0.2)
                cancel_task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await cancel_task
                self.assertNotIn("1.1.1.1", net_mod._geo_cache)
        finally:
            server.close()
            await server.wait_closed()


class TestAsyncPingAndEndpoints(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        net_mod.reset_lookup_state()

    async def test_concurrent_pings_do_not_block_event_loop_and_close_writers(self):
        writers = []

        async def slow_open_connection(host, port):
            writer = MagicMock()
            writer.close = MagicMock()
            writer.wait_closed = AsyncMock()
            writers.append(writer)
            await asyncio.sleep(0.15)
            return MagicMock(), writer

        heartbeat_ticks = 0

        async def heartbeat():
            nonlocal heartbeat_ticks
            for _ in range(5):
                await asyncio.sleep(0.02)
                heartbeat_ticks += 1

        with patch("app.network.asyncio.open_connection", side_effect=slow_open_connection):
            t0 = time.perf_counter()
            results = await asyncio.gather(
                net_mod.ping_latency("8.8.8.8"),
                net_mod.ping_latency("1.1.1.1"),
                net_mod.ping_latency("8.8.8.8"),
                net_mod.ping_latency("1.1.1.1"),
                heartbeat(),
            )
            elapsed = time.perf_counter() - t0

        self.assertGreaterEqual(heartbeat_ticks, 4)
        # Sequential execution of 4x 0.15s pings would take >= 0.60s
        self.assertLess(elapsed, 0.45)
        self.assertEqual(len(writers), 4)
        for w in writers:
            w.close.assert_called_once()
            w.wait_closed.assert_awaited_once()
        self.assertGreaterEqual(results[0], 0.0)
        self.assertGreaterEqual(results[1], 0.0)

    async def test_ping_cleanup_bounded_and_aborts_transport_on_hang_or_cancel(self):
        # 1. Hanging wait_closed() is bounded and aborts transport
        hanging_writer = MagicMock()
        hanging_writer.transport = MagicMock()

        async def never_closed():
            await asyncio.Future()

        hanging_writer.wait_closed = AsyncMock(side_effect=never_closed)
        with patch("app.network.asyncio.open_connection", AsyncMock(return_value=(None, hanging_writer))):
            t0 = time.perf_counter()
            res = await net_mod.ping_latency("8.8.8.8", timeout=0.02)
            elapsed = time.perf_counter() - t0
            self.assertGreaterEqual(res, 0.0)
            self.assertLess(elapsed, 0.12)
            hanging_writer.close.assert_called_once()
            hanging_writer.transport.abort.assert_called_once()

        # 2. Caller cancellation during wait_closed() propagates CancelledError and aborts transport
        cancel_writer = MagicMock()
        cancel_writer.transport = MagicMock()
        entered_wait_closed = asyncio.Event()

        async def block_wait_closed():
            entered_wait_closed.set()
            await asyncio.Future()

        cancel_writer.wait_closed = AsyncMock(side_effect=block_wait_closed)
        with patch("app.network.asyncio.open_connection", AsyncMock(return_value=(None, cancel_writer))):
            task = asyncio.create_task(net_mod.ping_latency("8.8.8.8", timeout=2.0))
            await asyncio.wait_for(entered_wait_closed.wait(), timeout=0.5)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            cancel_writer.close.assert_called_once()
            cancel_writer.transport.abort.assert_called_once()

    async def test_ping_rejects_disallowed_hosts_without_connecting(self):
        mock_conn = AsyncMock()
        with patch("app.network.asyncio.open_connection", mock_conn):
            client = TestClient(main_mod.app, client=("127.0.0.1", 50000))
            for bad_host in ["192.168.1.1", "127.0.0.1", "10.0.0.1", "example.com", "localhost"]:
                res = client.get(f"/api/ping?host={bad_host}")
                self.assertEqual(res.status_code, 400)
                self.assertEqual(res.json()["latency_ms"], -1.0)
            mock_conn.assert_not_called()

    async def test_direct_mode_ignores_forged_headers_and_isolates_clients(self):
        async def fake_lookup(ip):
            if ip == "8.8.8.8":
                return (
                    {**net_mod.build_empty_details(), "isp": "ISP-A", "country": "US"},
                    net_mod.build_security_object("not_detected", "ip-api", "no_proxy_signal", False),
                )
            if ip == "1.1.1.1":
                return (
                    {**net_mod.build_empty_details(), "isp": "ISP-B", "country": "AU"},
                    net_mod.build_security_object("suspected", "ip-api", "proxy_detected", True),
                )
            return await net_mod.lookup_ip_info(ip)

        with patch("app.main.lookup_ip_info", side_effect=fake_lookup), \
             patch("app.main.ping_latency", AsyncMock(return_value=12.5)):
            # 1. Direct mode with private IP ignores forged headers
            client_local = TestClient(main_mod.app, client=("192.168.1.25", 50000))
            forged_headers = {
                "CF-Connecting-IP": "8.8.8.8",
                "X-Forwarded-For": "1.1.1.1",
                "X-Real-IP": "9.9.9.9",
            }
            r_ip = client_local.get("/ip", headers=forged_headers)
            self.assertEqual(r_ip.status_code, 200)
            self.assertEqual(r_ip.text, "192.168.1.25")
            self.assertIn("no-store", r_ip.headers.get("cache-control", ""))

            r_info = client_local.get("/api/info", headers=forged_headers)
            self.assertEqual(r_info.status_code, 200)
            body = r_info.json()
            self.assertEqual(body["ip"], "192.168.1.25")
            self.assertTrue(body["is_private"])
            self.assertIsNone(body["datacenter"])
            self.assertEqual(body["security"]["detection_status"], "not_applicable")

            # 2. Two sequential public clients do not leak data to each other
            client_a = TestClient(main_mod.app, client=("8.8.8.8", 50001))
            client_b = TestClient(main_mod.app, client=("1.1.1.1", 50002))

            res_a = client_a.get("/api/info").json()
            res_b = client_b.get("/api/info").json()

            self.assertEqual(res_a["ip"], "8.8.8.8")
            self.assertEqual(res_a["details"]["isp"], "ISP-A")
            self.assertEqual(res_a["security"]["detection_status"], "not_detected")

            self.assertEqual(res_b["ip"], "1.1.1.1")
            self.assertEqual(res_b["details"]["isp"], "ISP-B")
            self.assertEqual(res_b["security"]["detection_status"], "suspected")

            # 3. Invalid client hostname is rejected without lookup
            client_invalid = TestClient(main_mod.app, client=("testclient", 50000))
            res_inv = client_invalid.get("/api/info", headers=forged_headers)
            self.assertEqual(res_inv.status_code, 503)
            self.assertIsNone(res_inv.json()["ip"])

    async def test_trusted_proxy_middleware_boundary(self):
        wrapped_app = ProxyHeadersMiddleware(main_mod.app, trusted_hosts=["10.0.0.5"])

        # Untrusted peer cannot spoof X-Forwarded-For
        untrusted_client = TestClient(wrapped_app, client=("192.168.1.99", 50000))
        res_untrusted = untrusted_client.get("/ip", headers={"X-Forwarded-For": "8.8.8.8"})
        self.assertEqual(res_untrusted.text, "192.168.1.99")

        # Trusted proxy peer can forward client IP
        trusted_client = TestClient(wrapped_app, client=("10.0.0.5", 50000))
        res_trusted = trusted_client.get("/ip", headers={"X-Forwarded-For": "8.8.8.8"})
        self.assertEqual(res_trusted.text, "8.8.8.8")

    def test_seo_files_match_public_directory(self):
        client = TestClient(main_mod.app, client=("127.0.0.1", 50000))
        r_robots = client.get("/robots.txt")
        r_sitemap = client.get("/sitemap.xml")

        with open(os.path.join(ROOT_DIR, "public", "robots.txt"), "r", encoding="utf-8") as f:
            expected_robots = f.read()
        with open(os.path.join(ROOT_DIR, "public", "sitemap.xml"), "r", encoding="utf-8") as f:
            expected_sitemap = f.read()

        self.assertEqual(r_robots.status_code, 200)
        self.assertEqual(r_robots.text, expected_robots)
        self.assertEqual(r_sitemap.status_code, 200)
        self.assertEqual(r_sitemap.text, expected_sitemap)


class TestLiveUvicornSmoke(unittest.TestCase):
    def test_live_server_smoke_on_ephemeral_port(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
        sock.close()

        proc = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
                "--no-proxy-headers",
            ],
            cwd=ROOT_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        try:
            base_url = f"http://127.0.0.1:{port}"
            ready = False
            for _ in range(40):
                try:
                    r = httpx.get(f"{base_url}/ip", timeout=0.5)
                    if r.status_code == 200:
                        ready = True
                        break
                except Exception:
                    time.sleep(0.15)

            self.assertTrue(ready, "Uvicorn server did not start in time")

            with httpx.Client(base_url=base_url, timeout=3.0) as client:
                r_home = client.get("/")
                self.assertEqual(r_home.status_code, 200)
                self.assertIn("/app.js", r_home.text)

                r_js = client.get("/app.js")
                self.assertEqual(r_js.status_code, 200)
                self.assertIn("renderSecurityStatus", r_js.text)

                self.assertIn("/i18n.js", r_home.text)
                r_i18n = client.get("/i18n.js")
                self.assertEqual(r_i18n.status_code, 200)
                self.assertIn("initializeLanguage", r_i18n.text)

                # Spoofed header must be ignored in direct Uvicorn mode
                r_ip = client.get("/ip", headers={"CF-Connecting-IP": "8.8.8.8", "X-Forwarded-For": "1.1.1.1"})
                self.assertEqual(r_ip.status_code, 200)
                self.assertEqual(r_ip.text, "127.0.0.1")

                r_raw = client.get("/api/raw")
                self.assertEqual(r_raw.status_code, 200)
                self.assertEqual(r_raw.text, "127.0.0.1")

                r_info = client.get("/api/info", headers={"X-Forwarded-For": "8.8.8.8"})
                self.assertEqual(r_info.status_code, 200)
                info_json = r_info.json()
                self.assertEqual(info_json["ip"], "127.0.0.1")
                self.assertTrue(info_json["is_private"])
                self.assertEqual(info_json["security"]["detection_status"], "not_applicable")

                r_json = client.get("/api/json")
                self.assertEqual(r_json.status_code, 200)
                self.assertEqual(r_json.json()["ip"], "127.0.0.1")

                r_robots = client.get("/robots.txt")
                self.assertEqual(r_robots.status_code, 200)
                self.assertIn("https://check-ip-web.pages.dev/sitemap.xml", r_robots.text)

                r_sitemap = client.get("/sitemap.xml")
                self.assertEqual(r_sitemap.status_code, 200)
                self.assertIn("https://check-ip-web.pages.dev/", r_sitemap.text)
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
            if proc.stdout:
                proc.stdout.close()
            if proc.stderr:
                proc.stderr.close()


if __name__ == "__main__":
    unittest.main()
