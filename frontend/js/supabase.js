import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
export const configured = SUPABASE_URL && !SUPABASE_URL.includes('TU-PROYECTO') && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('TU_CLAVE');
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
