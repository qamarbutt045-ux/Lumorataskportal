-- =====================================================================
-- CUSTOM TASK MANAGEMENT PORTAL - SUPABASE SQL SCHEMA
-- Run this in the Supabase SQL Editor to set up tables, sequences,
-- triggers, and Row Level Security (RLS) policies.
-- =====================================================================

-- 1. Create Sequence for unique short numeric Task Codes (starting at 1001)
create sequence if not exists public.task_code_seq start with 1001;

-- 2. Create Profiles Table (linked to Supabase Auth)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  email text not null,
  phone text, -- phone with country code (e.g. +1234567890)
  role text not null check (role in ('Admin', 'Member')) default 'Member',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create Tasks Table
create table if not exists public.tasks (
  id text primary key default '#' || nextval('public.task_code_seq')::text,
  title text not null,
  description text,
  assigned_to uuid references public.profiles(id) on delete set null,
  deadline timestamp with time zone,
  status text not null check (status in ('Pending', 'In Progress', 'Done')) default 'Pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  scheduled_date date,
  completed_at timestamp with time zone,
  rollover_count integer default 0,
  original_date date,
  next_task_id text references public.tasks(id) on delete set null,
  is_active boolean default true,
  in_progress_at timestamp with time zone,
  duration_seconds integer
);

-- 4. Helper Function to check if the current user is an Admin
-- Marked as SECURITY DEFINER to bypass RLS and avoid infinite recursion
create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'Admin'
  );
end;
$$ language plpgsql security definer;

-- 5. Automate Profile Creation on Sign-up
-- The first user to register becomes the "Admin". Subsequent users default to "Member"
-- but can be overridden by user metadata (e.g. when created by another Admin).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, email, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'phone', new.phone),
    coalesce(
      new.raw_user_meta_data->>'role',
      case 
        when not exists (select 1 from public.profiles) then 'Admin'
        else 'Member'
      end
    )
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to execute function on auth.users insert
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 6. Enable Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;

-- 7. RLS Policies for Profiles
create policy "Allow authenticated users to read all profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Allow users to update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

create policy "Allow admins to perform all actions on profiles"
  on public.profiles for all
  to authenticated
  using (public.is_admin());

-- 8. RLS Policies for Tasks
create policy "Allow authenticated users to view all tasks"
  on public.tasks for select
  to authenticated
  using (true);

create policy "Allow members to update tasks assigned to them"
  on public.tasks for update
  to authenticated
  using (assigned_to = auth.uid() or public.is_admin())
  with check (assigned_to = auth.uid() or public.is_admin());

create policy "Allow admins to perform all actions on tasks"
  on public.tasks for all
  to authenticated
  using (public.is_admin());

-- 9. Complete Task via WhatsApp RPC Function
-- This allows updating a task status via WhatsApp webhook without exposing service role keys.
create or replace function public.complete_task_via_whatsapp(
  p_task_id text,
  p_sender_phone text
)
returns boolean as $$
declare
  v_assigned_phone text;
  v_assigned_user uuid;
begin
  -- Find the task's assigned user
  select assigned_to into v_assigned_user
  from public.tasks
  where id = p_task_id;

  if v_assigned_user is null then
    return false; -- Task not found or not assigned
  end if;

  -- Get the assigned user's phone number
  select phone into v_assigned_phone
  from public.profiles
  where id = v_assigned_user;

  if v_assigned_phone is null then
    return false; -- Profile has no phone number
  end if;

  -- Clean both phone numbers (remove +, spaces, dashes, parentheses)
  -- to ensure reliable comparison
  if regexp_replace(v_assigned_phone, '\D', '', 'g') != regexp_replace(p_sender_phone, '\D', '', 'g') then
    return false; -- Phone number mismatch
  end if;

  -- Update task status to Done
  update public.tasks
  set status = 'Done', completed_at = now()
  where id = p_task_id;

  return true;
end;
$$ language plpgsql security definer;

-- 10. Performance Logs Table for daily attendance & completion reporting
create table if not exists public.performance_logs (
  id uuid default gen_random_uuid() primary key,
  date date not null default current_date,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  assigned_count integer default 0,
  completed_count integer default 0,
  is_leave boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (date, profile_id)
);

alter table public.performance_logs enable row level security;

create policy "Allow authenticated users to read performance logs"
  on public.performance_logs for select
  to authenticated
  using (true);

create policy "Allow admins to perform all actions on performance logs"
  on public.performance_logs for all
  to authenticated
  using (public.is_admin());
