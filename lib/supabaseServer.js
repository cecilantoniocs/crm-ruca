import { createClient } from '@supabase/supabase-js';

export const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE, // solo servidor
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false, // <- evita timers en lambda
    },
    // fetch: ... si usas proxy o custom fetch, aquí
  }
);
