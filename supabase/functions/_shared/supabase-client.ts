import { createClient } from "jsr:@supabase/supabase-js@2";

export function createSupabaseClient(serviceRoleKey: string) {
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
      },
    },
  );

  return supabaseClient;
}
