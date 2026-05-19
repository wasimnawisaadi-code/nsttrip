DROP POLICY IF EXISTS "Employees can take unassigned leads" ON public.social_leads;

CREATE POLICY "Employees can take unassigned leads"
  ON public.social_leads FOR UPDATE TO authenticated
  USING (assigned_to IS NULL OR assigned_to = auth.uid())
  WITH CHECK (true);
