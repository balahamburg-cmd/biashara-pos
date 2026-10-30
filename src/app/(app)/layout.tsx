import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mpesaEnabled } from "@/lib/mpesa";
import { BizProvider } from "@/components/biz";
import { Shell } from "@/components/shell";
import type { Business, Member } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("members").select("*").eq("user_id", user.id).eq("active", true).maybeSingle();
  if (!me) redirect("/setup");
  const { data: business } = await supabase.from("businesses").select("*").eq("id", me.business_id).single();

  return (
    <BizProvider business={business as Business} me={me as Member} mpesa={mpesaEnabled()}>
      <Shell>{children}</Shell>
    </BizProvider>
  );
}
