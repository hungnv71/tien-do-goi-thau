-- 09b: lịch tự chuyển kỳ việc định kỳ — 00:05 giờ VN hằng ngày (17:05 UTC). Chỉ chạy trên Supabase (cần pg_cron).
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'nv-chuyen-ky';
select cron.schedule('nv-chuyen-ky', '5 17 * * *', $$select public.app_roll_recurring(null)$$);
