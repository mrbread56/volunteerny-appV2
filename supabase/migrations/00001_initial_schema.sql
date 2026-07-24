-- Supabase Migration: 00001_initial_schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: users (corresponds to Firebase 'users' collection)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid TEXT UNIQUE NOT NULL, -- Maps to Supabase Auth UID
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'organization', 'developer', 'admin')),
  two_factor_enabled BOOLEAN DEFAULT false,
  is_banned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: students (corresponds to Firebase 'students' collection)
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid TEXT UNIQUE NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  school TEXT,
  grade TEXT,
  neighborhood TEXT,
  interests TEXT[],
  skills TEXT[],
  contact_email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: organizations (corresponds to Firebase 'organizations' collection)
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid TEXT UNIQUE NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  organization_name TEXT NOT NULL,
  mission TEXT,
  contact_email TEXT,
  north_york_confirmed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: opportunities
CREATE TABLE IF NOT EXISTS public.opportunities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id TEXT NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  date TIMESTAMP,
  location TEXT,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: applications
CREATE TABLE IF NOT EXISTS public.applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Allow public read of organizations and opportunities
CREATE POLICY "Public can view active opportunities" ON public.opportunities FOR SELECT USING (true);
CREATE POLICY "Public can view organizations" ON public.organizations FOR SELECT USING (true);

-- Allow authenticated users to read their own user record
CREATE POLICY "Users can read own data" ON public.users FOR SELECT USING (auth.uid()::text = uid);
CREATE POLICY "Students can read own data" ON public.students FOR SELECT USING (auth.uid()::text = uid);
CREATE POLICY "Organizations can read own data" ON public.organizations FOR SELECT USING (auth.uid()::text = uid);

-- Allow insertions (during signup)
CREATE POLICY "Allow insertions during signup" ON public.users FOR INSERT WITH CHECK (auth.uid()::text = uid);
CREATE POLICY "Allow students insertions" ON public.students FOR INSERT WITH CHECK (auth.uid()::text = uid);
CREATE POLICY "Allow organizations insertions" ON public.organizations FOR INSERT WITH CHECK (auth.uid()::text = uid);

-- Allow organizations to insert/update their opportunities
CREATE POLICY "Orgs can manage their opportunities" ON public.opportunities FOR ALL USING (auth.uid()::text = organization_id);

-- Allow students to insert applications
CREATE POLICY "Students can apply" ON public.applications FOR INSERT WITH CHECK (auth.uid()::text = student_id);
-- Allow students to view their applications
CREATE POLICY "Students can view own applications" ON public.applications FOR SELECT USING (auth.uid()::text = student_id);
-- Allow organizations to view applications for their opportunities
CREATE POLICY "Orgs can view applications for their opps" ON public.applications FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.opportunities o 
    WHERE o.id = opportunity_id AND o.organization_id = auth.uid()::text
  )
);
