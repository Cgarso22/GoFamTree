-- GoFamTree database schema (Supabase / Postgres)
-- Run once in the Supabase SQL editor. Safe to re-run: it drops nothing.
-- Every table is private to the families a signed-in user belongs to (row-level security).

create extension if not exists "pgcrypto";

-- ---------- types ----------
do $$ begin
  create type family_role as enum ('viewer','contributor','editor','owner');
exception when duplicate_object then null; end $$;
do $$ begin
  create type union_status as enum ('married','divorced','widowed','ended','partners');
exception when duplicate_object then null; end $$;
do $$ begin
  create type life_stage as enum ('child','adult','older');
exception when duplicate_object then null; end $$;
do $$ begin
  create type suggestion_status as enum ('pending','approved','declined');
exception when duplicate_object then null; end $$;

-- ---------- accounts & families ----------
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists family_members (
  family_id uuid not null references families on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role family_role not null default 'viewer',
  person_id text,                       -- which person in the tree this member is (their default center)
  created_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families on delete cascade,
  email text not null,
  role family_role not null default 'contributor',
  person_id text,
  token text not null unique default encode(gen_random_bytes(18),'hex'),
  invited_by uuid references auth.users,
  accepted_by uuid references auth.users,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- the tree ----------
-- Each family's tree is stored as documents, one row per person / marriage / contact / suggestion.
-- collection: people | unions | contacts (shared) | hiddencontacts (managers only) | suggestions (doc_id = submitter's user id)
create table if not exists family_docs (
  family_id uuid not null references families on delete cascade,
  collection text not null check (collection in ('people','unions','contacts','hiddencontacts','suggestions')),
  doc_id text not null,
  data jsonb not null default '{}',
  updated_by uuid references auth.users,
  updated_at timestamptz not null default now(),
  primary key (family_id, collection, doc_id)
);
create index if not exists family_docs_family on family_docs(family_id, collection);

-- ---------- access helpers ----------
create or replace function role_rank(r family_role) returns int language sql immutable as $$
  select case r when 'viewer' then 1 when 'contributor' then 2 when 'editor' then 3 when 'owner' then 4 end
$$;

create or replace function has_role(fam uuid, min_role family_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_members m
                 where m.family_id = fam and m.user_id = auth.uid()
                   and role_rank(m.role) >= role_rank(min_role))
$$;

-- the creator of a family becomes its owner
create or replace function add_owner_membership() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into family_members(family_id, user_id, role) values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists families_owner on families;
create trigger families_owner after insert on families for each row execute function add_owner_membership();

-- a signed-in person accepts an invite link
create or replace function accept_invite(invite_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv invites;
begin
  select * into inv from invites where token = invite_token and accepted_at is null;
  if inv.id is null then raise exception 'This invite link is no longer valid.'; end if;
  insert into family_members(family_id, user_id, role, person_id)
    values (inv.family_id, auth.uid(), inv.role, inv.person_id)
    on conflict (family_id, user_id) do update set role = greatest_role(family_members.role, excluded.role),
      person_id = coalesce(family_members.person_id, excluded.person_id);
  update invites set accepted_by = auth.uid(), accepted_at = now() where id = inv.id;
  return inv.family_id;
end $$;

create or replace function greatest_role(a family_role, b family_role) returns family_role
language sql immutable as $$ select case when role_rank(a) >= role_rank(b) then a else b end $$;

-- profile row on sign-up
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ---------- row-level security ----------
alter table profiles enable row level security;
alter table families enable row level security;
alter table family_members enable row level security;
alter table invites enable row level security;
alter table family_docs enable row level security;

-- profiles: you, plus people who share a family with you
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select using (
  id = auth.uid() or exists (select 1 from family_members a join family_members b on a.family_id = b.family_id
                             where a.user_id = auth.uid() and b.user_id = profiles.id));
drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles for update using (id = auth.uid());

-- families
drop policy if exists families_read on families;
create policy families_read on families for select using (has_role(id, 'viewer'));
drop policy if exists families_create on families;
create policy families_create on families for insert with check (owner_id = auth.uid());
drop policy if exists families_update on families;
create policy families_update on families for update using (has_role(id, 'owner'));

-- memberships: members see each other; only owners change roles
drop policy if exists members_read on family_members;
create policy members_read on family_members for select using (has_role(family_id, 'viewer'));
drop policy if exists members_manage on family_members;
create policy members_manage on family_members for all using (has_role(family_id, 'owner')) with check (has_role(family_id, 'owner'));
drop policy if exists members_self_person on family_members;
create policy members_self_person on family_members for update using (user_id = auth.uid()) with check (user_id = auth.uid() and role = (select m.role from family_members m where m.family_id = family_members.family_id and m.user_id = auth.uid()));

-- invites: owners and editors
drop policy if exists invites_manage on invites;
create policy invites_manage on invites for all using (has_role(family_id, 'editor')) with check (has_role(family_id, 'editor') and role_rank(role) <= 3);

-- tree documents
drop policy if exists docs_read on family_docs;
create policy docs_read on family_docs for select using (
     (collection in ('people','unions','contacts') and has_role(family_id, 'viewer'))
  or (collection = 'hiddencontacts' and has_role(family_id, 'editor'))
  or (collection = 'suggestions' and (doc_id = auth.uid()::text or has_role(family_id, 'editor'))));
drop policy if exists docs_write on family_docs;
create policy docs_write on family_docs for all using (
     (collection <> 'suggestions' and has_role(family_id, 'editor'))
  or (collection = 'suggestions' and ((doc_id = auth.uid()::text and has_role(family_id, 'contributor')) or has_role(family_id, 'editor'))))
with check (
     (collection <> 'suggestions' and has_role(family_id, 'editor'))
  or (collection = 'suggestions' and ((doc_id = auth.uid()::text and has_role(family_id, 'contributor')) or has_role(family_id, 'editor'))));

-- live updates for open pages
do $$ begin
  alter publication supabase_realtime add table family_docs;
exception when others then null; end $$;

-- ---------- file storage ----------
insert into storage.buckets (id, name, public) values ('family-media','family-media', false) on conflict do nothing;

drop policy if exists media_read on storage.objects;
create policy media_read on storage.objects for select using (
  bucket_id = 'family-media' and has_role(((storage.foldername(name))[1])::uuid, 'viewer'));
drop policy if exists media_upload on storage.objects;
create policy media_upload on storage.objects for insert with check (
  bucket_id = 'family-media' and has_role(((storage.foldername(name))[1])::uuid, 'contributor'));
drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects for delete using (
  bucket_id = 'family-media' and has_role(((storage.foldername(name))[1])::uuid, 'editor'));

-- create a family and become its owner in one step
create or replace function create_family(family_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  insert into families(name, owner_id) values (family_name, auth.uid()) returning id into fid;
  return fid;
end $$;

-- merge fields into one tree document (top-level keys replace), as the signed-in user
create or replace function merge_doc(fam uuid, coll text, did text, patch jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update family_docs set data = data || patch, updated_by = auth.uid(), updated_at = now()
   where family_id = fam and collection = coll and doc_id = did;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

-- ---------- private contact info & contact requests ----------
-- Each member's own contact details. Only they can read it; it's shared one request at a time.
create table if not exists member_contacts (
  user_id uuid primary key references auth.users on delete cascade,
  email text, phone text, address text,
  updated_at timestamptz not null default now()
);
alter table member_contacts enable row level security;
drop policy if exists mc_self on member_contacts;
create policy mc_self on member_contacts for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists contact_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families on delete cascade,
  from_user uuid not null default auth.uid() references auth.users on delete cascade,
  to_user uuid not null references auth.users on delete cascade,
  note text check (char_length(note) <= 500),
  offered jsonb not null default '{}',        -- what the requester chose to share
  shared jsonb,                               -- what the other person chose to share back
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  request_emailed_at timestamptz,
  response_emailed_at timestamptz,
  check (from_user <> to_user)
);
create unique index if not exists contact_requests_one_open on contact_requests(family_id, from_user, to_user) where status = 'pending';
alter table contact_requests enable row level security;
drop policy if exists cr_read on contact_requests;
create policy cr_read on contact_requests for select using (from_user = auth.uid() or to_user = auth.uid());
drop policy if exists cr_create on contact_requests;
create policy cr_create on contact_requests for insert with check (
  from_user = auth.uid() and status = 'pending' and shared is null and responded_at is null
  and request_emailed_at is null and response_emailed_at is null
  and has_role(family_id, 'viewer')
  and exists (select 1 from family_members m where m.family_id = contact_requests.family_id and m.user_id = contact_requests.to_user));
drop policy if exists cr_withdraw on contact_requests;
create policy cr_withdraw on contact_requests for delete using (from_user = auth.uid() and status = 'pending');

-- no more than 20 requests a day per person
create or replace function contact_request_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from contact_requests where from_user = new.from_user and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many contact requests today. Try again tomorrow.';
  end if;
  return new;
end $$;
drop trigger if exists contact_request_limit on contact_requests;
create trigger contact_request_limit before insert on contact_requests for each row execute function contact_request_limit();

-- the person asked answers: accept (choosing what to share) or decline
create or replace function respond_contact_request(req uuid, accept boolean, share jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare r contact_requests;
begin
  select * into r from contact_requests where id = req;
  if r.id is null or r.to_user <> auth.uid() then raise exception 'This request isn’t yours to answer.'; end if;
  if r.status <> 'pending' then raise exception 'You already answered this request.'; end if;
  update contact_requests set
    status = case when accept then 'accepted' else 'declined' end,
    shared = case when accept then (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(coalesce(share,'{}'))
                                    where key in ('email','phone','address') and jsonb_typeof(value) = 'string' and length(value #>> '{}') between 1 and 300)
             else null end,
    responded_at = now()
  where id = req;
end $$;
do $$ begin
  alter publication supabase_realtime add table contact_requests;
exception when others then null; end $$;
