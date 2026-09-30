-- =====================================================================
-- Migration 03: KHÓA GHI TRỰC TIẾP — CHỈ CHẠY CÙNG LÚC DEPLOY BẢN MỚI
-- Sau file này: API chỉ còn ĐỌC các bảng cũ; mọi thao tác ghi phải qua
-- hàm app_write_batch (kiểm tra PIN phiên + quyền + ghi nhật ký).
-- !!! Bản web CŨ (chọn tên, ghi trực tiếp) sẽ KHÔNG ghi được nữa sau khi chạy.
--     Vì vậy: push code mới -> Vercel build xong -> chạy file này.
-- Hoàn tác: chạy 03b_mo_lai_ghi_truc_tiep.sql
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['staff','workflow_templates','template_milestones','packages','package_milestones']
  loop
    execute format('drop policy if exists "open_all" on %I', t);
    execute format('drop policy if exists "read_all" on %I', t);
    execute format('create policy "read_all" on %I for select using (true)', t);
  end loop;
end $$;
