
-- Create hotel_contracts table
CREATE TABLE IF NOT EXISTS public.hotel_contracts (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    hotel_name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Inbound', 'Outbound')),
    rating TEXT,
    document_url TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.hotel_contracts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can do everything on hotel_contracts" 
ON public.hotel_contracts 
FOR ALL 
TO authenticated 
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Employees can view hotel_contracts" 
ON public.hotel_contracts 
FOR SELECT 
TO authenticated 
USING (true);

-- Create storage bucket for hotel contracts
INSERT INTO storage.buckets (id, name, public) 
VALUES ('hotel-contracts', 'hotel-contracts', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'hotel-contracts');
CREATE POLICY "Admin Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'hotel-contracts' AND (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin')));
