import "server-only";
import { createClient } from "@supabase/supabase-js";

// Bypasses row level security. Only for server routes, after checking the caller's role.
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
