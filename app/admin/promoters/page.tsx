import { AdminLoginForm } from "@/components/AdminLoginForm";
import { AdminPromotersDashboard } from "@/components/AdminPromotersDashboard";
import { isAdminPageAuthenticated } from "@/lib/admin/auth";

export const metadata = {
  title: "Admin Promoters | CAMO Fighter Application Helper"
};

export default function AdminPromotersPage() {
  return isAdminPageAuthenticated() ? <AdminPromotersDashboard /> : <AdminLoginForm />;
}
