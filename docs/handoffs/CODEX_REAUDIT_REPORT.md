# Re-audit Gemini — 2026-10-12

**Kết luận: changes-required.** F1, F3 và F4 đã đạt kiểm tra độc lập; F2 vẫn chưa đầy đủ. Chưa nghiệm thu toàn bộ bản sửa.

Workspace: `C:\Dev\check-ip-local`. HEAD: `f98382ba5c66e0c31b527528cb66c6410c0aa1bb`, branch `main`. Đối chiếu task contract, báo cáo Gemini mới và snapshot `CODEX_AUDIT_SNAPSHOT.json` ngày 2026-10-11. Codex không sửa source ứng dụng, không commit/push/deploy.

## 1. Phát hiện còn cần sửa

### R2-F2 — [P2] Còn phân loại sai ngoại lệ globally reachable; test đang khẳng định hành vi sai

Vị trí: `app/network.py:54–60`, `app/network.py:140–153`, `lib/ip.js:159–172`, `tests/fixtures.json:63`, `tests/test_check_ip.py:134`, `tests/check_ip.test.js:586`.

Cả hai runtime đang trả `is_public=false`, `is_private=true`, `lookup_eligible=false`, rồi trả `security.detection_status=not_applicable` cho:

| IP kiểm thử | Kết quả hiện tại | Bằng chứng cần dùng |
| --- | --- | --- |
| `2001:1::3` | reserved/nội bộ, 0 upstream calls | `2001:1::3/128` là DNS-SD Service Registration Protocol Anycast, globally reachable |
| `64:ff9b::808:808` | reserved/nội bộ, 0 upstream calls | `64:ff9b::/96` là IPv4-IPv6 Translation prefix có globally reachable=true; ví dụ này nhúng IPv4 8.8.8.8 |

[Registry IPv6 special-purpose chính thức của IANA](https://www.iana.org/assignments/iana-ipv6-special-registry/) xác nhận hai ngoại lệ trên. Quy tắc “chỉ 2000::/3 mới có thể globally reachable” trong source không đúng: phải xét ngoại lệ cụ thể trước quy tắc rộng. Danh sách ngoại lệ `2001::/23` cũng thiếu địa chỉ `2001:1::3`.

Tác động: API/UI gán IP công cộng thành nội bộ và bỏ qua lookup. Đây là phần F2 còn thiếu; không phải lỗi timeout/cancellation quay lại.

`tests/fixtures.json` và các test lookup mới còn cố định `2001:1::3` vào nhóm non-public. Vì thế hai bộ test hiện pass nhưng không chứng minh chính sách phân loại đúng theo registry. Kiểm thử độc lập bằng source thực và network boundary mock tái hiện cùng kết quả trên Python và Pages.

Yêu cầu sửa hẹp:

1. Bổ sung `2001:1::3/128` vào ngoại lệ public của Python/JS; giữ các địa chỉ sát biên không thuộc ngoại lệ là non-public.
2. Xử lý ngoại lệ globally reachable `64:ff9b::/96` trước điều kiện loại ngoài `2000::/3`; phân biệt với `64:ff9b:1::/48` không globally reachable. Không đánh đồng mọi prefix NAT64 với mạng nội bộ.
3. Sửa fixture/test đang gán `2001:1::3` là reserved, thêm trường hợp NAT64 nhúng IPv4 công cộng và biên prefix; giữ đồng nhất Python/JS.
4. Kiểm tra `is_public`, `is_private`, `lookup_eligible` và số lần gọi upstream, không chỉ đối chiếu hai implementation với cùng fixture sai.

Nghiệm thu: các tình huống trong `audit_round2.py` và `audit_round2.cjs` phải pass, cùng với hai bộ test chính. Các ca documentation, dummy prefix, RFC1918/CGNAT/mapped non-public phải tiếp tục không lookup. Không mở rộng sang dependency, deployment hoặc sửa giao diện.

## 2. Những phát hiện đã xử lý đạt

| Mã | Kết quả xác minh độc lập |
| --- | --- |
| F1 | HTTPX thật + server TCP loopback nhỏ giọt: lookup kết thúc sau **4,005 giây**, reason `lookup_timeout`, không ghi cache. Test hồi quy còn kiểm tra cancellation và đóng kết nối upstream. |
| F2, ba ca đã báo cụ thể lần trước | `3fff::1` và `100:0:0:1::1`: non-public, 0 upstream calls. `2001:1::1`: public, 1 upstream call. Cả hai runtime đều đúng cho ba ca này. Phát hiện rộng F2 vẫn còn R2-F2 ở mục 1. |
| F3 | Client abort trong khi đọc body được propagate `AbortError`; lần gọi tiếp theo cùng IP phải lookup lại, chứng minh không cache. Test chính còn cover abort tại ranh giới hoàn tất body, timeout body và JSON hỏng thực sự. |
| F4 | Writer mock có `wait_closed` treo: hàm kết thúc sau **0,028 giây** với timeout thử 0,02 giây, đã gọi close và transport.abort. Test chính còn kiểm tra caller cancellation. |
| Cache adapter bổ sung | Đã thêm test match/put, lỗi adapter và TTL còn lại: sau khi nạp lại ở giây 3500, RAM cache hết hạn theo mốc 3600 gốc. Đây là test adapter tổng hợp, chưa xác minh Cache API Cloudflare thật. |

## 3. Kết quả kiểm thử Codex chạy

| Lệnh | Kết quả |
| --- | --- |
| `.\.venv\Scripts\python.exe -X utf8 -m unittest discover -s tests -p 'test_*.py' -v` | **19 tests pass**, 13,438 giây, exit 0; có smoke Uvicorn thật và kiểm tra endpoint/proxy boundary |
| `node --experimental-vm-modules --test` | **6 tests, 0 suites, 6 pass, 0 fail**, exit 0 |
| `.\.venv\Scripts\python.exe -m pip check` | No broken requirements found, exit 0 |
| `git -c core.safecrlf=false diff --check` | Pass, exit 0 |
| `audit_round2.py` | F1/F4 và ba ca F2 cũ pass; hai ca R2-F2 fail; **exit 1** |
| `audit_round2.cjs` | F3 và ba ca F2 cũ pass; hai ca R2-F2 fail; **exit 1** |

Node test runner ban đầu bị sandbox chặn subprocess (`EPERM`); chạy lại với escalation được chấp thuận thì pass. Hai probe độc lập chỉ dùng dữ liệu tổng hợp/local, không gọi ip-api thật. Không chạy nguyên probe lần 1 để nghiệm thu vì chúng cố tình assert rằng lỗi cũ còn tồn tại.

Chạy lại từ root repo:

```powershell
$env:PYTHONPATH='C:\Dev\check-ip-local'
.\.venv\Scripts\python.exe -X utf8 docs\handoffs\audit_round2.py
node --experimental-vm-modules docs\handoffs\audit_round2.cjs
```

## 4. Phạm vi, baseline và báo cáo

Chỉ 7 tệp khác hash snapshot audit trước: `app/network.py`, `functions/api/info.js`, `lib/ip.js`, `tests/fixtures.json`, `tests/test_check_ip.py`, `tests/check_ip.test.js`, `docs/handoffs/GEMINI_FIX_REPORT.md`. Các source/tài liệu còn lại được snapshot giữ nguyên; HEAD không đổi. Fixture hiện có đúng **81 IP cases + 6 UA cases**.

Các tệp bị cấm có hash được lưu trong baseline (`.gitignore`, Dockerfile, Procfile, requirements.txt, start.bat, functions/api/json.js, public/robots.txt và public/sitemap.xml) tiếp tục khớp. Task contract và baseline JSON khớp snapshot trước. Không phát hiện thay đổi dependency/version/lockfile ngoài phạm vi. Audit chỉ đọc thư mục C, không truy cập ổ D.

Một điểm báo cáo cần hiệu chỉnh: Gemini nói Codex đã QA bốn trạng thái `neutral/public_safe/vpn_suspected/private_ipv6` ở hai viewport. Bằng chứng audit trước thực tế là fixture IPv6 dài với trạng thái unknown và tọa độ 0 ở 1280×900, 375×812. Không có bằng chứng bốn kịch bản mà báo cáo nêu. Frontend không đổi hash ở vòng này, nên Codex giữ bằng chứng QA trước trong đúng phạm vi đó, không suy rộng. Đồng thời “từ 53 lên 81” cần đổi thành “từ 56 lên 81” nếu mô tả bản trước vòng re-audit.

Docker, Wrangler/runtime Pages, dashboard/Git integration và website production vẫn chưa kiểm chứng; không commit/push/deploy trong audit. Không dùng các follow-up đã tách ngoài phạm vi làm lý do chặn bản sửa; lý do changes-required hiện tại là R2-F2.

## 5. Bàn giao tiếp

Gemini sửa đúng R2-F2 và fixture/test tương ứng, hiệu chỉnh báo cáo theo bằng chứng thật. Giữ các sửa F1/F3/F4 đã đạt. Không sửa audit artifacts của Codex, baseline, `.git`, `.venv`, start.bat hoặc dependencies; không commit/push/deploy. Sau đó Codex chạy lại regression để quyết định nghiệm thu.

Codex thêm trong vòng audit này: báo cáo này, `audit_round2.py`, `audit_round2.cjs` và `CODEX_REAUDIT_SNAPSHOT.json`. Báo cáo/snapshot vòng 1 được giữ nguyên làm lịch sử.
