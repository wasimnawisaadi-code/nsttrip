
-- ========================================
-- NAWI SAADI CRM - Complete Database Schema
-- ========================================

-- 1. ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'employee');
CREATE TYPE public.employee_profile_type AS ENUM ('office', 'sales');
CREATE TYPE public.client_status AS ENUM ('New', 'Processing', 'Success', 'Failed');
CREATE TYPE public.task_status AS ENUM ('New', 'Processing', 'Completed');
CREATE TYPE public.leave_status AS ENUM ('Pending', 'Approved', 'Rejected');
CREATE TYPE public.attendance_status AS ENUM ('Present', 'Late', 'Absent');
CREATE TYPE public.payroll_status AS ENUM ('Draft', 'Confirmed');
CREATE TYPE public.chat_type AS ENUM ('group', 'direct');

-- 2. HELPER: update_updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 3. USER ROLES TABLE (created first so has_role can reference it)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. ROLE CHECK FUNCTION (security definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS for user_roles
CREATE POLICY "Users can read own role" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 5. PROFILES TABLE
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  mobile TEXT,
  passport_no TEXT,
  emirates_id TEXT,
  photo_url TEXT,
  profile_type employee_profile_type DEFAULT 'office',
  allowed_ips TEXT[] DEFAULT '{}',
  base_salary NUMERIC(12,2) DEFAULT 0,
  leave_balance INTEGER DEFAULT 30,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id);
CREATE POLICY "Admins can delete profiles" ON public.profiles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. CLIENTS TABLE
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  email TEXT,
  passport_no TEXT,
  client_type TEXT,
  company_name TEXT,
  company_number TEXT,
  payment_type TEXT,
  service TEXT,
  service_subcategory TEXT,
  lead_source TEXT,
  nationality TEXT,
  service_details JSONB DEFAULT '{}',
  documents JSONB DEFAULT '[]',
  important_dates JSONB DEFAULT '{}',
  family_members JSONB DEFAULT '[]',
  status client_status DEFAULT 'New',
  assigned_to UUID REFERENCES auth.users(id),
  revenue NUMERIC(12,2) DEFAULT 0,
  profit NUMERIC(12,2) DEFAULT 0,
  notes TEXT DEFAULT '',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can access all clients" ON public.clients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Employees see assigned or created clients" ON public.clients FOR SELECT TO authenticated
  USING (assigned_to = auth.uid() OR created_by = auth.uid());
CREATE POLICY "Employees can create clients" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "Employees can update own clients" ON public.clients FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() OR created_by = auth.uid());

CREATE INDEX idx_clients_assigned ON public.clients(assigned_to);
CREATE INDEX idx_clients_created_by ON public.clients(created_by);
CREATE INDEX idx_clients_status ON public.clients(status);
CREATE INDEX idx_clients_service ON public.clients(service);
CREATE INDEX idx_clients_created_at ON public.clients(created_at);

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. CLIENT SERVICE HISTORY
CREATE TABLE public.client_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  service_subcategory TEXT,
  service_details JSONB DEFAULT '{}',
  documents JSONB DEFAULT '[]',
  family_members JSONB DEFAULT '[]',
  status client_status DEFAULT 'New',
  request_month TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.client_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins access all services" ON public.client_services FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Employees see own client services" ON public.client_services FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients WHERE id = client_id AND (assigned_to = auth.uid() OR created_by = auth.uid())));
CREATE POLICY "Employees can create services" ON public.client_services FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE INDEX idx_client_services_client ON public.client_services(client_id);

-- 8. TASKS TABLE
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT NOT NULL UNIQUE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name TEXT,
  service TEXT,
  title TEXT NOT NULL,
  assigned_to UUID REFERENCES auth.users(id),
  assigned_to_name TEXT,
  due_date DATE,
  completed_date DATE,
  status task_status DEFAULT 'New',
  profit NUMERIC(12,2) DEFAULT 0,
  notes TEXT DEFAULT '',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins access all tasks" ON public.tasks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Employees see assigned tasks" ON public.tasks FOR SELECT TO authenticated
  USING (assigned_to = auth.uid() OR created_by = auth.uid());
CREATE POLICY "Employees can create tasks" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "Employees can update own tasks" ON public.tasks FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid());

CREATE INDEX idx_tasks_assigned ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_status ON public.tasks(status);

-- 9. QUOTATIONS TABLE
CREATE TABLE public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT NOT NULL UNIQUE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name TEXT,
  service TEXT,
  line_items JSONB DEFAULT '[]',
  quoted_price NUMERIC(12,2) DEFAULT 0,
  payable_amount NUMERIC(12,2) DEFAULT 0,
  profit NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'Draft',
  valid_until DATE,
  generated_by UUID REFERENCES auth.users(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  emailed_at TIMESTAMPTZ
);
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins access all quotations" ON public.quotations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Employees see own quotations" ON public.quotations FOR SELECT TO authenticated
  USING (generated_by = auth.uid());
CREATE POLICY "Employees can create quotations" ON public.quotations FOR INSERT TO authenticated
  WITH CHECK (generated_by = auth.uid());

-- 10. ATTENDANCE TABLE
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  login_time TIMESTAMPTZ,
  logout_time TIMESTAMPTZ,
  hours_worked NUMERIC(5,1) DEFAULT 0,
  status attendance_status DEFAULT 'Present',
  work_summary TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, date)
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins access all attendance" ON public.attendance FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Employees see own attendance" ON public.attendance FOR SELECT TO authenticated
  USING (employee_id = auth.uid());
CREATE POLICY "Employees can insert own attendance" ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid());
CREATE POLICY "Employees can update own attendance" ON public.attendance FOR UPDATE TO authenticated
  USING (employee_id = auth.uid());

CREATE INDEX idx_attendance_employee_date ON public.attendance(employee_id, date);

-- 11. LEAVE REQUESTS TABLE
CREATE TABLE public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT NOT NULL UNIQUE,
  employee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days INTEGER DEFAULT 1,
  reason TEXT DEFAULT '',
  leave_type TEXT DEFAULT 'Annual',
  document JSONB,
  status leave_status DEFAULT 'Pending',
  reviewed_by TEXT DEFAULT '',
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins access all leave" ON public.leave_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Employees see own leave" ON public.leave_requests FOR SELECT TO authenticated
  USING (employee_id = auth.uid());
CREATE POLICY "Employees can create leave" ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid());

CREATE INDEX idx_leave_employee ON public.leave_requests(employee_id);
CREATE INDEX idx_leave_status ON public.leave_requests(status);

-- 12. PAYROLL TABLE
CREATE TABLE public.payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT NOT NULL UNIQUE,
  employee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  base_salary NUMERIC(12,2) DEFAULT 0,
  present_days INTEGER DEFAULT 0,
  late_days INTEGER DEFAULT 0,
  paid_leave_days INTEGER DEFAULT 0,
  sick_leave INTEGER DEFAULT 0,
  unpaid_leave INTEGER DEFAULT 0,
  absent_days INTEGER DEFAULT 0,
  total_hours NUMERIC(7,1) DEFAULT 0,
  sick_deduction NUMERIC(12,2) DEFAULT 0,
  unpaid_deduction NUMERIC(12,2) DEFAULT 0,
  absence_deduction NUMERIC(12,2) DEFAULT 0,
  late_deduction NUMERIC(12,2) DEFAULT 0,
  total_deductions NUMERIC(12,2) DEFAULT 0,
  bonus NUMERIC(12,2) DEFAULT 0,
  allowances NUMERIC(12,2) DEFAULT 0,
  overtime NUMERIC(12,2) DEFAULT 0,
  final_salary NUMERIC(12,2) DEFAULT 0,
  confirmed_by TEXT DEFAULT '',
  confirmed_at TIMESTAMPTZ,
  status payroll_status DEFAULT 'Draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, year_month)
);
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins access all payroll" ON public.payroll FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Employees see own payroll" ON public.payroll FOR SELECT TO authenticated
  USING (employee_id = auth.uid());

-- 13. GOALS TABLE
CREATE TABLE public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT NOT NULL UNIQUE,
  year_month TEXT NOT NULL,
  service TEXT NOT NULL,
  target INTEGER DEFAULT 0,
  achieved INTEGER DEFAULT 0,
  assigned_to UUID REFERENCES auth.users(id),
  title TEXT,
  description TEXT,
  start_date DATE,
  end_date DATE,
  goal_tasks JSONB DEFAULT '[]',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins access all goals" ON public.goals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Employees see assigned goals" ON public.goals FOR SELECT TO authenticated
  USING (assigned_to = auth.uid() OR assigned_to IS NULL);

-- 14. NOTIFICATIONS TABLE
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'general',
  title TEXT NOT NULL,
  message TEXT DEFAULT '',
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Authenticated can insert notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read);

-- 15. AUDIT LOG TABLE
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT DEFAULT 'System',
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT DEFAULT '',
  changes JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read audit log" ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can insert audit log" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_audit_target ON public.audit_log(target_type, target_id);
CREATE INDEX idx_audit_created ON public.audit_log(created_at DESC);

-- 16. CHAT GROUPS TABLE
CREATE TABLE public.chat_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  members UUID[] DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can see groups" ON public.chat_groups FOR SELECT TO authenticated
  USING (auth.uid() = ANY(members));
CREATE POLICY "Authenticated can create groups" ON public.chat_groups FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = ANY(members));
CREATE POLICY "Admins manage all groups" ON public.chat_groups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 17. CHAT MESSAGES TABLE
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  sender_photo TEXT,
  recipient_id UUID REFERENCES auth.users(id),
  group_id UUID REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  message_type chat_type NOT NULL DEFAULT 'group',
  text TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see group messages" ON public.chat_messages FOR SELECT TO authenticated
  USING (
    (message_type = 'group' AND EXISTS (SELECT 1 FROM public.chat_groups WHERE id = group_id AND auth.uid() = ANY(members)))
    OR (message_type = 'direct' AND (sender_id = auth.uid() OR recipient_id = auth.uid()))
  );
CREATE POLICY "Authenticated can send messages" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());
CREATE POLICY "Users can update read status" ON public.chat_messages FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid() OR (message_type = 'group' AND EXISTS (SELECT 1 FROM public.chat_groups WHERE id = group_id AND auth.uid() = ANY(members))));

CREATE INDEX idx_chat_group ON public.chat_messages(group_id, created_at);
CREATE INDEX idx_chat_dm ON public.chat_messages(sender_id, recipient_id, created_at);

-- 18. DISPLAY ID SEQUENCE FUNCTION
CREATE OR REPLACE FUNCTION public.generate_display_id(prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq_name TEXT;
  next_val BIGINT;
  pad_len INTEGER;
BEGIN
  seq_name := 'seq_' || lower(prefix);
  BEGIN
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START WITH 1', seq_name);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  EXECUTE format('SELECT nextval(%L)', seq_name) INTO next_val;
  IF prefix IN ('EMP', 'ADM', 'GOAL') THEN pad_len := 3;
  ELSE pad_len := 5;
  END IF;
  RETURN prefix || '-' || lpad(next_val::TEXT, pad_len, '0');
END;
$$;

-- 19. STORAGE BUCKETS
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('photos', 'photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload documents" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents');
CREATE POLICY "Users can view documents" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'documents');
CREATE POLICY "Anyone can view photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'photos');
CREATE POLICY "Authenticated can upload photos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'photos');

-- 20. REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
