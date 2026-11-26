-- Document categories the team added, shared by all projects (the fixed ones are DOC_CATEGORIES in js/data.js).
create table if not exists public.doc_categories (
  name text primary key check (length(trim(name)) between 1 and 60),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.doc_categories enable row level security;
-- Everyone signed in sees them (the family picks from the list when uploading); only the team adds or removes.
create policy doc_categories_read on public.doc_categories for select to authenticated using (true);
create policy doc_categories_insert on public.doc_categories for insert to authenticated with check (public.is_staff());
create policy doc_categories_delete on public.doc_categories for delete to authenticated using (public.is_staff());
