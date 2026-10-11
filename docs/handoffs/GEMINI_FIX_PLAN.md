# Bản giao việc cho Gemini: sửa lỗi Check IP

Ngày lập: 11/10/2026, múi giờ Asia/Saigon.

Workspace duy nhất: C:\Dev\check-ip-local. Nhánh hiện tại: main. Commit nền: f98382b.

## 1. Mục tiêu và điểm dừng

Sửa các lỗi đã được rà soát trong cả backend Python và Cloudflare Pages Functions. Người dùng phải nhận được đúng IP mà server thấy, phân biệt IP nội bộ với công cộng, và không nhận kết luận chắc chắn về VPN hoặc độ an toàn khi dữ liệu không đủ.

Triển khai tuần tự các đợt 1–4 bên dưới; bổ sung kiểm thử hồi quy cùng mỗi đợt. Khi xong, dừng ở trạng thái thay đổi local có thể review, viết GEMINI_FIX_REPORT.md. Codex sẽ audit độc lập trước khi chấp nhận. Báo cáo của Gemini không thay thế bằng chứng kiểm thử.

Không commit, push, mở PR, deploy, thay đổi dashboard Cloudflare/GitHub, tạo automation, hoặc sửa quyền truy cập. Không tự liên lạc với tác vụ khác. Không mở rộng thành dự án thiết kế lại giao diện, khôi phục toàn bộ bản kiểm tra card mạng cũ, hoặc đổi nhà cung cấp tra cứu.

## 2. Baseline bắt buộc đọc trước khi sửa

- GEMINI_FIX_BASELINE.json: commit, nhánh, trạng thái và SHA-256 của 19 tệp Git đang quản lý.
- PRE_GEMINI_EXISTING_CHANGES.patch: các sửa đổi có sẵn do Codex thực hiện.
- Các tệp source được liệt kê trong mục 3.
- README.md để nhận biết tài liệu đang mô tả nhầm tính năng cũ.

Ba tệp đang sửa trước khi Gemini bắt đầu là README.md, run.py, start.bat. Chúng thuộc phần chuyển môi trường từ ổ D sang C của Codex. Môi trường .venv tại C đã được tạo lại, 18 phiên bản package được giữ nguyên, các launcher đã trỏ về C. Lỗi import get_primary_local_ip của run.py đã được sửa và khởi chạy local đã được kiểm chứng.

Không sửa lại hay làm mất các thay đổi này. Đặc biệt phải giữ helper tìm IP LAN và fallback của run.py, xử lý lỗi/UTF-8 trong start.bat, và hướng dẫn tạo lại .venv khi chuyển thư mục trong README.

Nếu baseline không còn khớp, đọc diff mới để xác định quyền sở hữu. Không dùng reset, clean, checkout, restore hay apply bản patch nền để ghi đè. Nếu có thay đổi mới trùng vị trí cần sửa mà không xác định được nguồn, ghi rõ blocker và hoàn tất phần độc lập.

## 3. Phạm vi tệp

Được sửa:

| Tệp | Phạm vi |
| --- | --- |
| app/main.py | Trích xuất IP, response/API, ping endpoint, SEO/static serving |
| app/network.py | Phân loại IP, lookup, trạng thái bằng chứng, timeout/cache/rate-limit, ping async |
| functions/api/info.js | Contract tương ứng Python, validation, dữ liệu CF, lookup/cache/timeout |
| functions/api/json.js | Tái sử dụng handler và giữ route hiện tại |
| functions/ip.js | Trích xuất/validation IP thống nhất với info |
| public/app.js | Trạng thái UI, timezone, clipboard, refresh, nhận diện thiết bị |
| public/index.html | Nhãn IP, trạng thái ban đầu, metadata và nội dung mô tả |
| public/robots.txt, public/sitemap.xml | Đồng bộ SEO/domain |
| README.md | Viết lại theo chức năng thực tế, giữ hướng dẫn chạy/migration đã sửa |
| package.json | Chỉ thêm script kiểm thử cần thiết; giữ các lệnh dev/deploy hiện tại |
| run.py | Chỉ được bổ sung cấu hình proxy_headers=False cho chế độ chạy trực tiếp nếu cần ở đợt 2; giữ toàn bộ sửa đổi nền |
| app/static/app.js, app/static/index.html | Chỉ loại bỏ bản không còn được dùng sau khi xác minh không có consumer; public là frontend chuẩn |
| tests/ | Tạo các kiểm thử và fixture tổng hợp cần thiết |
| lib/ | Được thêm helper JS nhỏ cho IP/contract nhằm tránh lặp; đặt ngoài public, không tạo thêm route |
| docs/handoffs/GEMINI_FIX_REPORT.md | Báo cáo triển khai |

Không sửa .git/, .venv/, start.bat, requirements.txt, Dockerfile, Procfile, các tệp baseline/plan/patch này, hay bất kỳ thư mục nào ở ổ D. Không thêm đường dẫn máy cá nhân vào runtime source. Không đổi version app/package, đổi module mode của toàn dự án, thêm dependency, hoặc tạo/thay lockfile trong đợt sửa lỗi này.

Nếu cần vượt phạm vi, đề xuất riêng trong báo cáo kèm lý do và giữ phần đó chưa triển khai.

## 4. Các quyết định thiết kế phải giữ

### 4.1 Hai runtime và một frontend

public/ là frontend chuẩn cho cả Python và Cloudflare. functions/ là backend của Pages; app/ là backend Python. Sửa Python không tự sửa hành vi trên Pages.

Giữ các route đang có: /, /app.js, /ip, /api/info, /api/json; Python giữ /api/raw và /api/ping. Không đổi tên các field JSON đang dùng. Trả IP của client mà server quan sát, không thay bằng IP egress của máy server để làm màn hình local trông giống Public IP.

Không yêu cầu /api/json phải trả toàn bộ cùng field với /api/info: hiện Python trả ít field hơn. Chỉ yêu cầu các field chung ip/details/security có cùng ý nghĩa. Không quảng cáo /api/raw hay /api/ping cho Pages khi chưa triển khai chúng.

### 4.2 Trạng thái VPN và bằng chứng

Giữ các boolean legacy is_vpn_or_proxy và is_hosting để tương thích; thêm vào security:

| Field | Giá trị |
| --- | --- |
| detection_status | unknown, not_applicable, not_detected, suspected |
| source | none, local, ip-api, asn_heuristic |
| reason | Mã nguyên nhân ngắn, không chứa IP/user-agent |

UI phải quyết định theo detection_status, không dùng false của boolean legacy để suy ra an toàn. Response cũ thiếu detection_status phải được xem là unknown.

- Không đủ dữ liệu/lookup lỗi: unknown, hiển thị “Chưa đủ dữ liệu để đánh giá”.
- IP nội bộ: not_applicable, hiển thị “IP nội bộ”; không tự suy ra residential hoặc VPN.
- Tra cứu thành công có proxy=false: not_detected, hiển thị “Chưa phát hiện dấu hiệu VPN/Proxy”, kèm giới hạn kết quả.
- proxy=true: suspected, hiển thị “Có dấu hiệu VPN/Proxy”.
- hosting=true hoặc khớp tên ASN: chỉ là tín hiệu IP hosting. Phân biệt với bằng chứng proxy; không tự chuyển thành suspected chỉ vì hosting hoặc từ khóa nhà cung cấp.
- Không dùng các câu “IP thật”, “Kết nối an toàn”, “Chắc chắn không dùng VPN”, “VPN được xác thực”.
- Không suy ra quốc gia VN, TP.HCM, múi giờ Việt Nam hay colo SGN khi thông tin tương ứng thiếu. Dùng null/“Không xác định”; cờ quốc gia mặc định trung tính.

Lệch múi giờ là thông tin phụ, không tham gia kết luận VPN. Chuẩn hóa ít nhất alias Asia/Saigon và Asia/Ho_Chi_Minh, xử lý timezone không hợp lệ bằng fallback an toàn; không bịa timezone khi dữ liệu IP thiếu.

### 4.3 Ranh giới tin cậy proxy

Python không tự đọc CF-Connecting-IP, X-Forwarded-For hoặc X-Real-IP từ mọi request. Lấy địa chỉ đã được server đưa vào request.client; validate bằng ipaddress. Chế độ chạy trực tiếp của run.py không bật middleware tin proxy headers.

Khi triển khai Python sau reverse proxy, README phải hướng dẫn cấu hình Uvicorn proxy headers với danh sách địa chỉ proxy tin cậy cụ thể. Không mặc định tin mọi proxy, không tự coi một header là bằng chứng request đến từ Cloudflare.

Pages dùng CF-Connecting-IP do Cloudflare cung cấp và validate giá trị; không fallback sang X-Forwarded-For tùy ý. Nếu thiếu/invalid, dùng trạng thái unavailable với HTTP lỗi phù hợp; không tạo IP giả 127.0.0.1 cho request công khai. Trong dev/test, cung cấp fixture CF header qua harness, không nới tin cậy của production.

### 4.4 Phân loại và xử lý IP

Python dùng ipaddress; JS dùng parser/helper được kiểm thử, không startsWith đơn giản. Cùng một fixture phải cho kết quả tương đương giữa hai runtime.

Phân biệt địa chỉ hợp lệ, địa chỉ nội bộ/non-public, và địa chỉ đủ điều kiện lookup. Không gửi loopback, private, link-local, unspecified, multicast, CGNAT, documentation/reserved hay input không hợp lệ tới upstream. Không coi hostname là IP client hợp lệ.

Ca tối thiểu: 10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 100.64/10, fc00/7, fe80/10, ::1, ::, IPv4-mapped IPv6; thêm địa chỉ công cộng IPv4/IPv6, dải sát biên và input malformed. IPv4-mapped phải được phân loại theo IPv4 được nhúng. IP invalid không được ngầm phân loại là công cộng.

## 5. Đợt triển khai và tiêu chí nghiệm thu

### Đợt 1 — Kết luận VPN, timezone và dữ liệu thiếu

Tệp: app/network.py, functions/api/info.js, public/app.js, public/index.html; tests liên quan.

Thực hiện contract ở mục 4.2 trong cả hai backend và UI. Các flag upstream vắng mặt/không đúng kiểu không được biến thành kết quả âm tính đáng tin. Dữ liệu Cloudflare còn hợp lệ vẫn dùng được nếu lookup phụ lỗi, nhưng ASN/geolocation không tự chứng minh người dùng không dùng VPN.

Nghiệm thu:

1. Asia/Saigon ↔ Asia/Ho_Chi_Minh không có cảnh báo lệch timezone.
2. Asia/Ho_Chi_Minh ↔ America/New_York chỉ có thông tin lệch timezone; không đổi trạng thái VPN.
3. Timeout, 429, HTTP lỗi, JSON hỏng, status=fail, thiếu proxy flag và response legacy đều không hiển thị an toàn/IP thật.
4. proxy=true có suspected; hosting=true/proxy=false chỉ mô tả hosting.
5. Thiếu vị trí/timezone không hiển thị VN/TP.HCM giả.
6. Trạng thái ban đầu và lỗi tải không có badge xanh “An toàn”.

### Đợt 2 — IP, proxy, ping và độ bền lookup

Tệp: app/main.py, app/network.py, functions/api/info.js, functions/ip.js; run.py trong giới hạn mục 3; helper/tests.

Thực hiện mục 4.3–4.4. Đồng bộ extraction giữa /ip và các API JSON. Validation phải xảy ra trước khi cache/lookup; response chứa IP của từng request không được cache dùng chung cho người khác. Thêm Cache-Control: no-store cho API cá nhân trên Python, giữ hành vi no-store của Pages.

Ping:

- Thay socket.connect đồng bộ bằng TCP connect async có timeout 2 giây.
- Đóng writer/socket trong mọi nhánh, bao gồm timeout và cancellation.
- /api/ping chỉ cho phép hai đích IP cố định 8.8.8.8 và 1.1.1.1; đích khác trả HTTP 400. Không mở endpoint thành công cụ kết nối tùy ý tới LAN/hostname.
- Giữ latency_ms=-1 khi phép đo thất bại để tương thích. Mô tả rõ đây là TCP tới cổng DNS từ server, không phải ICMP hay ping từ thiết bị người dùng.
- Không cần thêm phép đo ping vào Pages.

Lookup/cache:

- Python: timeout request hiện tại tối đa 4 giây; cache thành công TTL 3600 giây, tối đa 1024 mục; dùng clock monotonic cho thời gian nội bộ. Loại bỏ mục quá hạn khi truy cập/cập nhật, giới hạn kích thước, không giữ kết quả lỗi trong một giờ.
- Pages: deadline chủ động 4 giây bằng AbortController/AbortSignal; không chỉ Promise.race rồi để request vẫn chạy. Cache chỉ sau khi xác minh lookup thành công; không dùng cacheTtl chung 3600 giây cho response lỗi. Nếu dùng Cache API, test bằng adapter/mock; không cần account thật.
- Không retry tự động trong cùng request. Tôn trọng X-Rl=0 và X-Ttl; cooldown phải hữu hạn, kiểm tra kiểu/range của header.
- Python có giới hạn ngân sách tối đa 40 lần gọi upstream/phút/process. Khi hết ngân sách, trả dữ liệu thiếu với unknown, không hàng đợi vô hạn.
- Pages có giới hạn/cooldown tốt nhất trong từng isolate; báo rõ đây không phải quota toàn cầu theo IP egress. Không thêm Durable Objects, KV hay tài khoản dịch vụ chỉ để thực hiện global rate-limit trong nhiệm vụ này.
- CancelledError/cancellation phải được truyền đúng; không biến cancellation thành cache entry. Nếu coalesce các request cùng IP, phải test cleanup/single-flight khi lỗi/cancel; không thêm cơ chế này nếu chưa kiểm chứng được lifecycle.
- Không thêm nhật ký chứa IP/user-agent hay tệp lưu dữ liệu truy cập. Dịch vụ ip-api hiện tại dùng HTTP; ghi đúng giới hạn này trong tài liệu, không đơn giản đổi sang HTTPS trên free endpoint rồi tuyên bố đã sửa.

Nghiệm thu:

1. Header giả không thay đổi IP client ở Python direct mode; input invalid không được lookup.
2. Bộ fixture IP dùng chung giữa Python/JS đạt và các IP non-public không gọi upstream.
3. Nhiều ping mô phỏng cùng lúc chạy đồng thời; task heartbeat không bị chặn, tài nguyên được đóng khi thất bại/cancel.
4. /api/ping?host=192.168.1.1 và hostname tùy ý bị từ chối mà chưa kết nối.
5. Lookup treo được abort đúng deadline; lỗi không làm đầy cache; TTL/eviction/budget/cooldown có test dùng clock giả.
6. Hai client khác IP liên tiếp không nhận dữ liệu cá nhân của nhau.

### Đợt 3 — Giao diện và thao tác thực tế

Tệp: public/app.js, public/index.html; tests.

- Nhãn hero theo is_private/IP hợp lệ: local không ghi Public IP; unknown không tự điền 127.0.0.1.
- Clipboard: kiểm tra API tồn tại, xử lý cả exception đồng bộ và promise rejection. Fallback chỉ báo thành công khi copy thực sự thành công; báo lỗi trung thực nếu cả hai cách đều thất bại.
- Refresh: request mới nhất là nguồn quyết định UI; request cũ không ghi đè dữ liệu/lỗi/loading. Abort request trước và giữ request ID để tránh response đến muộn, có timeout và xử lý AbortError riêng.
- Tọa độ: nhận số hoặc chuỗi số hữu hạn, giữ giá trị 0, từ chối chuỗi trống/NaN/Infinity và giá trị ngoài range.
- Nhận diện Opera trước Chrome, Android trước Linux, iOS trước macOS.
- Lucide bị thiếu/lỗi tải không được chặn fetch/render IP. Guard tại cả startup và render. Giữ hoạt động khi không có các node UI tùy chọn.
- Edge datacenter phải đến từ dữ liệu thực; Python không giả SGN.

Nghiệm thu:

1. HTTP LAN không có navigator.clipboard vẫn copy được bằng fallback nếu trình duyệt hỗ trợ; thất bại không có toast thành công.
2. Hai lần refresh, lần mới trả trước: cuối cùng vẫn hiển thị kết quả mới; lỗi cũ không đổi trạng thái mới.
3. latitude=0 hoặc longitude=0 được hiển thị đúng trên backend và UI.
4. Fixture Opera/Android/iOS cho đúng nhãn.
5. Không có lucide, startup vẫn fetch và hiển thị IP.
6. UI desktop và viewport điện thoại được kiểm tra trực quan; IPv6 dài không gây tràn ngang toàn trang.

### Đợt 4 — Tài liệu, SEO và frontend chuẩn

Tệp: app/main.py, public/index.html, public/robots.txt, public/sitemap.xml, README.md; các bản app/static nếu đủ điều kiện loại bỏ.

- Python serve robots.txt và sitemap.xml từ public để tránh hai nguồn khác nhau. Canonical, sitemap, Open Graph và URL JSON-LD thống nhất https://check-ip-web.pages.dev/.
- Các snippet cURL mặc định cũng dùng domain này, vẫn cập nhật theo window.location.origin trên giao diện.
- README mô tả đúng hai chế độ Python và Pages, các endpoint thực sự có ở mỗi chế độ, nguồn IP/latency và giới hạn VPN/geolocation.
- Xóa mô tả tính năng chưa có: gateway, danh sách adapter/MAC/subnet/speed, QR và đồng thời phát hiện cả IPv4 lẫn IPv6. Ứng dụng hiện hiển thị IP của kết nối request, không đảm bảo phát hiện cả hai họ địa chỉ.
- /api/raw?type=local không được tài liệu hóa là tính năng lựa chọn IP riêng. Route alias hiện tại vẫn giữ để tránh phá client.
- Sửa khẳng định “chính xác 100%”, “không lưu bất kỳ dữ liệu cá nhân nào”, “không lưu log” thành mô tả đã kiểm chứng: cache lookup giới hạn trong bộ nhớ/edge, có gửi IP tới dịch vụ tra cứu nếu tính năng được dùng; access logs của server/hosting tùy cấu hình. Không khẳng định cấu hình dashboard khi chưa được xem.
- public là frontend chuẩn. Kiểm tra import/route/script references trước khi xóa app/static/*; không tạo bản UI thứ ba. Nếu còn consumer, báo rõ và giữ các tệp cho tới khi giải quyết.
- Giữ hướng dẫn tạo .venv tại vị trí mới và các sửa đổi chuyển ổ C.

Nghiệm thu:

1. /robots.txt và /sitemap.xml của Python trùng nội dung public.
2. Không còn URL domain cũ trong metadata/snippet SEO; thương hiệu CheckIP.vn trong prose có thể giữ, không cần đổi thương hiệu.
3. README không quảng cáo route/tính năng chưa có.
4. Frontend vẫn tải từ /app.js, không còn reference tới tệp đã xóa.
5. Các sửa đổi nền run.py/start.bat và môi trường tại C vẫn hoạt động.

## 6. Các việc hardening tách thành follow-up

Không bỏ qua khi báo cáo, nhưng không tự mở rộng đợt sửa lỗi này:

- Bundle Tailwind CSS để bỏ CDN runtime; self-host/pin Lucide và license.
- Lockfile/phụ thuộc tái lập, CI tự chạy test, .dockerignore loại .venv/.git khỏi build context.
- Thay upstream HTTP bằng dịch vụ HTTPS phù hợp và xác minh giới hạn/gói dịch vụ.
- Xác minh Git integration, production branch, build settings và automatic deployment của Cloudflare bằng quyền truy cập thực tế.
- Xác minh Docker build và Wrangler build/preview khi tooling sẵn có.

Các việc này không phải bằng chứng website đã được deploy. Nếu một kiểm tra chưa chạy được, ghi “chưa kiểm chứng”, không đánh dấu pass.

## 7. Lệnh kiểm tra tối thiểu

Chạy tại C:\Dev\check-ip-local. Không cần mạng hay credential cho test tự động. Dùng unittest và Node built-in test runner, fixture IP/user-agent tổng hợp; không ghi IP thật vào fixture/báo cáo.

Gemini phải tạo test files phù hợp trước khi chạy các lệnh test. Không biến lệnh “0 tests” thành pass.

~~~powershell
.\.venv\Scripts\python.exe -X utf8 -m unittest discover -s tests -p "test_*.py" -v
.\.venv\Scripts\python.exe -m pip check
node --experimental-vm-modules --test
git diff --check
git status --short
~~~

JS tests phải load source thực của public/app.js và module Functions, bao gồm import/linking thực; có thể dùng vm.SourceTextModule với flag bên trên mà không đổi package.json sang type=module. Không copy thuật toán production vào test hay xóa import chỉ để chạy được test.

Python tests phải cover request/response thực bằng ASGI harness/TestClient hoặc tương đương; network/clock được mock ở đúng boundary. Smoke test server bằng Python của .venv tại C trên một cổng trống, kiểm tra /, /app.js, /ip, /api/info, /api/json, /api/raw và SEO. Tắt tự mở browser nếu dùng harness cho run.py. Dừng riêng tiến trình test do mình tạo sau khi kiểm tra.

Kiểm tra luồng trusted proxy bằng integration fixture hoặc Uvicorn thật để phân biệt middleware với logic FastAPI. Test thực sự giả header ở direct mode; không chỉ gọi riêng helper rồi kết luận toàn server an toàn.

Kiểm tra syntax Python bằng ast/compile và JS bằng parsing module hợp lệ. Dùng một test command cho từng bộ, ghi rõ số test và exit code. Các test phải thất bại trên hành vi cũ tương ứng khi có thể kiểm tra được; không chỉ kiểm tra tên biến hoặc chuỗi source.

## 8. Báo cáo Gemini phải trả

Tạo docs/handoffs/GEMINI_FIX_REPORT.md, gồm:

1. Baseline nhận được: commit/branch, các thay đổi có sẵn được giữ; có khác biệt mới hay không.
2. Bảng theo từng đợt/tiêu chí: đã làm, bằng chứng, chưa làm và lý do.
3. Danh sách toàn bộ tệp thêm/sửa/xóa; phân biệt phần Gemini với sửa đổi nền của Codex.
4. Quyết định contract security/IP/proxy/cache; field mới và ảnh hưởng client cũ.
5. Lệnh kiểm tra thực chạy, số test, exit code, kết quả; kiểm tra browser có screenshot local thì ghi đường dẫn.
6. Các tình huống lỗi/cancel/timeout và giới hạn chưa giải quyết, đặc biệt quota upstream trên Pages.
7. Những gì chưa kiểm chứng: Docker, Wrangler, dashboard, website production.
8. Follow-up hardening, dependency hoặc thay đổi ngoài phạm vi được đề xuất.
9. Xác nhận không commit/push/deploy, không sửa .venv hay dữ liệu ổ D.

Không tự viết “Codex accepted” hoặc đánh dấu roadmap hoàn thành. Sau báo cáo, dừng chỉnh sửa để Codex audit toàn bộ diff, kiểm tra baseline, chạy test độc lập và quyết định accepted / changes-required / rejected.
