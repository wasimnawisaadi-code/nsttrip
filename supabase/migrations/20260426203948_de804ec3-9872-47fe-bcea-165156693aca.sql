-- Promote existing admins to superadmin (keep admin role too)
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'superadmin'::public.app_role
FROM public.user_roles
WHERE role = 'admin'::public.app_role
ON CONFLICT DO NOTHING;

-- Helper: is_superadmin
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'superadmin'::public.app_role
  )
$$;

-- Payroll line items
CREATE TABLE IF NOT EXISTS public.payroll_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id uuid NOT NULL REFERENCES public.payroll(id) ON DELETE CASCADE,
  entry_type text NOT NULL,
  description text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage payroll entries"
ON public.payroll_entries
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_superadmin(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_superadmin(auth.uid()));

CREATE POLICY "Employees see own payroll entries"
ON public.payroll_entries
FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.payroll p WHERE p.id = payroll_id AND p.employee_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_payroll_entries_payroll_id ON public.payroll_entries(payroll_id);