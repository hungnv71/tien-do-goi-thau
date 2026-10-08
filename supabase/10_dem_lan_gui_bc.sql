-- 10: đếm số lần gửi báo cáo tuần (hiển thị trên nút CẬP NHẬT). Chạy lại an toàn.
alter table weekly_reports add column if not exists submit_count int not null default 1;
