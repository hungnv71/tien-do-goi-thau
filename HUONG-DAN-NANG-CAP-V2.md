# Điều hành gói thầu & hợp đồng — bản nâng cấp v2

Phòng Quản lý hạ tầng - B.QLDAHTVT · ngày bàn giao 30/09/2026 · **chưa triển khai production**

## 1. Đã thay đổi gì

| Phần | Nội dung |
|---|---|
| CSDL (`supabase/01_v2_schema.sql`) | Thêm bảng: hợp đồng, gia hạn, phụ lục giá trị, mốc HĐ, nghiệm thu, giao dịch thanh toán, nhà thầu, vướng mắc, cấu hình, lịch nghỉ, nhật ký thay đổi, PIN/phiên. Thêm cột cho gói/mốc (KH ban đầu, bắt đầu/hoàn thành TT, chủ trì, minh chứng, nguyên nhân chậm, bắt buộc/tùy chọn, giai đoạn, trọng số…). **Không xóa, không sửa dữ liệu cũ**; KH ban đầu được sao từ hạn đang có. |
| Phân quyền | Chọn tên + PIN, kiểm tra **trên máy chủ** (hàm `app_write_batch`): Chỉ xem / Cán bộ / Lãnh đạo phòng / Quản trị. Sai PIN 5 lần khóa 15 phút. Mọi thao tác ghi đều lưu nhật ký: người sửa, thời gian, trước/sau, lý do (bắt buộc khi đổi hạn, giá trị, trạng thái). |
| Dữ liệu HĐ (`supabase/02_import_hd_2024_2026.sql`) | 80 HĐ, 44 gói (số hiệu), 37 nhà thầu từ file “Báo cáo các HĐ 2024-2026”. “Đã kết thúc” = đã hoàn thành. Không suy diễn ngày bắt đầu, ngày HT thực tế, VAT, bộ phận theo dõi thanh toán. |
| Giao diện | Tổng quan (KPI bấm lọc, Cần xử lý, biểu đồ, bảng 6 dòng), Lựa chọn nhà thầu (Bảng / Kanban / Gantt, chi tiết mốc + hành trình), Hợp đồng đã ký (6 tab), Việc của tôi, Cảnh báo (chờ ai xử lý, tuần này, chờ ký, bảo lãnh…), Báo cáo, Quản trị (bộ mốc, nhà thầu, cán bộ & phân quyền, cấu hình + lịch nghỉ). Bỏ cấp VTNet khỏi giao diện. 8 icon 3D ở `public/assets/icons`. |
| Nhập/xuất Excel | Xuất theo đúng bộ lọc (sheet Định nghĩa, LCNT, Mốc LCNT, Hợp đồng, Gia hạn, Cảnh báo). Nhập gói/HĐ có xem trước, lỗi theo dòng, phát hiện trùng Số HĐ/mã gói trong cùng đơn vị; đọc thẳng file báo cáo HĐ. |

## 2. Chạy migration (làm 1 lần — an toàn với web đang chạy)

Supabase → project `kcbwbeaqymoarzjuzvct` → **SQL Editor** → New query:

1. Dán toàn bộ `supabase/01_v2_schema.sql` → **Run**.
2. Dán toàn bộ `supabase/02_import_hd_2024_2026.sql` → **Run** (cuối file hiện `so_hd = 80, so_goi = 44`).

Cả hai chạy lại nhiều lần không nhân đôi. Web cũ trên Vercel vẫn hoạt động bình thường sau bước này.
(Hoặc kết nối lại connector Supabase bằng tài khoản `bqldahtvt.lhsk2026` rồi nhờ Claude chạy và kiểm tra.)

## 3. Chạy thử trên máy

```
npm install
npm run dev
```
- `http://localhost:5173` — dữ liệu thật (sau khi chạy migration).
- `http://localhost:5173/?demo=1` — **dữ liệu minh họa** có nhãn riêng, không ghi vào CSDL (xem được ngay, không cần migration).

Đăng nhập lần đầu: chọn tên → hệ thống yêu cầu **tự đặt PIN** (4–8 số). Anh (hungnv71, vai trò Quản trị) nên đặt PIN trước, rồi báo các đồng chí đặt PIN ngay. Quên PIN: Quản trị → Cán bộ & phân quyền → Đặt lại PIN.

Việc nên làm ngay sau khi vào: sửa **họ tên hiển thị** cho 6 tài khoản (hiện đang là mã tài khoản), gán vai trò Lãnh đạo phòng cho đúng người, khai báo lịch nghỉ lễ nếu dùng ngày làm việc.

## 4. Đưa lên production (chỉ khi anh yêu cầu)

1. `git add . && git commit -m "Nâng cấp v2" && git push` → chờ Vercel build xong (~1 phút).
2. Ngay sau đó chạy `supabase/03_lockdown_khi_deploy.sql` — khóa ghi trực tiếp ở 5 bảng cũ, mọi thao tác ghi phải qua kiểm tra PIN/quyền.
3. Cần quay lại bản cũ: revert commit + chạy `03b_mo_lai_ghi_truc_tiep.sql`.

Không chạy bước 2 trước bước 1 (web cũ sẽ không ghi được).

## 5. Kiểm tra đã thực hiện

| Bộ test | Kết quả |
|---|---|
| `npm test` — quy tắc ngày/cảnh báo/số liệu (22 tình huống: múi giờ VN, cuối tháng/năm/nhuận, ngày làm việc theo lịch nghỉ, quá hạn 1 ngày, đến hạn hôm nay, hoàn thành đúng hạn/chậm, báo cáo ngày quá khứ, gia hạn chờ duyệt / đã duyệt chưa hiệu lực / 2 lần / xung đột, giá trị = 0, thanh toán > 100%, giao dịch nháp/hủy, nhiều tiền tệ, 1 gói nhiều HĐ, hủy HĐ, rỗng, nhiều gói…) | 22/22 đạt |
| `npm run test:excel` — nhập file báo cáo HĐ thật, trùng dữ liệu, lỗi theo dòng; chạy ở 3 múi giờ | 2/2 đạt |
| `npm run test:db` — migration trên Postgres 17 (PGlite) mô phỏng CSDL hiện tại có dữ liệu người dùng; PIN, khóa 5 lần sai, quyền server, lý do bắt buộc, khóa kế hoạch, duyệt gia hạn, giao dịch nguyên khối, RLS chặn đọc PIN, lockdown/hoàn tác | 10/10 đạt |
| Build production + chụp màn hình Chromium ở 1366×768 và 1440×900 (chế độ minh họa, 3 vai trò) | Không tràn ngang, không lỗi console; xuất Excel khớp bộ lọc |

Lỗi đã phát hiện và sửa trong quá trình test: bộ đếm sai PIN không lưu (do hoàn tác giao dịch); mốc tùy chọn “(nếu có)” chưa có ngày chặn bước hiện tại; **nhập Excel lùi 1 ngày** do lỗi múi giờ của thư viện SheetJS; migration hỏng nếu tên cán bộ đã bị đổi; gói đã hủy vẫn vẽ “đang chậm” trên Gantt.

## 6. Hạn chế còn lại

- **Chưa chạy trên CSDL thật**: sandbox không vào được supabase.co; đã kiểm trên bản sao Postgres 17. Cần anh chạy migration rồi mở web thử.
- **Đọc dữ liệu vẫn mở** cho ai có đường link (khóa anon). PIN bảo vệ thao tác **ghi**. Muốn giới hạn cả xem → chuyển sang Supabase Auth.
- PIN lần đầu theo nguyên tắc “ai đặt trước giữ”: nên triển khai và báo mọi người đặt PIN ngay trong ngày.
- Dữ liệu HĐ lấy từ báo cáo kỳ 01/01/2024–03/03/2026: tại 30/09/2026 hệ thống sẽ báo **47 HĐ “Đang thực hiện” đã quá ngày HT dự kiến** và 6 HĐ chưa có hạn — nhiều khả năng do tình trạng trong file chưa cập nhật; cần cán bộ rà soát (ngày hoàn thành, gia hạn).
- 3 HĐ “Đã thanh lý” thiếu ngày/hồ sơ thanh lý → hiện ở Cảnh báo dữ liệu.
- Số ngày chậm tính theo ngày lịch; chế độ ngày làm việc hiện áp dụng khi sinh lịch kế hoạch từ bộ mốc.
- Gia hạn theo phạm vi riêng được lưu và hiển thị, chỉ gia hạn “toàn HĐ” làm đổi hạn hiện hành của HĐ.
- Báo cáo ngày quá khứ không dựng lại hạn mốc đã sửa sau ngày đó (đánh dấu “đổi sau ngày BC”).
- Không tích hợp SAP/Voffice/Vcontract — chỉ lưu đường dẫn do người dùng nhập.
- Kanban chỉ xem (không kéo thả) — chuyển bước bằng ngày hoàn thành + minh chứng.
- Supabase gói miễn phí tạm dừng sau 7 ngày không truy cập.
- `.gitignore` đã loại file Excel HĐ, file SQL chứa dữ liệu HĐ và thư mục icon gốc (PNG) khỏi GitHub.
