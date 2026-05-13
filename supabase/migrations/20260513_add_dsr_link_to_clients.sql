-- Add dsr_entry_id to clients table to link them back to DSR entries
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS dsr_entry_id UUID REFERENCES dsr_entries(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_clients_dsr_entry_id ON clients(dsr_entry_id);
