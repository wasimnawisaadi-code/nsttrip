-- Cleanup existing duplicate notifications, keep earliest
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, COALESCE(type,'general'), COALESCE(client_id::text,'-'), (created_at::date)
      ORDER BY created_at ASC
    ) AS rn
  FROM public.notifications
)
DELETE FROM public.notifications n USING ranked r
WHERE n.id = r.id AND r.rn > 1;

-- Cleanup duplicate payroll rows (keep oldest)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY employee_id, year_month ORDER BY created_at ASC) AS rn
  FROM public.payroll
)
DELETE FROM public.payroll p USING ranked r WHERE p.id = r.id AND r.rn > 1;

-- Functional unique index for notification dedup (user + type + client + calendar day)
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_uidx
  ON public.notifications (
    user_id,
    COALESCE(type,'general'),
    COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid),
    ((created_at AT TIME ZONE 'UTC')::date)
  );

-- Unique payroll per employee/month
CREATE UNIQUE INDEX IF NOT EXISTS payroll_employee_month_uidx
  ON public.payroll(employee_id, year_month);
