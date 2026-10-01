-- Migration 06: tạo Kế hoạch phòng "Phiếu giao nhiệm vụ Quý 03/2026" và gắn các nhiệm vụ nhập từ file tuần 40. Chạy lại an toàn.
insert into task_plans (id, title, issuer, period_from, period_to, status, note)
values ('kh_q3_2026', 'Phiếu giao nhiệm vụ Quý 03 năm 2026', 'Trưởng phòng', '2026-07-01', '2026-09-30', 'active', 'Tạo tự động từ cột Loại nhiệm vụ của file BC tuần 40/2026')
on conflict (id) do nothing;
update tasks set plan_id = 'kh_q3_2026' where source_doc = 'Phiếu giao nhiệm vụ Quý 03 năm 2026' and plan_id is null;
