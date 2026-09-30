# 🌐 IP Inspector - Ứng Dụng Kiểm Tra IP Máy Tính & Mạng

Ứng dụng web hiện đại, nhanh chóng và trực quan giúp kiểm tra toàn diện địa chỉ IP (Local IP, Public IPv4/IPv6), card mạng (Network Interfaces), vị trí địa lý, nhà mạng (ISP) và độ trễ mạng (Ping) của máy tính.

---

## ✨ Tính Năng Nổi Bật

- 🌍 **Public IP (Internet):** Phát hiện Public IPv4 và Public IPv6, tên nhà mạng (ISP), vị trí địa lý (Quốc gia, Thành phố), múi giờ.
- 🏠 **Local IP (LAN / Wi-Fi):** Nhận diện địa chỉ IP mạng nội bộ chính, Default Gateway (Router).
- 🖥️ **Chi tiết tất cả Card Mạng (Network Adapters):**
  - Trạng thái hoạt động (UP / DOWN)
  - Địa chỉ vật lý (MAC Address)
  - Subnet Mask
  - Tốc độ truyền (Speed Mbps)
  - Phân loại card Wi-Fi, Ethernet, Máy ảo (Virtual Switch / Hyper-V / WSL), VPN.
- 📱 **Hỗ trợ truy cập từ Điện thoại:** Tự động tạo mã **QR Code** để quét và mở ngay trang web từ smartphone cùng mạng Wi-Fi.
- 📋 **Sao chép 1-Click:** Nút copy nhanh kèm thông báo toast cho mọi địa chỉ IP và MAC.
- ⚡ **Kiểm tra độ trễ (Ping Test):** Đo ping thực tế đến DNS Google/Cloudflare.
- 💻 **API & cURL Terminal:**
  - `curl http://localhost:8000/api/raw` (lấy Public IP dạng text)
  - `curl http://localhost:8000/api/raw?type=local` (lấy Local IP dạng text)
  - `curl http://localhost:8000/api/info` (toàn bộ dữ liệu JSON)

---

## 🚀 Hướng Dẫn Khởi Chạy

### Cách 1: Chạy nhanh bằng file `.bat` (Khuyên dùng trên Windows)
Chỉ cần nhấp đúp chuột vào file **`start.bat`**. Trình duyệt sẽ tự động mở trang web tại:
```
http://localhost:8000
```

### Cách 2: Chạy bằng dòng lệnh (Terminal / PowerShell)

1. Kích hoạt môi trường ảo:
   ```powershell
   .\.venv\Scripts\activate
   ```
2. Cài đặt thư viện (nếu chưa cài):
   ```powershell
   pip install -r requirements.txt
   ```
3. Khởi động server:
   ```powershell
   python run.py
   ```

Ứng dụng sẽ tự động mở tại `http://localhost:8000`.

---

## 📱 Truy Cập Từ Thiết Bị Khác Trong Mạng LAN

Khi server đang chạy, bất kỳ thiết bị nào (điện thoại, laptop khác) kết nối chung Wi-Fi/mạng LAN đều có thể truy cập qua:
```
http://<IP_LOCAL_CỦA_MÁY>:8000
```
*(Bạn có thể bấm vào nút **"Mở trên điện thoại"** trên giao diện web để quét mã QR).*

---

## 🛠️ Công Nghệ Sử Dụng

- **Backend:** Python 3.14 + FastAPI + Uvicorn + psutil + httpx
- **Frontend:** HTML5, Tailwind CSS, Lucide Icons, QRCode.js (Giao diện Dark Mode Glassmorphism)
