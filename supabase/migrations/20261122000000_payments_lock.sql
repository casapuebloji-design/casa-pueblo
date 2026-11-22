-- Payments to Casa Pueblo (22.11.2026): the contract payment plan and the "paid" mark on additions
-- are Jorge's alone. Until now only the paid date / invoice of each milestone was locked, because
-- approving an addition used to add its amount to the last milestone. Additions are now tracked
-- separately, so the whole casaMilestones array is locked, and so is changes[].paid.
create or replace function public.save_project(pid uuid, new_data jsonb, expected_version integer)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  cur projects%rowtype;
  old_d jsonb;
  k text;
  changed text[] := '{}';
  client_locked text[] := array['members', 'team', 'timeline', 'weeklySummaries'];
  detail_keys text[] := array['name', 'family', 'address', 'client', 'start', 'handover', 'image', 'scope', 'area'];
  pstaff boolean := is_project_staff(pid);
  jorge boolean := is_admin();
  events jsonb := '[]';
begin
  select * into cur from projects where id = pid for update;
  if not found then raise exception 'project not found'; end if;
  if not (pstaff or is_member(pid)) then raise exception 'not allowed'; end if;
  if cur.version <> expected_version then raise exception 'version conflict' using errcode = '40001'; end if;
  old_d := cur.data;

  for k in select jsonb_object_keys(old_d || new_data) loop
    if (old_d -> k) is distinct from (new_data -> k) then changed := changed || k; end if;
  end loop;

  -- בן משפחה: לא נוגע בצוות, בחברים, בלוח הזמנים ובסיכומים השבועיים, ובפרויקט משנה רק את טקסט העדכון.
  if not pstaff then
    if changed && client_locked then raise exception 'clients cannot change: %', array_to_string(changed, ', '); end if;
    if (old_d -> 'project') - 'weekly' is distinct from (new_data -> 'project') - 'weekly' then raise exception 'clients cannot change the project details'; end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(new_data -> 'plans', '[]')) n
      left join jsonb_array_elements(coalesce(old_d -> 'plans', '[]')) o on o ->> 'id' = n ->> 'id'
      where (o is null and coalesce(n ->> 'exec', 'draft') <> 'draft')
         or (o is not null and (n -> 'exec') is distinct from (o -> 'exec')
             and not (coalesce(n ->> 'exec', 'draft') = 'draft' and (n #> '{versions,0,v}') is distinct from (o #> '{versions,0,v}')))
    ) then raise exception 'only the team can change a plan status'; end if;
    if exists (select 1 from jsonb_array_elements(coalesce(old_d -> 'materials', '[]')) o
               where not exists (select 1 from jsonb_array_elements(coalesce(new_data -> 'materials', '[]')) n where n ->> 'id' = o ->> 'id'))
      then raise exception 'only the team can delete materials'; end if;
  end if;

  -- רק חורחה: פרטי הפרויקט, תכנית התשלומים לקאסה פואבלו וסימון "שולם", שינויים ותוספות חדשים, מחיקת מסמכים, אישור ושליחת סיכום שבועי.
  if not jorge then
    if exists (select 1 from unnest(detail_keys) dk where (old_d #> array['project', dk]) is distinct from (new_data #> array['project', dk]))
      then raise exception 'only Jorge can change the project details'; end if;
    if coalesce(old_d -> 'casaMilestones', '[]') is distinct from coalesce(new_data -> 'casaMilestones', '[]')
      then raise exception 'only Jorge can change the payment plan or record payments'; end if;
    if exists (select 1 from jsonb_array_elements(coalesce(new_data -> 'changes', '[]')) n
               where not exists (select 1 from jsonb_array_elements(coalesce(old_d -> 'changes', '[]')) o where o ->> 'id' = n ->> 'id'))
      then raise exception 'only Jorge can add a change'; end if;
    if exists (select 1 from jsonb_array_elements(coalesce(new_data -> 'changes', '[]')) n
               join jsonb_array_elements(coalesce(old_d -> 'changes', '[]')) o on o ->> 'id' = n ->> 'id'
               where (n -> 'paid') is distinct from (o -> 'paid') or (n -> 'amount') is distinct from (o -> 'amount'))
      then raise exception 'only Jorge can record payments'; end if;
    if exists (select 1 from jsonb_array_elements(coalesce(old_d -> 'documents', '[]')) o
               where not exists (select 1 from jsonb_array_elements(coalesce(new_data -> 'documents', '[]')) n where n ->> 'id' = o ->> 'id'))
      then raise exception 'only Jorge can delete documents'; end if;
    if exists (select 1 from jsonb_array_elements(coalesce(new_data -> 'weeklySummaries', '[]')) n
               left join jsonb_array_elements(coalesce(old_d -> 'weeklySummaries', '[]')) o on o ->> 'id' = n ->> 'id'
               where n ->> 'status' in ('approved', 'sent') and (o -> 'status') is distinct from (n -> 'status'))
      then raise exception 'only Jorge can approve the weekly summary'; end if;
  end if;

  update projects set
    data = new_data,
    name = coalesce(new_data #>> '{project,name}', name),
    family = coalesce(new_data #>> '{project,family}', family),
    version = version + 1,
    updated_at = now(),
    updated_by = auth.uid()
  where id = pid;

  if array_length(changed, 1) > 0 then
    insert into audit_log (project_id, actor, actor_email, action, detail)
    values (pid, auth.uid(), (select email from profiles where id = auth.uid()), 'save', jsonb_build_object('changed', changed));
  end if;

  -- מייל לחורחה: כל קובץ חדש (מסמך, תכנית או גרסה) וכל תכנית שהמשפחה אישרה. לא כשחורחה עצמו עשה את זה.
  if not jorge then
    select coalesce(jsonb_agg(e), '[]') into events from (
      select jsonb_build_object('kind', 'file', 'title', n ->> 'title', 'cat', n ->> 'cat') e
        from jsonb_array_elements(coalesce(new_data -> 'documents', '[]')) n
        where not exists (select 1 from jsonb_array_elements(coalesce(old_d -> 'documents', '[]')) o where o ->> 'id' = n ->> 'id')
      union all
      select jsonb_build_object('kind', 'plan', 'title', (n ->> 'title') || ' · גרסה ' || (n #>> '{versions,0,v}'), 'cat', n ->> 'cat')
        from jsonb_array_elements(coalesce(new_data -> 'plans', '[]')) n
        left join jsonb_array_elements(coalesce(old_d -> 'plans', '[]')) o on o ->> 'id' = n ->> 'id'
        where o is null or (n #> '{versions,0,v}') is distinct from (o #> '{versions,0,v}')
      union all
      select jsonb_build_object('kind', 'approved', 'title', n ->> 'title', 'cat', n ->> 'cat')
        from jsonb_array_elements(coalesce(new_data -> 'plans', '[]')) n
        join jsonb_array_elements(coalesce(old_d -> 'plans', '[]')) o on o ->> 'id' = n ->> 'id'
        where n ->> 'status' = 'approved' and (o ->> 'status') is distinct from 'approved'
    ) x;
    if jsonb_array_length(events) > 0 then perform notify_jorge(pid, events); end if;
  end if;
  return cur.version + 1;
end $function$;
