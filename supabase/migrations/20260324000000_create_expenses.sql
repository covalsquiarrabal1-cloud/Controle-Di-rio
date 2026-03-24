-- Create expenses table
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    date DATE NOT NULL,
    user_id UUID -- Optional for now, can be linked to auth.users if needed later
);

-- Set up Row Level Security (RLS)
-- For now, we'll allow all access for simplicity, but in production, we'd restrict by user_id
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public access to expenses"
ON public.expenses
FOR ALL
USING (true)
WITH CHECK (true);
