# Hệ thống Theo dõi Tiến độ Gói thầu — B.QLDAHTVT/VTNet

Web app quản lý tiến độ các gói thầu trong phòng: cá nhân tự nhập, trưởng phòng xem toàn phòng, dashboard + biểu đồ + cảnh báo chậm tiến độ. Nền tảng: **React + Vite** (giao diện) · **Supabase** (CSDL, đồng bộ realtime) · **Vercel** (hosting miễn phí). Chi phí: **0đ/tháng**.

---

## A. TẠO CSDL TRÊN SUPABASE (làm 1 lần, ~10 phút)

1. Vào https://supabase.com → đăng nhập bằng **tài khoản anh muốn dùng**.
2. **New project** → đặt tên `tien-do-goi-thau`, chọn Region **Southeast Asia (Singapore)**, đặt mật khẩu DB (lưu lại) → **Create**. Chờ ~2 phút.
3. Menu trái → **SQL Editor** → **New query**.
4. Mở file `supabase_migration.sql` (trong thư mục này), copy **toàn bộ**, dán vào ô query → bấm **Run**.
   → Tạo xong 5 bảng + dữ liệu mẫu (2 bộ mốc, 2 cán bộ, 2 gói thầu demo).
5. Menu trái → **Project Settings** (bánh răng) → **Data API**:
   - Copy **Project URL** (dạng `https://xxxx.supabase.co`).
   - Sang mục **API Keys** copy khóa **anon / public** (chuỗi `eyJ...` rất dài).

---

## B. DÁN KHÓA VÀO CODE

Mở file `src/lib/supabase.js`, sửa **2 dòng đầu**:

```js
const SUPABASE_URL = "https://xxxx.supabase.co";   // Project URL vừa copy
const SUPABASE_ANON_KEY = "eyJ...";                // anon public key
```

> Khóa `anon public` được thiết kế để công khai — an toàn khi để trong code (bảo vệ thực sự nằm ở RLS trong CSDL). Không dùng khóa `service_role`.

---

## C. CHẠY THỬ TRÊN MÁY (tùy chọn)

Cần cài **Node.js** (https://nodejs.org, bản LTS). Mở terminal trong thư mục này:

```bash
npm install
npm run dev
```
Mở http://localhost:5173 → chọn tên **HUNGNV71** để vào thử.

---

## D. ĐƯA LÊN MẠNG MIỄN PHÍ (GitHub → Vercel)

### 1. Tạo repo GitHub rỗng
github.com/new → đặt tên (VD `tien-do-goi-thau`) → **KHÔNG** tích "Add README" → Create repository.

### 2. Đẩy code lên (chạy trong thư mục này)
```bash
git config --global user.name "Nguyen Viet Hung"
git config --global user.email "viethungdragon24@gmail.com"

git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<tài-khoản>/tien-do-goi-thau.git
git push -u origin main
```
- Nếu hiện tab trình duyệt "Git Credential Manager" → bấm **Authorize**.
- Nếu bị `ERR_CONNECTION_REFUSED`: Ctrl+C dừng lệnh rồi chạy lại `git push -u origin main` (thường lần 2 được).
- Nếu terminal hỏi username/password: GitHub không nhận mật khẩu nữa → tạo **Personal Access Token** tại github.com/settings/tokens (Generate new token classic → tích ô **repo** → copy), rồi:
  ```bash
  git remote set-url origin https://<tài-khoản>:<token>@github.com/<tài-khoản>/tien-do-goi-thau.git
  git push -u origin main
  ```

### 3. Import vào Vercel
1. https://vercel.com → **Continue with GitHub** → Authorize.
2. **Add New → Project** → tìm repo `tien-do-goi-thau` → **Import**.
   (Repo không hiện → **Adjust GitHub App Permissions** → chọn repo → Save.)
3. Vercel tự nhận Vite, giữ nguyên mọi thiết lập → **Deploy**.
4. ~40 giây sau có link `https://tien-do-goi-thau-xxxx.vercel.app` — gửi link này cho cả phòng.

### 4. Mỗi lần cập nhật sau này
Chỉ cần:
```bash
git add . && git commit -m "cap nhat" && git push
```
Vercel tự deploy lại trong ~1 phút. Xong.

---

## E. DÙNG HÀNG NGÀY

- **Đăng nhập:** vào link → chọn tên mình (không mật khẩu).
- **Gói của tôi:** bấm *+ Thêm gói thầu*, chọn loại quy trình → hệ thống tự sinh bộ mốc. Bấm vào thẻ gói để nhập **Số văn bản / Ngày dự kiến ký / Ngày thực tế / Ghi chú** cho từng mốc (lưu tự động khi rời ô).
- **Toàn phòng:** trưởng phòng xem tất cả, lọc theo cán bộ / trạng thái, bấm *Xem* để mở chi tiết.
- **Tổng hợp:** dashboard số liệu + biểu đồ + danh sách **mốc đang chậm**, nút **⬇ Xuất Excel**.
- **Bộ mốc quy trình:** thêm/sửa/xóa/đảo thứ tự mốc cho từng loại hình đấu thầu.
- **Cán bộ:** thêm người trong phòng, đánh dấu ai là Trưởng phòng.

### Quy tắc đánh giá tự động
| Trạng thái | Điều kiện |
|---|---|
| ✅ Đã xong | Mốc cuối (Hợp đồng) đã có Ngày thực tế |
| 🟢 Đúng tiến độ | Chưa mốc nào quá hạn |
| 🔴 Chậm tiến độ | ≥1 mốc đã tới Ngày dự kiến nhưng chưa có Ngày thực tế |
| 🟠 muộn (theo mốc) | Ngày thực tế > Ngày dự kiến |

---

## F. LƯU Ý VẬN HÀNH

- **Supabase free tự "ngủ" sau 7 ngày không có truy vấn.** Nếu phòng dùng đều mỗi ngày thì không sao. Nếu nghỉ dài, vào Dashboard bấm **Restore**. Anh có thể dựng 1 workflow n8n gọi API mỗi ngày để giữ project luôn "thức".
- **Đăng nhập chọn tên, không mật khẩu:** ai cũng vào được nếu có link. Chỉ cán bộ phụ trách hoặc trưởng phòng mới **sửa** được gói; người khác chỉ **xem**. Nếu cần bảo mật chặt hơn (email + mật khẩu), báo tôi nâng cấp Supabase Auth.
- **Số liệu bám thực tế** — không sửa để "làm đẹp" báo cáo.
