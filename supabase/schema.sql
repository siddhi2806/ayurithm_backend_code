-- =============================================================
-- AyuRithm Database Schema
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- =============================================================

-- 1. PROFILES TABLE
-- Linked to auth.users via id. Stores user identity + onboarding context.
create table if not exists public.profiles (
  id            uuid references auth.users on delete cascade primary key,
  first_name    text not null,
  last_name     text not null,
  email         text not null,

  -- Onboarding context (populated after sign-up)
  location_tag       text,            -- e.g. 'KONKAN_ALL'
  location_lat       double precision,
  location_lng       double precision,
  system_date        date,            -- user's system date at onboarding
  current_ritu       text,            -- e.g. 'Vasant Ritu'

  -- Prakriti (populated after assessment)
  base_prakriti      jsonb,           -- {dominant, secondary, suppressed, dual_dosha, scores}

  -- Deep medical profiling (populated later)
  dietary_preference  text,
  allergies           text[] default '{}',
  health_conditions   text[] default '{}',
  medications         text[] default '{}',
  doctor_restrictions text,

  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Enable Row Level Security
alter table public.profiles enable row level security;

-- Users can read/update only their own profile
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can delete own profile"
  on public.profiles for delete
  using (auth.uid() = id);


-- TRIGGER: Auto-create profile row when a new auth user is created.
-- Runs with SECURITY DEFINER so it bypasses RLS (no session required).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, first_name, last_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

-- Drop if exists so re-running the script is safe
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- 2. USER_ASSESSMENTS TABLE
-- Stores prakriti assessment results, predicted food suggestions,
-- and the environmental context snapshot at time of assessment.
create table if not exists public.user_assessments (
  id                 uuid default gen_random_uuid() primary key,
  user_id            uuid references public.profiles(id) on delete cascade not null,

  -- Prakriti assessment input (15-question answer array, values 0/1/2)
  assessment_answers integer[] not null,

  -- Prakriti prediction output
  dominant_prakriti  text not null,          -- e.g. 'Vata'
  suppressed_prakriti text not null,         -- e.g. 'Kapha'
  prakriti_scores    jsonb not null,         -- e.g. {"Vata": 0.60, "Pitta": 0.30, "Kapha": 0.10}

  -- Environmental context snapshot at assessment time
  location_tag       text,
  location_lat       double precision,
  location_lng       double precision,
  system_date        date not null,
  current_ritu       text not null,

  -- GNN food suggestion output
  food_suggestions   jsonb,                  -- array of {food_id, name, score, category, reason}
  blocked_foods      jsonb,                  -- array of {food_id, name, score, reason}

  created_at         timestamptz default now()
);

-- Enable Row Level Security
alter table public.user_assessments enable row level security;

create policy "Users can view own assessments"
  on public.user_assessments for select
  using (auth.uid() = user_id);

create policy "Users can insert own assessments"
  on public.user_assessments for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own assessments"
  on public.user_assessments for delete
  using (auth.uid() = user_id);


-- 3. DAILY_ADHERENCE_LOGS TABLE
-- Tracks daily completion of the Oracle-generated regimen.
-- One row per user per calendar day (upserted on each task toggle).
create table if not exists public.daily_adherence_logs (
  id                    uuid default gen_random_uuid() primary key,
  user_id               uuid references public.profiles(id) on delete cascade not null,
  date                  date not null,
  tasks_total           integer not null default 0,
  tasks_completed       integer not null default 0,
  completion_percentage float   not null default 0.0,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),
  unique (user_id, date)
);

alter table public.daily_adherence_logs enable row level security;

create policy "Users can view own adherence logs"
  on public.daily_adherence_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert own adherence logs"
  on public.daily_adherence_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own adherence logs"
  on public.daily_adherence_logs for update
  using (auth.uid() = user_id);
