-- Upgrade attendance table for Breaks and Auto-Logout tracking
ALTER TABLE public.attendance 
ADD COLUMN IF NOT EXISTS is_auto_logout BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS break_start_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS total_break_minutes INTEGER DEFAULT 0;

-- Create an index for faster lookups during the 'Morning Reset' check
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON public.attendance (employee_id, date);
