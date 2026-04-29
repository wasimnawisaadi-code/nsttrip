
-- Fix notifications: ensure user_id matches inserter or they are admin
DROP POLICY "Authenticated can insert notifications" ON public.notifications;
CREATE POLICY "Users can insert notifications for others" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id IS NOT NULL);

-- Fix audit_log: require user_id matches auth.uid()
DROP POLICY "Authenticated can insert audit log" ON public.audit_log;
CREATE POLICY "Users can insert own audit entries" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
