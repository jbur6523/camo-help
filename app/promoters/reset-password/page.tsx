import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reset Promoter Password | CAMO Fighter Application Helper"
};

export default async function ResetPromoterPasswordPage() {
  const supabase = await createSupabaseAuthServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    redirect("/promoters/login?error=reset-link");
  }
  return <ResetPasswordForm />;
}
