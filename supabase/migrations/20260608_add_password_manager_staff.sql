-- Update Password Entries Table with visibility
ALTER TABLE public.password_entries ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'admin_only'; -- 'admin_only', 'shared', 'personal'

-- Refresh RLS Policies
DROP POLICY IF EXISTS "Admins can view passwords" ON public.password_entries;
DROP POLICY IF EXISTS "Admins can insert passwords" ON public.password_entries;
DROP POLICY IF EXISTS "Admins can update passwords" ON public.password_entries;
DROP POLICY IF EXISTS "Admins can delete passwords" ON public.password_entries;

-- 1. VIEW POLICY
-- Admins see everything.
-- Employees see 'shared' entries OR entries they created.
CREATE POLICY "View Policy" ON public.password_entries
    FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'superadmin'))
        OR visibility = 'shared'
        OR created_by = auth.uid()
    );

-- 2. INSERT POLICY
-- Admins can insert anything.
-- Employees can insert 'personal' or 'shared' entries.
CREATE POLICY "Insert Policy" ON public.password_entries
    FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'superadmin'))
        OR (
            EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'employee')
            AND visibility IN ('personal', 'shared')
            AND (created_by = auth.uid() OR created_by IS NULL)
        )
    );

-- 3. UPDATE POLICY
-- Admins can update everything.
-- Employees can only update entries they created.
CREATE POLICY "Update Policy" ON public.password_entries
    FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'superadmin'))
        OR created_by = auth.uid()
    );

-- 4. DELETE POLICY
-- Admins can delete everything.
-- Employees can only delete entries they created.
CREATE POLICY "Delete Policy" ON public.password_entries
    FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'superadmin'))
        OR created_by = auth.uid()
    );
