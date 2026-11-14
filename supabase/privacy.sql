-- GoFamTree privacy layer
-- Living people's details are shown in full only to their close family (out to first cousins and spouses),
-- to the tree's owners and editors, to themselves, and to anyone they (or their close family) approve.
-- Everyone else in the tree sees the name, relationship and one main photo; the rest stays private.
-- Children under 18 are visible in full only to their immediate family.

-- ---------- helpers ----------
create or replace function fam_edges(fam uuid) returns table(child text, parent text)
language sql stable security definer set search_path = public as $$
  select d.doc_id, p from family_docs d, jsonb_array_elements_text(coalesce(d.data->'parents','[]'::jsonb)) p
  where d.family_id = fam and d.collection = 'people'
$$;

create or replace function fam_spouses(fam uuid) returns table(a text, b text)
language sql stable security definer set search_path = public as $$
  select data->>'a', data->>'b' from family_docs where family_id = fam and collection = 'unions'
  union all
  select data->>'b', data->>'a' from family_docs where family_id = fam and collection = 'unions'
$$;

create or replace function birth_year(d jsonb) returns int language sql immutable as $$
  select nullif(substring(coalesce(d->>'born','') from '(\d{4})'), '')::int
$$;

-- someone is treated as living unless marked deceased, given a death date, or born before 1910
create or replace function is_living(d jsonb) returns boolean language sql immutable as $$
  select not (coalesce((d->>'deceased')::boolean, false) or coalesce(d->>'died','') <> '' or coalesce(birth_year(d), 9999) < 1910)
$$;

create or replace function is_minor(d jsonb) returns boolean language sql stable as $$
  select birth_year(d) is not null and birth_year(d) > extract(year from now())::int - 18
$$;

-- out to first cousins: everyone descended from my grandparents, all my ancestors, everyone's partners,
-- plus my partners' parents and brothers and sisters
create or replace function close_circle(fam uuid, pid text) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare res text[]; gp text[]; mysp text[]; inlaw_parents text[];
begin
  if pid is null then return '{}'; end if;
  with recursive e as (select * from fam_edges(fam)),
    up(id, d) as (select pid, 0 union select e.parent, up.d + 1 from up join e on e.child = up.id where up.d < 2)
  select array_agg(distinct id) into gp from up;
  with recursive e as (select * from fam_edges(fam)),
    down(id) as (select unnest(gp) union select e.child from down join e on e.parent = down.id)
  select array_agg(distinct id) into res from down;
  with recursive e as (select * from fam_edges(fam)),
    up2(id) as (select pid union select e.parent from up2 join e on e.child = up2.id)
  select res || array_agg(distinct id) into res from up2;
  select coalesce(array_agg(b), '{}') into mysp from fam_spouses(fam) where a = pid;
  select coalesce(array_agg(parent), '{}') into inlaw_parents from fam_edges(fam) where child = any(mysp);
  res := res || inlaw_parents || coalesce((select array_agg(child) from fam_edges(fam) where parent = any(inlaw_parents)), '{}');
  res := res || coalesce((select array_agg(b) from fam_spouses(fam) where a = any(res)), '{}');
  return res;
end $$;

-- a child's immediate family: parents (and their partners), grandparents, brothers and sisters, aunts and uncles
create or replace function immediate_family(fam uuid, pid text) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare par text[]; gpar text[];
begin
  select coalesce(array_agg(parent), '{}') into par from fam_edges(fam) where child = pid;
  select coalesce(array_agg(parent), '{}') into gpar from fam_edges(fam) where child = any(par);
  return par || gpar
    || coalesce((select array_agg(child) from fam_edges(fam) where parent = any(par) or parent = any(gpar)), '{}')
    || coalesce((select array_agg(b) from fam_spouses(fam) where a = any(par)), '{}');
end $$;

-- who can approve someone's request to see a person: that person, their parents, children, brothers, sisters
-- and partners (if they're members), and the tree's owners and editors
create or replace function close_relatives(fam uuid, pid text) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(x), '{}') from (
    select parent as x from fam_edges(fam) where child = pid
    union select child from fam_edges(fam) where parent = pid
    union select e2.child from fam_edges(fam) e1 join fam_edges(fam) e2 on e2.parent = e1.parent where e1.child = pid and e2.child <> pid
    union select b from fam_spouses(fam) where a = pid) t
$$;

create or replace function my_person(fam uuid) returns text
language sql stable security definer set search_path = public as $$
  select person_id from family_members where family_id = fam and user_id = auth.uid()
$$;

create or replace function can_approve(fam uuid, pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select has_role(fam, 'editor') or my_person(fam) = pid or my_person(fam) = any(close_relatives(fam, pid))
$$;

-- ---------- access requests & grants ----------
create table if not exists view_grants (
  family_id uuid not null references families on delete cascade,
  grantee uuid not null references auth.users on delete cascade,
  person_id text not null,
  granted_by uuid references auth.users,
  created_at timestamptz not null default now(),
  primary key (family_id, grantee, person_id)
);
alter table view_grants enable row level security;
drop policy if exists vg_read on view_grants;
create policy vg_read on view_grants for select using (grantee = auth.uid() or can_approve(family_id, person_id));
drop policy if exists vg_revoke on view_grants;
create policy vg_revoke on view_grants for delete using (can_approve(family_id, person_id));

create table if not exists view_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families on delete cascade,
  requester uuid not null default auth.uid() references auth.users on delete cascade,
  person_id text not null,
  note text check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  decided_by uuid references auth.users,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index if not exists view_requests_one_open on view_requests(family_id, requester, person_id) where status = 'pending';
alter table view_requests enable row level security;
drop policy if exists vr_read on view_requests;
create policy vr_read on view_requests for select using (requester = auth.uid() or can_approve(family_id, person_id));
drop policy if exists vr_create on view_requests;
create policy vr_create on view_requests for insert with check (
  requester = auth.uid() and status = 'pending' and decided_by is null and has_role(family_id, 'viewer'));
drop policy if exists vr_withdraw on view_requests;
create policy vr_withdraw on view_requests for delete using (requester = auth.uid() and status = 'pending');

create or replace function decide_access(req uuid, approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r view_requests;
begin
  select * into r from view_requests where id = req;
  if r.id is null or not can_approve(r.family_id, r.person_id) then raise exception 'You can’t answer this request.'; end if;
  if r.status <> 'pending' then raise exception 'This request was already answered.'; end if;
  update view_requests set status = case when approve then 'approved' else 'declined' end, decided_by = auth.uid(), decided_at = now() where id = req;
  if approve then
    insert into view_grants(family_id, grantee, person_id, granted_by) values (r.family_id, r.requester, r.person_id, auth.uid())
    on conflict do nothing;
  end if;
end $$;

-- a member's own choices about their entry: whether where they live is shown beyond close family,
-- and whether their main photo is shown to the rest of the tree
create or replace function set_my_privacy(fam uuid, share_residence text, hide_portrait boolean) returns void
language plpgsql security definer set search_path = public as $$
declare pid text := my_person(fam);
begin
  if pid is null then raise exception 'Link yourself to a person in the tree first.'; end if;
  if share_residence not in ('close','tree') then raise exception 'Unknown setting'; end if;
  update family_docs set data = data || jsonb_build_object('shareResidence', share_residence, 'hidePortrait', hide_portrait),
    updated_by = auth.uid(), updated_at = now()
  where family_id = fam and collection = 'people' and doc_id = pid;
end $$;

-- ---------- what each viewer gets ----------
create or replace function mask_person(d jsonb, minor boolean) returns jsonb language sql immutable as $$
  select case when minor then
      jsonb_strip_nulls(jsonb_build_object('first', d->'first', 'middle', d->'middle', 'last', d->'last', 'name', d->'name',
        'g', d->'g', 'parents', d->'parents', 'placeholder', d->'placeholder', '_masked', true, '_minor', true))
    else
      jsonb_strip_nulls(jsonb_build_object('first', d->'first', 'middle', d->'middle', 'last', d->'last', 'name', d->'name',
        'aka', d->'aka', 'g', d->'g', 'parents', d->'parents', 'placeholder', d->'placeholder',
        'nick', case when coalesce((d->>'showNick')::boolean, true) then d->'nick' end,
        'portrait', case when not coalesce((d->>'hidePortrait')::boolean, false) then d->'portrait' end,
        'gallery', case when not coalesce((d->>'hidePortrait')::boolean, false) and d ? 'portrait' then
            (select jsonb_agg(g) from jsonb_array_elements(coalesce(d->'gallery','[]'::jsonb)) g where g->>'id' = d->>'portrait') end,
        'residence', case when d->>'shareResidence' = 'tree' then d->'residence' end,
        '_masked', true,
        '_hidden', (select jsonb_agg(k) from jsonb_object_keys(d) k where k in
            ('born','bornPlace','bornHospital','residence','died','jobs','occupation','hsSchool','colSchool','gradSchool','eduOther',
             'notes','stories','docs','gallery') and not (k = 'residence' and coalesce(d->>'shareResidence','') = 'tree'))))
  end
$$;

create or replace function family_people(fam uuid, coll text default 'people') returns table(doc_id text, data jsonb)
language plpgsql stable security definer set search_path = public as $$
declare me text; circle text[]; granted text[];
begin
  if not has_role(fam, 'viewer') then return; end if;
  if coll not in ('people','contacts') then raise exception 'Unknown collection'; end if;
  if has_role(fam, 'editor') then
    return query select d.doc_id, d.data from family_docs d where d.family_id = fam and d.collection = coll; return;
  end if;
  me := my_person(fam);
  circle := close_circle(fam, me);
  select coalesce(array_agg(g.person_id), '{}') into granted from view_grants g where g.family_id = fam and g.grantee = auth.uid();
  if coll = 'contacts' then
    return query select c.doc_id, c.data from family_docs c join family_docs p
      on p.family_id = c.family_id and p.collection = 'people' and p.doc_id = c.doc_id
      where c.family_id = fam and c.collection = 'contacts'
        and (c.doc_id = me or c.doc_id = any(granted) or not is_living(p.data)
             or (c.doc_id = any(circle) and (not is_minor(p.data) or me = any(immediate_family(fam, c.doc_id)))));
    return;
  end if;
  return query select d.doc_id,
    case
      when not is_living(d.data) or d.doc_id = me or d.doc_id = any(granted) then d.data
      when is_minor(d.data) then case when me = any(immediate_family(fam, d.doc_id)) then d.data else mask_person(d.data, true) end
      when d.doc_id = any(circle) then
        case when d.data->>'shareResidence' = 'self' then d.data - 'residence' else d.data end
      else mask_person(d.data, false)
    end
  from family_docs d where d.family_id = fam and d.collection = 'people';
end $$;

-- people and contact documents are now read through family_people(); only editors read the table directly
drop policy if exists docs_read on family_docs;
create policy docs_read on family_docs for select using (
     (collection = 'unions' and has_role(family_id, 'viewer'))
  or (collection in ('people','contacts','hiddencontacts') and has_role(family_id, 'editor'))
  or (collection = 'suggestions' and (doc_id = auth.uid()::text or has_role(family_id, 'editor'))));

-- ---------- change signal for open pages (viewers can't watch the documents themselves) ----------
create table if not exists family_changes (
  family_id uuid not null references families on delete cascade,
  collection text not null,
  changed_at timestamptz not null default now(),
  primary key (family_id, collection)
);
alter table family_changes enable row level security;
drop policy if exists fc_read on family_changes;
create policy fc_read on family_changes for select using (has_role(family_id, 'viewer'));

create or replace function note_family_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into family_changes(family_id, collection, changed_at)
  values (coalesce(new.family_id, old.family_id), coalesce(new.collection, old.collection), now())
  on conflict (family_id, collection) do update set changed_at = excluded.changed_at;
  return null;
end $$;
drop trigger if exists family_docs_changed on family_docs;
create trigger family_docs_changed after insert or update or delete on family_docs for each row execute function note_family_change();

create or replace function note_grant_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into family_changes(family_id, collection, changed_at)
  values (coalesce(new.family_id, old.family_id), 'grants', now())
  on conflict (family_id, collection) do update set changed_at = excluded.changed_at;
  return null;
end $$;
drop trigger if exists view_grants_changed on view_grants;
create trigger view_grants_changed after insert or delete on view_grants for each row execute function note_grant_change();
drop trigger if exists view_requests_changed on view_requests;
create trigger view_requests_changed after insert or update or delete on view_requests for each row execute function note_grant_change();

do $$ begin alter publication supabase_realtime add table family_changes; exception when others then null; end $$;

revoke execute on function close_circle(uuid,text), immediate_family(uuid,text), close_relatives(uuid,text), fam_edges(uuid), fam_spouses(uuid),
  note_family_change(), note_grant_change() from public, anon, authenticated;
revoke execute on function family_people(uuid,text), decide_access(uuid,boolean), set_my_privacy(uuid,text,boolean), can_approve(uuid,text), my_person(uuid) from public, anon;
grant execute on function family_people(uuid,text), decide_access(uuid,boolean), set_my_privacy(uuid,text,boolean), can_approve(uuid,text), my_person(uuid) to authenticated;
