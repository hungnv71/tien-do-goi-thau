-- Migration 08 (02/10/2026): chỉnh danh sách cán bộ. Chạy lại an toàn.
-- (Quy tắc khóa hạn cứng đã nằm trong 04_nhiem_vu_phong.sql — hàm app__check.)
update staff set full_name = 'Nguyễn Như Thái' where lower(account) = 'thainn2';
update staff set role = 'admin' where lower(account) = 'bichngoc';
-- Bỏ tài khoản "Trưởng phòng" chung (đã thay bằng thainn2) nếu không còn hồ sơ nào gắn
delete from app_sessions where staff_id = 'st_truongphong';
delete from staff_secrets where staff_id = 'st_truongphong';
delete from staff s where s.id = 'st_truongphong'
  and not exists (select 1 from packages where staff_id = s.id) and not exists (select 1 from contracts where staff_id = s.id)
  and not exists (select 1 from tasks where staff_id = s.id) and not exists (select 1 from issues where owner_staff_id = s.id)
  and not exists (select 1 from package_milestones where owner_id = s.id) and not exists (select 1 from weekly_reports where staff_id = s.id);
