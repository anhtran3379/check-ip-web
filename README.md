# 🌐 Check IP - Ứng Dụng Kiểm Tra Địa Chỉ IP Kết Nối

Ứng dụng web kiểm tra địa chỉ IP của kết nối client hiện tại mà máy chủ quan sát được, phân biệt địa chỉ nội bộ (non-public) với địa chỉ công cộng (public), và hiển thị thông tin nhà mạng (ISP), vị trí địa lý ước tính cùng tín hiệu VPN/Proxy/Hosting.

Dự án hỗ trợ hai chế độ vận hành dùng chung một giao diện chuẩn tại thư mục `public/`:
1. **Python Backend (`app/` + FastAPI/Uvicorn):** Chạy trực tiếp trên máy cục bộ/LAN hoặc triển khai trên máy chủ Python.
2. **Cloudflare Pages + Pages Functions (`public/` + `functions/`):** Chạy serverless trên hạ tầng Cloudflare Pages.

---

## ✨ Tính Năng Thực Tế

- 🔍 **Hiển thị IP của kết nối hiện tại:**
  - Hiển thị địa chỉ IP (IPv4 **hoặc** IPv6 tùy theo kết nối của request tới server; ứng dụng hiển thị địa chỉ của kết nối hiện tại, không đồng thời quét cả hai họ địa chỉ nếu client chỉ kết nối bằng một họ).
  - Phân biệt rõ địa chỉ **IP nội bộ / dải đặc biệt** (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10` CGNAT, `fe80::/10`, `fc00::/7`, `::1`, v.v.) với **IP công cộng**.
- 🌍 **Thông tin ISP & Vị trí ước tính (cho IP công cộng):**
  - Tra cứu tên nhà mạng (ISP), mã ASN, quốc gia, thành phố, múi giờ và tọa độ ước tính.
  - Khi thiếu dữ liệu hoặc tra cứu thất bại, giao diện hiển thị trạng thái `Không xác định`, không tự suy diễn vị trí mặc định.
- 🛡️ **Đánh giá tín hiệu VPN / Proxy / Hosting theo bằng chứng (`detection_status`):**
  - `not_applicable`: Địa chỉ IP nội bộ hoặc dải không công cộng (không gọi dịch vụ tra cứu ngoài).
  - `unknown`: Chưa đủ dữ liệu để đánh giá (do lỗi mạng, hết ngân sách tra cứu, timeout hoặc thiếu cờ dữ liệu).
  - `not_detected`: Dịch vụ tra cứu phản hồi `proxy=false` (có ghi chú rõ giới hạn của cơ sở dữ liệu; tách biệt tín hiệu IP Hosting/Datacenter với kết luận VPN).
  - `suspected`: Dịch vụ tra cứu phản hồi `proxy=true` (`Có dấu hiệu VPN/Proxy`).
  - So sánh múi giờ trình duyệt và múi giờ theo IP chỉ được hiển thị như thông tin phụ, không tự thay đổi kết luận VPN.
- 📋 **Tiện ích giao diện:**
  - Chọn **Tiếng Việt / English** ở thanh trên cùng; mặc định tiếng Việt, ghi nhớ lựa chọn trong trình duyệt khi được phép lưu trữ. Chuyển ngôn ngữ cập nhật ngay cả dữ liệu đang hiển thị, không gọi lại API.
  - Sao chép nhanh địa chỉ IP và lệnh `cURL` (có kiểm tra quyền Clipboard API và fallback an toàn).
  - Nhận diện trình duyệt, hệ điều hành và độ phân giải màn hình phía trình duyệt.

---

## 🔌 Các Endpoint Theo Chế Độ Vận Hành

| Endpoint | Python (`app/main.py`) | Cloudflare Pages (`functions/`) | Mô tả |
| :--- | :---: | :---: | :--- |
| `GET /` | Có | Có | Giao diện web chuẩn từ `public/index.html` |
| `GET /app.js` | Có | Có | Logic frontend từ `public/app.js` |
| `GET /i18n.js` | Có | Có | Bản dịch và bộ chọn ngôn ngữ từ `public/i18n.js` |
| `GET /robots.txt` | Có | Có | Tệp cấu hình робот tìm kiếm từ `public/robots.txt` |
| `GET /sitemap.xml` | Có | Có | Sơ đồ trang web từ `public/sitemap.xml` |
| `GET /ip` | Có | Có | Trả về địa chỉ IP của kết nối dạng `text/plain` (`Cache-Control: no-store`) |
| `GET /api/info` | Có | Có | Trả về JSON chi tiết (`ip`, `is_private`, `details`, `security`, v.v.) |
| `GET /api/json` | Có | Có | Trả về JSON chứa các trường chung `ip`, `details`, `security` |
| `GET /api/raw` | Có (alias của `/ip`) | Không | Alias giữ tương thích trên Python, trả về IP của kết nối hiện tại |
| `GET /api/ping` | Có | Không | Đo thời gian mở kết nối TCP từ **máy chủ Python** tới cổng 53 của `8.8.8.8` hoặc `1.1.1.1` |

### Lưu ý về nguồn dữ liệu và phép đo
- **Nguồn xác định IP:**
  - **Python (chế độ trực tiếp):** Lấy địa chỉ kết nối trực tiếp từ socket (`request.client.host`) và kiểm tra hợp lệ bằng `ipaddress`. Không tự đọc các header `CF-Connecting-IP`, `X-Forwarded-For` hay `X-Real-IP` từ request để tránh giả mạo IP.
  - **Cloudflare Pages:** Lấy từ header `CF-Connecting-IP` do tầng biên Cloudflare gán và kiểm tra hợp lệ trước khi xử lý; không tự ý fallback sang `X-Forwarded-For` hoặc `127.0.0.1`.
- **Ý nghĩa của `latency_ms` và `/api/ping` (chỉ có trên Python):**
  - Đây là phép đo thời gian thiết lập kết nối **TCP bất đồng bộ từ máy chủ Python tới cổng DNS (53)** của hai địa chỉ cố định `8.8.8.8` hoặc `1.1.1.1` (timeout 2 giây).
  - Đây **không phải** gói tin ICMP ping và **không phải** độ trễ mạng từ thiết bị của người dùng tới máy chủ. Các đích khác ngoài `8.8.8.8` và `1.1.1.1` sẽ bị từ chối với mã `HTTP 400`.

---

## 🚀 Hướng Dẫn Khởi Chạy Cục Bộ (Python)

### Cách 1: Chạy nhanh bằng file `.bat` (Khuyên dùng trên Windows)
Chỉ cần nhấp đúp chuột vào file **`start.bat`**. Trình duyệt sẽ tự động mở trang web tại:
```
http://localhost:8000
```

### Cách 2: Chạy bằng dòng lệnh (Terminal / PowerShell)

1. Tạo môi trường ảo tại thư mục dự án (chỉ cần làm lần đầu):
   ```powershell
   python -m venv .venv
   ```
2. Kích hoạt môi trường ảo:
   ```powershell
   .\.venv\Scripts\activate
   ```
3. Cài đặt thư viện (nếu chưa cài):
   ```powershell
   python -m pip install -r requirements.txt
   ```
4. Khởi động server:
   ```powershell
   python run.py
   ```

Ứng dụng sẽ tự động mở tại `http://localhost:8000`.

Khi chuyển dự án sang thư mục hoặc ổ đĩa khác, hãy tạo lại `.venv` tại vị trí mới rồi cài lại thư viện. Không sao chép môi trường ảo cũ vì các lệnh bên trong có thể giữ đường dẫn tuyệt đối tới vị trí trước đó.

---

## 📱 Truy Cập Trong Mạng LAN & Triển Khai Sau Reverse Proxy

### Truy cập từ thiết bị khác trong mạng LAN
Khi chạy `python run.py`, server lắng nghe trên `0.0.0.0:8000` với `proxy_headers=False`. Thiết bị khác cùng mạng LAN/Wi-Fi có thể truy cập qua:
```
http://<IP_LAN_CỦA_MÁY_CHỦ>:8000
```
Khi truy cập trực tiếp qua localhost hoặc LAN, server sẽ nhận diện đúng địa chỉ loopback/LAN của thiết bị kết nối và hiển thị trạng thái **IP nội bộ** (`not_applicable`).

### Triển khai Python phía sau Reverse Proxy tin cậy
Mặc định ứng dụng Python không tin tưởng các header chuyển tiếp (`X-Forwarded-For`, `X-Real-IP`). Nếu bạn đặt Uvicorn phía sau một reverse proxy do bạn kiểm soát (ví dụ Nginx hoặc Caddy), hãy bật `proxy-headers` kèm **danh sách IP proxy tin cậy cụ thể**:
```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="127.0.0.1,10.0.0.5"
```
*(Không đặt `--forwarded-allow-ips="*"` nếu cổng Uvicorn có thể bị kết nối trực tiếp từ bên ngoài).*

---

## ⚠️ Giới Hạn Kỹ Thuật & Quyền Riêng Tư

1. **Độ chính xác của Geolocation & VPN/Proxy:**
   - Vị trí địa lý theo IP chỉ mang tính ước tính vùng/thành phố dựa trên cơ sở dữ liệu đăng ký mạng.
   - Trạng thái VPN/Proxy dựa trên dữ liệu từ `ip-api.com`; kết quả `not_detected` chỉ có nghĩa là chưa ghi nhận cờ proxy trong nguồn dữ liệu hiện tại, không đảm bảo tuyệt đối kết nối không dùng VPN.
2. **Giao thức và giới hạn của dịch vụ tra cứu (`ip-api.com`):**
   - Gói miễn phí của `ip-api.com` hiện chỉ hỗ trợ giao thức **HTTP** (`http://ip-api.com/json/...`, giới hạn 45 yêu cầu/phút theo IP egress).
   - Khi tra cứu IP công cộng, địa chỉ IP đó sẽ được gửi qua kết nối HTTP từ server/worker tới `ip-api.com`.
   - Backend Python giới hạn tối đa 40 yêu cầu tra cứu/phút/tiến trình và tôn trọng header `X-Rl`/`X-Ttl`. Trên Cloudflare Pages Functions, bộ đếm tốc độ và cooldown chỉ có phạm vi trong từng isolate (best-effort per isolate), không phải bộ đếm toàn cục trên toàn mạng lưới Cloudflare.
3. **Lưu trữ dữ liệu & Nhật ký (Logs):**
   - Mã nguồn ứng dụng không tự ghi tệp nhật ký chứa IP hay User-Agent xuống đĩa.
   - Kết quả tra cứu thành công của IP công cộng được lưu cache tạm thời trong bộ nhớ/edge (TTL tối đa 3600 giây, giới hạn tối đa 1024 mục) để giảm tải truy vấn lặp lại.
   - Máy chủ web (Uvicorn) hoặc nền tảng hạ tầng (Cloudflare) có thể ghi nhận access log tiêu chuẩn tùy thuộc vào cấu hình vận hành của môi trường triển khai.

---

## 🧪 Kiểm Thử Tự Động

Chạy bộ kiểm thử Python (`unittest`) và JavaScript (`node --test`):
```powershell
.\.venv\Scripts\python.exe -X utf8 -m unittest discover -s tests -p "test_*.py" -v
node --experimental-vm-modules --test
```
