import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { isAdmin } from "@/lib/auth";
import { getLibrary } from "@/lib/library";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }

  const data = await getLibrary();

  return (
    <AdminDashboard
      documents={data.documents}
      categories={data.categories}
      subcategories={data.subcategories}
    />
  );
}
