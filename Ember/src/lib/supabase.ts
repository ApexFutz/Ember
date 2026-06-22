import { createClient } from '@supabase/supabase-js'

// The app ships with a shared, public Supabase project as defaults so anyone can
// clone the repo and run it with zero backend setup. These values are safe to
// commit: the publishable (anon) key is designed to be exposed in the browser,
// and all data access is gated by row-level security. To run against your own
// Supabase project instead, set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in a
// .env file (see .env.example). Never put the service_role key here.
const DEFAULT_SUPABASE_URL = 'https://vfcetqmbghkrlqmmtrkb.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_nyXXw0X0oy-LUwKSODSyow_5kTBSC6u'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)