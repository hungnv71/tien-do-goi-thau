-- Hoàn tác 03: mở lại quyền ghi trực tiếp cho 5 bảng cũ (dùng khi cần quay về bản web cũ)
do $$
declare t text;
begin
  foreach t in array array['staff','workflow_templates','template_milestones','packages','package_milestones']
  loop
    execute format('drop policy if exists "open_all" on %I', t);
    execute format('create policy "open_all" on %I for all using (true) with check (true)', t);
  end loop;
end $$;
