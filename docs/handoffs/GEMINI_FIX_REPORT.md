# Báo Cáo Triển Khai Sửa Lỗi — Gemini (`GEMINI_FIX_REPORT.md`)

- **Thư mục làm việc:** `C:\Dev\check-ip-local`
- **Tài liệu kế hoạch tham chiếu:** `docs/handoffs/GEMINI_FIX_PLAN.md`
- **Tệp baseline & audit tham chiếu:** `docs/handoffs/GEMINI_FIX_BASELINE.json`, `docs/handoffs/PRE_GEMINI_EXISTING_CHANGES.patch`, `docs/handoffs/CODEX_AUDIT_REPORT.md`, `docs/handoffs/CODEX_AUDIT_SNAPSHOT.json`, `docs/handoffs/CODEX_REAUDIT_REPORT.md`, `docs/handoffs/CODEX_REAUDIT_SNAPSHOT.json`
- **Trạng thái bàn giao:** Đã khắc phục toàn bộ phát hiện F1–F4 (vòng 1), R2-F2 và các điểm hiệu chỉnh báo cáo từ `docs/handoffs/CODEX_REAUDIT_REPORT.md` (vòng 2); chờ Codex nghiệm thu độc lập (chưa tự đánh dấu nghiệm thu).

---

## 1. Baseline nhận được & kiểm chứng trước khi sửa

- **Branch:** `main`
- **HEAD commit:** `f98382ba5c66e0c31b527528cb66c6410c0aa1bb`
- **Kiểm tra SHA-256 đối chiếu `docs/handoffs/GEMINI_FIX_BASELINE.json`:**
  - Tất cả các tệp bị cấm sửa (`.gitignore`, `Dockerfile`, `Procfile`, `functions/api/json.js`, `public/robots.txt`, `public/sitemap.xml`, `requirements.txt`, `start.bat`) giữ nguyên 100% mã băm SHA-256 như trong `GEMINI_FIX_BASELINE.json`.
- **Các thay đổi nền có sẵn của Codex được bảo toàn nguyên vẹn:**
  1. `start.bat`: Kiểm tra sự tồn tại của `.venv\Scripts\python.exe`, hiển thị hướng dẫn tạo lại `.venv` khi di chuyển sang `C:\Dev\check-ip-local`, kiểm tra mã thoát của `run.py`. Không chỉnh sửa `start.bat`; mã băm SHA-256 thực tế giữ nguyên `0f6e6b1f2790550ff5937d272e65c64a6e5790ce431aae57f7b9efae0531031e` (khớp tuyệt đối với `docs/handoffs/GEMINI_FIX_BASELINE.json`).
  2. `run.py`: Giữ nguyên hàm `get_primary_local_ip()`, cơ chế fallback về `"127.0.0.1"` khi lỗi socket, dòng thông báo URL LAN/Localhost và xử lý UTF-8 console trên Windows; chỉ bổ sung tham số `proxy_headers=False` vào lời gọi `uvicorn.run(...)` theo yêu cầu Đợt 2.
  3. `README.md`: Giữ nguyên phần hướng dẫn khắc phục lỗi `.venv` khi đổi đường dẫn thư mục sang `C:\Dev\check-ip-local` và mô tả cơ chế mở trình duyệt tự động; cập nhật các phần mô tả tính năng/route/bảo mật theo yêu cầu Đợt 4.
- **Khác biệt mới ngoài dự kiến trước khi làm:** Không có.

---

## 2. Bảng nghiệm thu theo từng đợt & tiêu chí

### Đợt 1 — Trung thực về VPN/Proxy và trạng thái dữ liệu

| Tiêu chí nghiệm thu | Trạng thái | Bằng chứng triển khai & kiểm thử | Chưa làm / Lý do |
| :--- | :--- | :--- | :--- |
| 1. `proxy: false, hosting: true` -> `detection_status: "not_detected"`, `is_hosting: true`, `is_vpn_or_proxy: false`, UI không kết luận đang bật VPN | **Đã làm** | `app/network.py`, `lib/ip.js`, `functions/api/info.js`, `public/app.js`; test `test_vpn_suspected_vs_hosting_signal_vs_not_detected` (`tests/test_check_ip.py`) và test #3 trong `tests/check_ip.test.js` | Không có |
| 2. `proxy: true` -> `detection_status: "suspected"`, `is_vpn_or_proxy: true`, UI hiển thị "Có dấu hiệu VPN/Proxy" | **Đã làm** | `app/network.py`, `lib/ip.js`, `functions/api/info.js`, `public/app.js`; test `test_vpn_suspected_vs_hosting_signal_vs_not_detected` | Không có |
| 3. Lookup timeout, HTTP 500, JSON hỏng, `status: "fail"` hoặc thiếu boolean `proxy` -> `detection_status: "unknown"`, UI hiện "Chưa đủ dữ liệu để đánh giá" | **Đã làm** | `app/network.py`, `functions/api/info.js`, `public/app.js`, `public/index.html`; test `test_upstream_errors_and_missing_proxy_flag_return_unknown_and_do_not_cache`, `test_slow_body_trickle_respects_total_lookup_deadline_and_caller_cancel` (`tests/test_check_ip.py`) và test #3, #4 (`tests/check_ip.test.js`) | Không có |
| 4. Loopback, RFC1918, link-local, CGNAT (`100.64.0.0/10`), documentation/reserved (bao gồm `3fff::/20`, `64:ff9b:1::/48`, `2001::/23` trừ ngoại lệ công cộng `.1/.2/.3`..., `192.0.0.0/24` trừ `.9/.10`, các dải ngoài `2000::/3` trừ `64:ff9b::/96`), IPv6 non-public, IPv4-mapped IPv6 non-public -> `detection_status: "not_applicable"`, không gọi upstream | **Đã làm** | `app/network.py` (`classify_ip`), `lib/ip.js` (`classifyIP`), `tests/fixtures.json` (87 IP cases); test `test_shared_ip_fixtures`, `test_non_public_and_invalid_ips_never_call_upstream` (`tests/test_check_ip.py`) và test #1, #3, #4 (`tests/check_ip.test.js`) | Không có |
| 5. `Asia/Saigon` và `Asia/Ho_Chi_Minh` không báo lệch múi giờ; lệch múi giờ thật chỉ hiện thông tin phụ, không tự đổi sang `suspected` | **Đã làm** | `normalize_timezone` (`app/network.py`), `normalizeTimezone` (`lib/ip.js`, `public/app.js`), `renderSecurityStatus` (`public/app.js`); test `test_timezone_normalization` (`tests/test_check_ip.py`) và test #6 (`tests/check_ip.test.js`) | Không có |
| 6. `CF-Connecting-IP` thiếu/sai ở `functions/api/info.js` và `functions/ip.js` -> trả `unavailable` (HTTP 503 khi thiếu, HTTP 400 khi sai định dạng) kèm `Cache-Control: no-store, max-age=0`, không trả `127.0.0.1` hay `X-Forwarded-For` | **Đã làm** | `extractPagesClientIP` (`lib/ip.js`), `functions/api/info.js`, `functions/ip.js`; test #2 và #3 (`tests/check_ip.test.js`) | Không có |

### Đợt 2 — Ranh giới tin cậy IP, không chặn event loop, quản lý upstream

| Tiêu chí nghiệm thu | Trạng thái | Bằng chứng triển khai & kiểm thử | Chưa làm / Lý do |
| :--- | :--- | :--- | :--- |
| 1. Header giả (`CF-Connecting-IP`, `X-Forwarded-For`, `X-Real-IP`) không thay đổi IP client ở Python direct mode; input invalid không được lookup | **Đã làm** | `extract_client_ip` (`app/main.py`), `run.py` (`proxy_headers=False`); test `test_direct_mode_ignores_forged_headers_and_isolates_clients`, `test_trusted_proxy_middleware_boundary`, `test_live_server_smoke_on_ephemeral_port` (`tests/test_check_ip.py`) | Không có |
| 2. Bộ fixture IP dùng chung giữa Python/JS đạt và các IP non-public không gọi upstream (còn các ngoại lệ công cộng như `64:ff9b::/96`, `2001:1::1..3/128`, `192.0.0.9..10/32` vẫn được tra cứu) | **Đã làm** | `tests/fixtures.json` (**87 IP cases** + **6 User-Agent cases**), chạy trên cả `tests/test_check_ip.py` (`test_shared_ip_fixtures`, `test_non_public_and_invalid_ips_never_call_upstream`) và `tests/check_ip.test.js` (test #1, #4) | Không có |
| 3. Nhiều ping mô phỏng cùng lúc chạy đồng thời; task heartbeat không bị chặn, tài nguyên (`writer.close()`, `writer.wait_closed()` có giới hạn thời gian + `transport.abort()` khi treo/cancel) được đóng khi thành công/thất bại/cancel | **Đã làm** | `ping_latency` + `_abort_writer_transport` dùng `asyncio.open_connection` và giới hạn cleanup `wait_closed()` trong `app/network.py`; test `test_concurrent_pings_do_not_block_event_loop_and_close_writers`, `test_ping_cleanup_bounded_and_aborts_transport_on_hang_or_cancel` (`tests/test_check_ip.py`) | Không có |
| 4. `/api/ping?host=192.168.1.1` và hostname tùy ý bị từ chối (HTTP 400) mà chưa mở kết nối | **Đã làm** | `ALLOWED_PING_HOSTS = frozenset({"8.8.8.8", "1.1.1.1"})` trong `app/network.py` & `app/main.py`; test `test_ping_rejects_disallowed_hosts_without_connecting` (`tests/test_check_ip.py`) | Không có |
| 5. Lookup treo hoặc đọc body nhỏ giọt được abort đúng tổng deadline 4s; client cancel khi đang đọc body được propagate `CancelledError`/`AbortError`; lỗi không làm đầy cache; TTL/eviction/budget/cooldown/context.cache có test dùng clock giả | **Đã làm** | `app/network.py` (`asyncio.timeout` cho toàn bộ chu kỳ lookup 4s) và `functions/api/info.js` (`AbortController` 4s + kiểm tra `request.signal.aborted`/`timedOut` quanh `res.json()` + bảo toàn TTL còn lại qua `X-Cached-At`); test `test_cache_ttl_lru_eviction_cooldown_and_budget`, `test_cancellation_propagates_and_does_not_cache`, `test_slow_body_trickle_respects_total_lookup_deadline_and_caller_cancel` (`tests/test_check_ip.py`) và test #3, #4 (`tests/check_ip.test.js`) | Không có |
| 6. Hai client khác IP liên tiếp không nhận dữ liệu cá nhân của nhau | **Đã làm** | `Cache-Control: no-store, max-age=0` trên mọi response IP/info, cache nội bộ đánh khóa theo `clientIP` đã xác thực; test `test_direct_mode_ignores_forged_headers_and_isolates_clients` (`tests/test_check_ip.py`) | Không có |

### Đợt 3 — Giao diện và thao tác thực tế

| Tiêu chí nghiệm thu | Trạng thái | Bằng chứng triển khai & kiểm thử | Chưa làm / Lý do |
| :--- | :--- | :--- | :--- |
| 1. HTTP LAN không có `navigator.clipboard` vẫn copy được bằng fallback nếu trình duyệt hỗ trợ; thất bại không có toast thành công | **Đã làm** | `copyText`, `fallbackCopyToClipboard`, `copyHeroIP` trong `public/app.js` kiểm tra giá trị trả về của `document.execCommand("copy")`; test #6 trong `tests/check_ip.test.js` | Không có |
| 2. Hai lần refresh, lần mới trả trước: cuối cùng vẫn hiển thị kết quả mới; lỗi cũ không đổi trạng thái mới | **Đã làm** | `fetchData()` trong `public/app.js` quản lý `activeRequestId` và `activeAbortController`; test #6 trong `tests/check_ip.test.js` kiểm tra cả response cũ thành công muộn và response cũ lỗi muộn | Không có |
| 3. `latitude=0` hoặc `longitude=0` được hiển thị đúng trên backend và UI | **Đã làm** | `parse_coordinate` (`app/network.py`), `parseCoordinate` (`lib/ip.js`, `public/app.js`); test `test_coordinate_parsing_preserves_zero_and_rejects_invalid` (`tests/test_check_ip.py`) và test #3, #6 (`tests/check_ip.test.js`) | Không có |
| 4. Fixture Opera/Android/iOS cho đúng nhãn | **Đã làm** | `parseUserAgent` trong `public/app.js` kiểm tra `OPR/` trước `Chrome/`, `Android` trước `Linux`, `iPhone/iPad/like Mac` trước `Mac`; test #6 (`tests/check_ip.test.js`) | Không có |
| 5. Không có `lucide`, startup vẫn fetch và hiển thị IP | **Đã làm** | `safeCreateIcons()` bọc `try/catch` và kiểm tra `typeof lucide !== "undefined"`; test #6 (`tests/check_ip.test.js`) | Không có |
| 6. UI desktop và viewport điện thoại: IPv6 dài không gây tràn ngang toàn trang | **Đã làm** | `overflow-x-hidden` trên `<body>`, `max-w-full min-w-0` trên flex container và `break-all min-w-0` trên `#client-ip-hero` (`public/index.html`). Đã được Codex xác minh bằng trình duyệt thực tế với fixture IPv6 dài (`2001:4860:4860:1234:5678:9abc:def0:8888`), trạng thái `unknown` và tọa độ `0` ở hai viewport `1280x900` và `375x812` (`overflow_x: 0` — xem Mục 2 `docs/handoffs/CODEX_AUDIT_REPORT.md`) | Không có |

### Đợt 4 — Tài liệu, SEO và frontend chuẩn

| Tiêu chí nghiệm thu | Trạng thái | Bằng chứng triển khai & kiểm thử | Chưa làm / Lý do |
| :--- | :--- | :--- | :--- |
| 1. `/robots.txt` và `/sitemap.xml` của Python trùng nội dung `public/` | **Đã làm** | `app/main.py` đọc trực tiếp `public/robots.txt` và `public/sitemap.xml`; test `test_seo_files_match_public_directory` và `test_live_server_smoke_on_ephemeral_port` (`tests/test_check_ip.py`) | Không có |
| 2. Không còn URL domain cũ (`https://checkip.vn`) trong metadata/snippet SEO; giữ thương hiệu `CheckIP.vn` trong prose | **Đã làm** | `public/index.html` đồng nhất `https://check-ip-web.pages.dev/` tại canonical, Open Graph, JSON-LD (`@id`, `url`) và cURL mặc định; test #5 (`tests/check_ip.test.js`) | Không có |
| 3. `README.md` không quảng cáo route/tính năng chưa có | **Đã làm** | Đã viết lại `README.md` mô tả đúng 2 chế độ (FastAPI vs Cloudflare Pages), bảng route thực tế, giới hạn HTTP `ip-api.com`, giới hạn phát hiện VPN/Proxy và giữ hướng dẫn `.venv` tại `C:\Dev\check-ip-local` | Không có |
| 4. Frontend vẫn tải từ `/app.js`, không còn reference tới tệp đã xóa (`app/static/*`) | **Đã làm** | Xóa `app/static/app.js` và `app/static/index.html` sau khi xác nhận không còn consumer; test `test_app_static_removed_and_public_is_canonical` (`tests/test_check_ip.py`) | Không có |
| 5. Các sửa đổi nền `run.py`/`start.bat` và môi trường tại `C:\Dev\check-ip-local` vẫn hoạt động | **Đã làm** | `test_run_py_preserves_codex_helpers_and_disables_proxy_headers`, `test_live_server_smoke_on_ephemeral_port` (`tests/test_check_ip.py`) | Không có |

---

## 3. Khắc phục các phát hiện Audit của Codex (Vòng 1: F1–F4 & Vòng 2: R2-F2)

| Mã phát hiện | Mô tả vấn đề từ báo cáo Audit / Re-audit của Codex | Giải pháp đã triển khai | Kiểm thử hồi quy |
| :--- | :--- | :--- | :--- |
| **F1** (`app/network.py`) | `httpx.AsyncClient(timeout=LOOKUP_TIMEOUT)` chỉ áp dụng timeout cho từng thao tác socket đơn lẻ, không áp tổng deadline `4.0s` khi server gửi body nhỏ giọt định kỳ. | Ghi nhận `deadline_start = time.monotonic()` ngay khi bắt đầu phần gọi mạng và bọc `await client.get(url)` trong `async with asyncio.timeout(remaining_timeout):`. Khi tổng thời gian vượt `LOOKUP_TIMEOUT` (`4.0s`), hủy request ngay lập tức và trả `unknown/lookup_timeout` không ghi cache; nếu caller cancel thì truyền nguyên vẹn `asyncio.CancelledError`. | `test_slow_body_trickle_respects_total_lookup_deadline_and_caller_cancel` trong `tests/test_check_ip.py` và `docs/handoffs/audit_round2.py` (`passed: true`). |
| **F2 & R2-F2** (`app/network.py`, `lib/ip.js`, `tests/fixtures.json`) | Vòng 1: Thiếu `3fff::/20`, các dải ngoài `2000::/3` như `100:0:0:1::1`, và các ngoại lệ trong `2001::/23` & `192.0.0.0/24`.<br>Vòng 2 (**R2-F2**): Thiếu `2001:1::3/128` (DNS-SD SRP Anycast, RFC 9665) trong ngoại lệ `2001::/23` và chưa xử lý ngoại lệ globally reachable `64:ff9b::/96` (RFC 6052 Well-Known Prefix) trước cổng loại ngoài `2000::/3` (cần phân biệt với `64:ff9b:1::/48` RFC 8215 không globally reachable). | Cập nhật `_classify_ipv4`/`_classify_ipv6` (`app/network.py`) và `classifyIPv4Octets`/`classifyIPv6Words` (`lib/ip.js`) xét các ngoại lệ cụ thể trước quy tắc rộng:<br>1. Xét `64:ff9b::/96` là `public` (`lookup_eligible: true`) trước điều kiện loại ngoài `2000::/3`; giữ `64:ff9b:1::/48` và các biên ngoài `/96` (`64:ff9b::1:0:0`, `64:ff9a:ffff:...`) là `reserved` (`lookup_eligible: false`).<br>2. Bổ sung `2001:1::3/128` vào danh sách ngoại lệ công cộng của `2001::/23` (cùng `2001:1::1/128`, `2001:1::2/128`, `2001:3::/32`, `2001:4:112::/48`, `2001:20::/28`, `2001:30::/28`), giữ các địa chỉ sát biên (`2001:1::`, `2001:1::4`, `2001::1`) là `reserved`.<br>3. Giữ `3fff::/20` là `documentation` và `192.0.0.9/32`, `192.0.0.10/32` là `public`. | Mở rộng `tests/fixtures.json` (từ 56 -> 81 ở vòng 1 -> **87 IP cases** ở vòng 2); kiểm tra `is_public`, `is_private`, `lookup_eligible` và số lần gọi upstream trong `tests/test_check_ip.py`, `tests/check_ip.test.js`, `audit_round2.py` và `audit_round2.cjs` (`passed: true`). |
| **F3** (`functions/api/info.js`) | `await res.json()` bắt mọi lỗi thành `lookup_invalid_json`, nuốt mất `AbortError` khi client hủy hoặc timeout hết hạn trong lúc đọc body; đồng thời `context.cache` khi nạp lại vào `_isolateCache` chưa tính phần TTL còn lại. | Kiểm tra `request.signal.aborted` và `timedOut` trong khối `catch` và ngay sau khi `await res.json()` hoàn tất: nếu client hủy thì ném `createAbortError()`, nếu hết hạn deadline thì trả `unknown/lookup_timeout`, chỉ trả `lookup_invalid_json` khi JSON thực sự lỗi. Bổ sung header `X-Cached-At` khi ghi vào `context.cache` và tính `remainingTtlMs = CACHE_TTL_MS - elapsed` khi nạp vào `_isolateCache`. | Test #4 trong `tests/check_ip.test.js` và `docs/handoffs/audit_round2.cjs` (`passed: true`). |
| **F4** (`app/network.py`) | `await writer.wait_closed()` trong `finally` của `ping_latency()` không có timeout bảo vệ, có thể giữ task nếu tầng đóng socket bị treo. | Bọc `await writer.wait_closed()` bằng `asyncio.wait_for(..., timeout=min(0.2, max(0.005, float(timeout))))` và gọi `writer.transport.abort()` qua `_abort_writer_transport(writer)` nếu `wait_closed()` quá hạn, lỗi hoặc bị cancel, đồng thời bảo toàn `CancelledError` của caller. | `test_ping_cleanup_bounded_and_aborts_transport_on_hang_or_cancel` trong `tests/test_check_ip.py` và `docs/handoffs/audit_round2.py` (`passed: true`). |

---

## 4. Danh sách toàn bộ tệp thêm / sửa / xóa

### 4.1. Các tệp có sửa đổi nền của Codex (được bảo toàn)
- `start.bat` — **Giữ nguyên 100% của Codex** (không chỉnh sửa thêm, SHA-256: `0f6e6b1f2790550ff5937d272e65c64a6e5790ce431aae57f7b9efae0531031e`).
- `run.py` — **Giữ nguyên phần sửa của Codex** (`get_primary_local_ip()`, fallback `"127.0.0.1"`, thông báo URL, UTF-8 console) + **Gemini bổ sung** `proxy_headers=False` trong `uvicorn.run(...)`.
- `README.md` — **Giữ nguyên nội dung hướng dẫn `.venv` khi đổi đường dẫn sang `C:\Dev\check-ip-local` của Codex** + **Gemini cập nhật** tài liệu kỹ thuật trung thực cho 2 chế độ chạy, danh sách route và giới hạn thực tế.

### 4.2. Các tệp do Gemini chỉnh sửa
- `app/network.py` — Phân loại IP chuẩn (`classify_ip`, `is_private_ip`) đồng bộ với IANA special-purpose registries và các ngoại lệ công cộng (`64:ff9b::/96`, `2001:1::1..3/128`, `2001:3::/32`, `2001:4:112::/48`, `2001:20::/28`, `2001:30::/28`, `192.0.0.9..10/32`), hợp đồng `security` 4 trạng thái (`detection_status`, `source`, `reason`), chuẩn hóa múi giờ (`normalize_timezone`), giữ tọa độ `0` (`parse_coordinate`), LRU cache giới hạn 1024 mục / TTL 3600s dùng monotonic clock, giới hạn 40 calls/phút + cooldown theo `X-Rl`/`X-Ttl`/HTTP 429, áp tổng deadline 4s (`asyncio.timeout`) cho toàn bộ chu kỳ `lookup_ip_info`, và `ping_latency` bất đồng bộ có giới hạn thời gian đóng socket (`wait_closed`) kèm `transport.abort()`.
- `app/main.py` — Chỉ lấy IP từ `request.client.host` đã qua `classify_ip`, trả HTTP `503` khi IP thiếu hoặc không hợp lệ, gắn `Cache-Control: no-store, max-age=0`, đặt `datacenter: None`, giới hạn `/api/ping` chỉ nhận `8.8.8.8` và `1.1.1.1` (trả HTTP `400` nếu khác), phục vụ `/robots.txt` và `/sitemap.xml` trực tiếp từ `public/`.
- `functions/api/info.js` — Xác thực `CF-Connecting-IP` qua `extractPagesClientIP`, trả HTTP `503` (khi thiếu header) hoặc HTTP `400` (khi header sai định dạng) với `status: "unavailable"`, không gọi upstream cho IP nội bộ/đặc biệt, áp dụng `AbortController` tổng deadline 4s cho cả pha nhận header lẫn đọc body JSON, propagate `AbortError` khi client hủy trong/ngay sau khi đọc body, LRU cache trong isolate + optional `context.cache` adapter (kèm bảo toàn TTL còn lại qua `X-Cached-At`) chỉ cho kết quả thành công có `proxy` kiểu boolean, giới hạn 40 calls/phút + cooldown `X-Rl`/`X-Ttl`/429, giữ thông tin `request.cf` hợp lệ khi upstream lỗi nhưng `detection_status` là `"unknown"`.
- `functions/ip.js` — Xác thực `CF-Connecting-IP` qua `extractPagesClientIP`, trả HTTP `503` (khi thiếu) hoặc HTTP `400` (khi không hợp lệ) với nội dung `unavailable\n` kèm `Cache-Control: no-store, max-age=0`.
- `public/index.html` — Trạng thái khởi tạo trung tính ("Đang xác định...", "Đang kiểm tra trạng thái...", không mặc định xanh "An toàn" hay `SGN`/`VN`), đồng nhất URL `https://check-ip-web.pages.dev/`, cập nhật nội dung giải thích giới hạn VPN/Proxy/Geolocation và chính sách dữ liệu/cache/log trung thực, chống tràn ngang cho IPv6 dài.
- `public/app.js` — Hiển thị nhãn hero và trạng thái bảo mật theo `detection_status`, so sánh múi giờ phụ đã chuẩn hóa alias, quản lý thứ tự request bằng `activeRequestId` + `AbortController`, kiểm tra kết quả thực của `execCommand("copy")`, sửa thứ tự nhận diện User-Agent, giữ tọa độ `0`, bọc an toàn `lucide.createIcons()`.
- `package.json` — Chỉ thêm script `"test": "node --experimental-vm-modules --test"` (giữ nguyên version, dependencies và CommonJS mode).

### 4.3. Các tệp do Gemini thêm mới
- `lib/ip.js` — Module dùng chung cho Cloudflare Pages Functions (phân tích/phân loại IPv4 & IPv6 đồng bộ 100% với Python, `extractPagesClientIP`, chuẩn hóa múi giờ, kiểm tra tọa độ, tạo đối tượng `security`).
- `tests/fixtures.json` — Bộ dữ liệu kiểm thử dùng chung cho cả Python và Node.js (**87 trường hợp phân loại IP** và **6 trường hợp User-Agent**; tăng từ 56 ở bản đầu -> 81 sau audit vòng 1 -> 87 sau re-audit vòng 2).
- `tests/test_check_ip.py` — Bộ kiểm thử tự động Python (`unittest`, **19 tests**).
- `tests/check_ip.test.js` — Bộ kiểm thử tự động Node.js (`node:test`, **6 top-level tests**, `suites 0`).
- `docs/handoffs/GEMINI_FIX_REPORT.md` — Báo cáo bàn giao này.

### 4.4. Các tệp do Gemini xóa
- `app/static/app.js` — Bản sao frontend cũ không còn được sử dụng.
- `app/static/index.html` — Bản sao giao diện cũ không còn được sử dụng.

---

## 5. Quyết định hợp đồng dữ liệu (Security / IP / Proxy / Cache) & Tương thích ngược

1. **Đối tượng `security` trong `/api/info` và `/api/json`:**
   - Giữ nguyên các trường cũ để tương thích ngược với client hiện có:
     - `is_vpn_or_proxy` (`boolean`): Chỉ `true` khi `detection_status === "suspected"` (`data.proxy === true` từ dữ liệu tra cứu hợp lệ). Khi `detection_status` là `"unknown"`, `"not_applicable"`, hoặc `"not_detected"`, giá trị này là `false`.
     - `is_hosting` (`boolean`): `true` khi `data.hosting === true` hoặc ASN/ISP khớp danh sách mạng lưu trữ/cloud đã biết. Không tự suy ra `is_vpn_or_proxy = true` chỉ từ `is_hosting`.
     - `confidence` (`string`) và `type` (`string`): Mô tả tiếng Việt phản ánh đúng 4 trạng thái.
   - Các trường mới bổ sung:
     - `detection_status`: `"unknown" | "not_applicable" | "not_detected" | "suspected"`.
     - `source`: `"ip-api" | "local" | "asn_heuristic" | "none"`.
     - `reason`: Mã lý do kỹ thuật (`"proxy_detected"`, `"proxy_and_hosting_detected"`, `"hosting_signal_only"`, `"asn_hosting_signal"`, `"no_proxy_signal"`, `"non_public_ip"`, `"missing_client_ip"`, `"invalid_client_ip"`, `"lookup_timeout"`, `"lookup_rate_limited"`, `"rate_limit_cooldown"`, `"budget_exhausted"`, `"lookup_http_error"`, `"lookup_invalid_json"`, `"lookup_status_fail"`, `"missing_proxy_flag"`...).
2. **Hợp đồng mã HTTP khi không xác định được IP client (phân biệt rõ theo nền tảng):**
   - **Python FastAPI (`app/main.py`):** Khi `request.client.host` bị thiếu hoặc không hợp lệ (`classify_ip` trả `is_valid=False`), `/api/info` và `/api/json` luôn trả HTTP **`503`** với `status: "unavailable"`, `ip: null`, `security.detection_status: "unknown"`; còn `/ip` và `/api/raw` trả HTTP **`503`** với nội dung `"unavailable"`. Mọi phản hồi đều gắn `Cache-Control: no-store, max-age=0`.
   - **Cloudflare Pages Functions (`functions/api/info.js`, `functions/api/json.js`, `functions/ip.js`):**
     - Khi thiếu header `CF-Connecting-IP` (`reason: "missing_client_ip"`): trả HTTP **`503`** (`status: "unavailable"` trên JSON hoặc `"unavailable\n"` trên `/ip`).
     - Khi có header `CF-Connecting-IP` nhưng giá trị sai định dạng/không hợp lệ (`reason: "invalid_client_ip"`): trả HTTP **`400`** (`status: "unavailable"` trên JSON hoặc `"unavailable\n"` trên `/ip`).
     - Mọi phản hồi đều gắn `Cache-Control: no-store, max-age=0`.
3. **Chính sách Cache:**
   - Phản hồi trả về cho trình duyệt/client luôn gắn `Cache-Control: no-store, max-age=0` để ngăn CDN hoặc trình duyệt dùng chung kết quả giữa các kết nối khác nhau.
   - Cache nội bộ (Python `_geo_cache` và Pages `_isolateCache` / optional `context.cache`) chỉ lưu kết quả tra cứu upstream thành công có `status === "success"` và `typeof proxy === "boolean"`, đánh khóa theo địa chỉ IP công cộng đã xác thực, tối đa `1024` mục (LRU), TTL `3600` giây. Khi đọc lại từ `context.cache` qua header `X-Cached-At`, `_isolateCache` chỉ lưu với phần TTL còn lại (`CACHE_TTL_MS - elapsed`).

---

## 6. Kết quả chạy kiểm thử thực tế

Tất cả các lệnh kiểm tra bắt buộc tại Mục 7 của kế hoạch và hai probe re-audit của Codex đã được thực thi tại `C:\Dev\check-ip-local`:

| Lệnh kiểm tra | Số lượng test | Mã thoát (Exit Code) | Kết quả tóm tắt |
| :--- | :---: | :---: | :--- |
| `.\.venv\Scripts\python.exe -X utf8 -m unittest discover -s tests -p "test_*.py" -v` | **19 tests** | `0` | `Ran 19 tests in 15.462s — OK` (bao gồm syntax compile check, 87 shared IP fixtures, kiểm tra `is_public`/`is_private`/`lookup_eligible` + số lần gọi upstream cho dải đặc biệt & ngoại lệ công cộng `64:ff9b::/96`, `2001:1::1..3/128`, `192.0.0.9..10/32`, coordinate/timezone helpers, cache TTL/LRU/budget/cooldown, total 4s lookup deadline trước slow-body trickle & caller cancel, async concurrent ping + bounded cleanup/transport abort, direct mode header spoofing resistance, `ProxyHeadersMiddleware` boundary, và live Uvicorn smoke test) |
| `.\.venv\Scripts\python.exe -m pip check` | N/A | `0` | `No broken requirements found.` |
| `node --experimental-vm-modules --test` | **6 tests** (`suites 0`) | `0` | `tests 6, suites 0, pass 6, fail 0` (bao gồm 87 shared IP fixtures trên `lib/ip.js`, `functions/ip.js`, `functions/api/info.js` + `functions/api/json.js` với cache/TTL/LRU/429/budget/timeout/cf-fallback, F2/R2-F2/F3 lookup eligibility + body abort/timeout vs invalid JSON + optional `context.cache` adapter với bảo toàn remaining TTL, kiểm tra HTML/SEO tĩnh và `public/app.js` DOM behavior) |
| `.\.venv\Scripts\python.exe -X utf8 docs\handoffs\audit_round2.py` | Probe F1, F2/R2-F2, F4 | `0` | `{"failures": []}` — Tất cả 5 IP (`3fff::1`, `100:0:0:1::1`, `2001:1::1`, `2001:1::3`, `64:ff9b::808:808`), F1 (`4.018s`) và F4 (`0.025s`) đều `passed: true` |
| `node --experimental-vm-modules docs\handoffs\audit_round2.cjs` | Probe F2/R2-F2, F3 | `0` | `{"failures": []}` — Tất cả 5 IP (`3fff::1`, `100:0:0:1::1`, `2001:1::1`, `2001:1::3`, `64:ff9b::808:808`) và F3 đều `passed: true` |
| `git -c core.safecrlf=false diff --check` | N/A | `0` | Không có lỗi khoảng trắng thừa hoặc conflict marker |
| `git status --short` | N/A | `0` | Chỉ hiển thị đúng các tệp thuộc phạm vi kế hoạch và các tệp audit do Codex tạo |

- **Kiểm tra trình duyệt & giao diện:**
  - Trong bộ test của Gemini: kiểm thử hành vi DOM/VM qua `tests/check_ip.test.js` (bao gồm các kịch bản render trạng thái bảo mật, lệch múi giờ, tọa độ `0`, IP nội bộ, thứ tự User-Agent, clipboard và race condition khi refresh) và HTTP smoke test thực tế tới Uvicorn server qua `tests/test_check_ip.py`.
  - Bằng chứng trình duyệt độc lập từ Codex (Mục 2 `docs/handoffs/CODEX_AUDIT_REPORT.md` & Mục 4 `docs/handoffs/CODEX_REAUDIT_REPORT.md`): Codex đã chạy `docs/handoffs/audit_ui_server.py` phục vụ fixture IPv6 dài (`2001:4860:4860:1234:5678:9abc:def0:8888`) với trạng thái `unknown`, múi giờ `America/New_York` và tọa độ `0` (`0, 0`), kiểm tra trên trình duyệt ở hai kích thước `1280x900` và `375x812`, xác nhận `overflow_x: 0` (không tràn ngang), hiển thị đúng tọa độ `0.000, 0.000`, nhãn bảo mật trung thực ("Chưa đủ dữ liệu để đánh giá") và cảnh báo lệch múi giờ chỉ mang tính phụ trợ.

---

## 7. Tình huống lỗi / Cancel / Timeout & Giới hạn chưa giải quyết

1. **Giới hạn của `ip-api.com` bản miễn phí (HTTP & 45 requests/phút):**
   - Endpoint miễn phí của `ip-api.com` chỉ hỗ trợ giao thức `http://` và giới hạn 45 yêu cầu/phút cho mỗi IP nguồn gọi đi.
   - Đã giảm thiểu bằng LRU cache (TTL 1 giờ, tối đa 1024 IP), giới hạn ngân sách nội bộ 40 yêu cầu/phút và tự động kích hoạt thời gian nghỉ (cooldown 1–300 giây) khi nhận `X-Rl <= 0` hoặc HTTP `429`.
   - Tuy nhiên, trên Cloudflare Pages Functions, các isolate tại những trung tâm dữ liệu (colo) khác nhau không chia sẻ bộ nhớ RAM, và khi hết ngân sách hoặc bị giới hạn tần suất, ứng dụng sẽ trả về `detection_status: "unknown"` (kèm dữ liệu địa lý cơ bản từ `request.cf` nếu có) thay vì đoán mò trạng thái VPN/Proxy.
2. **Hủy yêu cầu (Cancellation) & Timeout:**
   - Ở Python (`app/network.py`), toàn bộ chu kỳ gọi upstream (bao gồm cả kết nối và đọc toàn bộ body phản hồi) được bọc trong `asyncio.timeout` với tổng hạn mức `4.0s` tính từ đầu; `asyncio.CancelledError` từ caller được truyền nguyên vẹn lên trên và không bao giờ được ghi vào cache. Trong `ping_latency`, `writer.close()` và `await writer.wait_closed()` trong khối `finally` được giới hạn tối đa `0.2s` và sẽ gọi `writer.transport.abort()` nếu việc đóng kết nối bị treo hoặc bị hủy.
   - Ở Pages (`functions/api/info.js`), `AbortController` hủy kết nối upstream sau `4000ms` hoặc ngay khi `request.signal` của client báo hủy; việc hủy hoặc quá hạn xảy ra trong lúc `await res.json()` hay ngay ranh giới hoàn tất `res.json()` đều được phân loại chính xác (`AbortError` được truyền lên caller, timeout trả `unknown/lookup_timeout`) và không bao giờ lưu vào cache.
   - Ở Frontend (`public/app.js`), khi người dùng bấm "Làm mới" liên tiếp, yêu cầu trước đó bị `abort()` và mọi phản hồi hoặc lỗi đến muộn từ `requestId` cũ đều bị bỏ qua.

---

## 8. Các hạng mục chưa kiểm chứng (Unverified)

Theo nguyên tắc báo cáo trung thực tại Mục 6 & 8 của `GEMINI_FIX_PLAN.md`, các hạng mục sau được ghi nhận là **chưa kiểm chứng** trong môi trường local hiện tại:
- **Docker build & container runtime:** Chưa kiểm chứng (`Dockerfile` không bị sửa đổi và không chạy lệnh build container trong phiên này).
- **Wrangler CLI preview & Cloudflare Edge Cache API thực tế (`caches.default`):** Logic adapter `context.cache` (đọc/ghi, bảo toàn phần TTL còn lại qua `X-Cached-At`, và xử lý lỗi khi `match`/`put` ném ngoại lệ) đã được kiểm thử đơn vị bằng mock adapter trong `tests/check_ip.test.js`; tuy nhiên hành vi `caches.default` trên runtime Cloudflare Edge thực tế và `wrangler pages dev` chưa được kiểm chứng local.
- **Cloudflare Dashboard & cấu hình triển khai thực tế:** Chưa kiểm chứng (không có quyền truy cập vào Cloudflare Dashboard để xem Git integration, production branch hay build settings).
- **Website production (`https://check-ip-web.pages.dev/`):** Chưa kiểm chứng sau các thay đổi local này vì theo đúng ràng buộc bàn giao, không thực hiện `git commit`, `git push` hay deploy.

---

## 9. Đề xuất Follow-up Hardening ngoài phạm vi đợt này

1. **Nâng cấp nhà cung cấp tra cứu IP lên HTTPS có xác thực:** Thay thế `http://ip-api.com/json/...` bằng dịch vụ hỗ trợ HTTPS (hoặc tận dụng Cloudflare Radar / Bot Management / Paid IP Intelligence API) kèm biến môi trường lưu API key để loại bỏ kết nối HTTP rõ ở phía server và tránh giới hạn 45 req/phút.
2. **Đóng gói tài nguyên Frontend tĩnh:** Biên dịch sẵn Tailwind CSS tại bước build và tự host bộ biểu tượng SVG cần dùng thay vì phụ thuộc vào `cdn.tailwindcss.com` và `unpkg.com/lucide@latest` lúc chạy.
3. **Quản lý phụ thuộc & CI/CD:** Tạo lockfile xác định phiên bản phụ thuộc, thêm `.dockerignore` (loại trừ `.venv/`, `.git/`, `tests/`, `docs/`) và thiết lập GitHub Actions chạy tự động cả `unittest` lẫn `node --experimental-vm-modules --test`.

---

## 10. Xác nhận tuân thủ ràng buộc bàn giao

- **Không commit / push / deploy:** Xác nhận chưa chạy `git commit`, `git push`, hoặc bất kỳ lệnh deploy nào.
- **Không sửa `.venv` hoặc các tệp bị cấm:** Xác nhận không chỉnh sửa `.venv/`, `.git/`, `start.bat`, `requirements.txt`, `Dockerfile`, `Procfile`, `docs/handoffs/GEMINI_FIX_PLAN.md`, `docs/handoffs/GEMINI_FIX_BASELINE.json`, `docs/handoffs/PRE_GEMINI_EXISTING_CHANGES.patch`, `docs/handoffs/CODEX_AUDIT_REPORT.md`, `docs/handoffs/CODEX_AUDIT_SNAPSHOT.json`, `docs/handoffs/CODEX_REAUDIT_REPORT.md`, `docs/handoffs/CODEX_REAUDIT_SNAPSHOT.json`, `docs/handoffs/audit_repro.py`, `docs/handoffs/audit_repro.cjs`, `docs/handoffs/audit_ui_server.py`, `docs/handoffs/audit_round2.py`, `docs/handoffs/audit_round2.cjs`.
- **Không chạm vào ổ `D:`:** Xác nhận mọi thao tác đọc/ghi và thực thi trong phiên sửa lỗi này chỉ diễn ra tại `C:\Dev\check-ip-local`, không chạm vào bất kỳ tệp hay tiến trình nào trên ổ `D:`.
