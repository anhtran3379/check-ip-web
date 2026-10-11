# Audit độc lập bản sửa lỗi Gemini

- Ngày: 2026-10-11; workspace: `C:\Dev\check-ip-local`.
- Kết luận: **changes-required**. Chưa nghiệm thu toàn bộ, chưa sẵn sàng publish.
- Đối chiếu: `GEMINI_FIX_PLAN.md`, `GEMINI_FIX_BASELINE.json`, `PRE_GEMINI_EXISTING_CHANGES.patch`, báo cáo Gemini và source/test thực tế.
- HEAD vẫn là `f98382ba5c66e0c31b527528cb66c6410c0aa1bb`, branch `main`.
- Codex chỉ thêm tài liệu và chương trình tái hiện audit; không sửa source ứng dụng, không commit/push/deploy.

## 1. Các lỗi cần sửa trước khi nghiệm thu

### F1 — [P2] Python chưa có deadline tổng 4 giây cho lookup

Vị trí: `app/network.py:454–456`.

`httpx.AsyncClient(timeout=4)` giới hạn thời gian của từng hoạt động mạng, không giới hạn tổng thời gian request. Upstream gửi dữ liệu từng phần, mỗi phần cách nhau dưới 4 giây, vẫn giữ lookup chạy quá deadline và có thể làm frontend hết thời gian chờ trước backend. [Tài liệu timeout của HTTPX](https://www.python-httpx.org/advanced/timeouts/) mô tả read timeout theo từng chunk nhận được.

Tái hiện bằng server TCP loopback thật và HTTPX thật, chỉ thay transport để không gọi ip-api: body JSON được gửi thành ba phần, cách nhau 1,75 giây. Lookup trả `not_detected` sau **6,314 giây** dù `LOOKUP_TIMEOUT=4`. Test Gemini hiện chỉ mock HTTPX ném TimeoutException, nên không kiểm chứng deadline thực.

Yêu cầu sửa: đặt deadline tổng cho thao tác mạng bằng `asyncio.timeout` hoặc tương đương; giữ cleanup client và truyền cancellation từ caller. Hết deadline trả `unknown/lookup_timeout`, không cache kết quả dở dang.

Nghiệm thu: regression test upstream nhỏ giọt như trên phải kết thúc trong khoảng 4 giây cộng sai số scheduling hợp lý, kiểm tra upstream bị đóng/hủy và không ghi cache; cancellation từ caller vẫn được truyền.

### F2 — [P2] Phân loại sai các dải IPv6 đặc biệt và ngoại lệ public

Vị trí: `app/network.py:115–142`, `lib/ip.js:126–175`.

Hai runtime dùng danh sách loại trừ thủ công rồi mặc định phần còn lại là public. Cả Python và JS hiện trả:

| IP tổng hợp | Hiện tại | Kết quả cần có |
| --- | --- | --- |
| `3fff::1` | public, lookup eligible | documentation, không lookup |
| `100:0:0:1::1` | public, lookup eligible | dải đặc biệt không globally reachable, không lookup |
| `2001:1::1` | reserved, không lookup | ngoại lệ globally reachable trong `2001::/23` |

Hai trường hợp đầu cho phép gửi IP non-public tới dịch vụ tra cứu và hiển thị nhãn công cộng sai; trường hợp thứ ba bỏ qua tra cứu của IP globally reachable. [Registry IPv6 chính thức của IANA](https://www.iana.org/assignments/iana-ipv6-special-registry/) ghi nhận `3fff::/20` là documentation, `100:0:0:1::/64` là dummy prefix không globally reachable, và `2001:1::1/128` là ngoại lệ globally reachable. Registry cũng yêu cầu xét allocation cụ thể hơn bên trong `2001::/23`.

Yêu cầu sửa: thống nhất chính sách theo registry, xử lý prefix cụ thể trước prefix rộng và xem lại các trường hợp tương tự của IPv4/IPv6; không coi mọi địa chỉ vượt qua vài điều kiện loại trừ là public. Giữ quy tắc IPv4-mapped theo IPv4 nhúng.

Nghiệm thu: thêm fixture chung cho các trường hợp trên và biên prefix; kiểm tra cả classification lẫn số lần gọi upstream. Non-public không được lookup; các ngoại lệ public không bị gán nội bộ.

### F3 — [P2] Pages nuốt cancellation trong khi đọc response body

Vị trí: `functions/api/info.js:397–402`.

`catch` quanh `await res.json()` bắt cả AbortError và chuyển thành `lookup_invalid_json`. Vì vậy nhánh truyền cancellation ở catch bên ngoài không chạy khi client hủy sau khi fetch đã nhận headers nhưng body còn đang đọc. Deadline hết trong giai đoạn này cũng có thể bị ghi sai reason thành invalid JSON.

Tái hiện bằng module ESM source thật, Request/AbortController thật và body-reader tổng hợp nhận signal: hủy request sau khi `json()` bắt đầu; handler vẫn trả **HTTP 200**, `status=success`, `security.reason=lookup_invalid_json`, trong khi `request.signal.aborted=true`.

Yêu cầu sửa: phân biệt lỗi JSON thực với abort/timeout; truyền cancellation của client tới caller, trả `unknown/lookup_timeout` cho deadline của lookup. Kiểm tra signal trước khi lưu kết quả sau một await.

Nghiệm thu: test abort trước headers, trong body và tại ranh giới body hoàn tất; không cache khi bị hủy, không trả thành công cho cancellation; timeout trong body được phân loại đúng. Test hiện có chỉ cover deadline trước khi fetch trả response.

### F4 — [P2] Cleanup ping có thể chờ vô hạn ngoài timeout

Vị trí: `app/network.py:588–594`.

Timeout chỉ bao quanh `open_connection`; sau đó `await writer.wait_closed()` không có giới hạn. Vì hàm trả về phải đi qua `finally`, nếu cleanup không hoàn tất thì `/api/ping`, `/api/info` và `/api/json` có thể chờ quá thời gian dự kiến dù kết nối TCP đã mở xong.

Tái hiện bằng writer tổng hợp có `wait_closed()` không resolve: cấu hình timeout 0,02 giây, sau 0,15 giây task vẫn pending và `writer.close()` đã được gọi. Đây là kiểm thử failure path bằng mock; chưa tái hiện được socket OS thật bị treo cleanup. Test Gemini hiện chỉ dùng `wait_closed()` hoàn tất ngay.

Yêu cầu sửa: giới hạn thời gian cleanup, có phương án abort transport khi đóng không xong; giữ truyền cancellation và không bỏ qua cleanup cần thiết.

Nghiệm thu: test đóng bình thường, đóng treo và caller cancellation; task kết thúc có giới hạn, close/abort thực sự được gọi, event loop không bị chặn.

## 2. Phần đã kiểm chứng đạt

- Security có bốn trạng thái, không suy ra VPN chỉ từ hosting/ASN hoặc lệch múi giờ; không mặc định vị trí VN/edge SGN hay nhãn an toàn.
- Python direct mode dùng socket peer; header giả không đổi IP. Trusted proxy được test qua middleware. Pages xác thực CF-Connecting-IP và không fallback tùy ý sang X-Forwarded-For.
- No-store cho response cá nhân; cache RAM có TTL/LRU/max size, không lưu lookup lỗi và thiếu cờ proxy; có budget/cooldown cơ bản trong phạm vi tiến trình/isolate.
- UI giữ request mới nhất, clipboard kiểm tra kết quả fallback, giữ tọa độ 0, nhận diện UA theo thứ tự phù hợp và chạy khi Lucide không có.
- Frontend chuẩn tại public; SEO thống nhất domain, Python phục vụ robots/sitemap cùng nội dung; README mô tả hai chế độ và giới hạn thực tế.
- Kiểm tra bằng trình duyệt thực với fixture API IPv6 dài, unknown và tọa độ `(0,0)`: viewport 1280×900 và 375×812 đều không tràn ngang; document widths/scrollWidths lần lượt 1265/1265 và 360/360. Không có console error được ghi nhận. Đây là QA assets/UI bằng response tổng hợp, không phải kiểm chứng Cloudflare production. Đã reset viewport, đóng tab và dừng server audit.

## 3. Kiểm thử do Codex chạy độc lập

| Kiểm tra | Kết quả |
| --- | --- |
| Python unittest discover | 17 pass, exit 0; bao gồm Uvicorn smoke và các endpoint |
| Node `--experimental-vm-modules --test` | 5 top-level tests pass, 0 fail, exit 0 |
| pip check | Không có dependency hỏng, exit 0 |
| `git -c core.safecrlf=false diff --check` | Pass, exit 0 |
| Python audit probe | Tái hiện F1/F2/F4; exit 0 xác nhận hành vi lỗi còn tồn tại |
| Node audit probe | Tái hiện F2/F3; exit 0 xác nhận hành vi lỗi còn tồn tại |

Node test runner ban đầu bị sandbox từ chối tạo subprocess (`EPERM`), sau đó chạy lại với escalation được chấp thuận và pass. Các probe chỉ dùng dữ liệu tổng hợp/local, không cần account hoặc gọi upstream thật. Exit 0 của probe **không phải** bằng chứng lỗi đã sửa: các assert được viết để xác nhận hành vi lỗi hiện tại.

Chạy lại probe từ root repo:

```powershell
$env:PYTHONPATH='C:\Dev\check-ip-local'
.\.venv\Scripts\python.exe -X utf8 docs\handoffs\audit_repro.py
node --experimental-vm-modules docs\handoffs\audit_repro.cjs
```

Sau khi sửa, chuyển các tình huống tái hiện thành regression tests khẳng định hành vi đúng trong bộ test chính.

## 4. Phạm vi và baseline

Gemini sửa: `README.md`, `app/main.py`, `app/network.py`, `functions/api/info.js`, `functions/ip.js`, `package.json`, `public/app.js`, `public/index.html`, `run.py`.

Gemini thêm: `lib/ip.js`, `tests/fixtures.json`, `tests/test_check_ip.py`, `tests/check_ip.test.js`, `docs/handoffs/GEMINI_FIX_REPORT.md`.

Gemini xóa: `app/static/app.js`, `app/static/index.html`. Consumer đã chuyển sang public.

`start.bat` xuất hiện trong git diff vì thay đổi nền có trước Gemini; SHA-256 vẫn khớp baseline. `.gitignore`, requirements, Dockerfile, Procfile, functions/api/json.js, robots.txt và sitemap.xml cũng khớp baseline. `run.py` giữ helper/fallback của Codex và bổ sung `proxy_headers=False`. Không có thay đổi version/dependency/module mode hoặc lockfile mới được phát hiện.

Codex thêm trong audit: báo cáo này, `audit_repro.py`, `audit_repro.cjs`, `audit_ui_server.py` và snapshot hashes `CODEX_AUDIT_SNAPSHOT.json`. Không sửa báo cáo Gemini để giữ nguyên bằng chứng bàn giao.

## 5. Các điểm cần sửa trong báo cáo / bổ sung bằng chứng

- SHA-256 start.bat được Gemini ghi sai. Giá trị thực và baseline là `0f6e6b1f2790550ff5937d272e65c64a6e5790ce431aae57f7b9efae0531031e`; source start.bat không bị sửa thêm.
- Fixture thực có **56 IP cases**, không phải 53; Node output có **5 tests, 0 suites**, không phải 5 suites.
- Không được đánh dấu timeout/cancellation/phân loại IP đạt toàn bộ trước khi giải quyết F1–F4. Browser QA nay đã được Codex bổ sung với giới hạn ở mục 2.
- Nhánh optional `context.cache` chưa có test adapter trong bộ test hiện tại. Nếu giữ nhánh này, bổ sung test read/write/error và TTL còn lại khi đưa kết quả từ adapter vào RAM; không suy ra Cache API thực trên Cloudflare đã hoạt động chỉ từ module test.
- Báo cáo phải phân biệt HTTP 503 của Python khi IP invalid với HTTP 400 của Pages; mô tả hiện tại gộp hai runtime và không khớp toàn bộ.

Docker build, Wrangler preview/build, Cloudflare dashboard/Git integration và website production vẫn **chưa kiểm chứng**. Các follow-up CDN/dependency/HTTPS upstream đã tách khỏi phạm vi kế hoạch, không dùng chúng làm lý do chặn nghiệm thu đợt này.

## 6. Bàn giao sửa tiếp

Giữ nguyên task contract và baseline. Gemini chỉ sửa các lỗi F1–F4 trong những tệp tương ứng, bổ sung regression tests và cập nhật GEMINI_FIX_REPORT.md phản ánh kết quả thật. Không sửa `.git`, `.venv`, `start.bat`, dependencies, version, các tệp baseline; không commit/push/deploy. Nếu giữ optional Cache API branch, thêm adapter tests như mục 5.

Sau bàn giao sửa tiếp, Codex phải đọc diff mới, chạy lại hai bộ test và các regression cần thiết rồi mới đổi kết luận audit. Không đánh dấu accepted hoặc roadmap hoàn thành từ phía Gemini.
