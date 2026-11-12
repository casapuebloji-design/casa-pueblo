-- "על הפרק": לידים ופרויקטים שעוד לא נסגרו. רק הצוות רואה ועורך. לקוחות לא רואים בכלל.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  client text not null,
  phone text,
  type text,
  city text,
  amount numeric,
  designer text,
  start_month text,            -- YYYY-MM
  duration_months int,
  status text not null default 'lead' check (status in ('lead', 'hot', 'won', 'lost')),
  notes text,
  project_id uuid references public.projects(id) on delete set null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.leads_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads for each row execute function public.leads_touch();

alter table public.leads enable row level security;
drop policy if exists leads_staff on public.leads;
create policy leads_staff on public.leads for all using (public.is_staff()) with check (public.is_staff());
