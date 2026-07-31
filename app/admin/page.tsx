import { redirect } from "next/navigation";
import { AdminDashboard, type AdminDocument } from "@/components/admin-dashboard";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { invites } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import {
  flattenCategoryOptions,
  getAllDocumentsForSearch,
  getAllSecondaryCategoryIdsByDoc,
  getCategoryTree,
  getFeedbackList,
  getGrowthSummary,
  getModerationFeed,
  getOpenReports,
  getReferralStats,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const [
    tree,
    allDocuments,
    inviteRows,
    moderationFeed,
    openReports,
    referralStats,
    growthSummary,
    feedbackList,
    secondaryCategoryIdsByDoc,
  ] = await Promise.all([
    getCategoryTree(),
    getAllDocumentsForSearch(),
    db.select().from(invites).orderBy(desc(invites.createdAt)),
    getModerationFeed(),
    getOpenReports(),
    getReferralStats(),
    getGrowthSummary(),
    getFeedbackList(),
    getAllSecondaryCategoryIdsByDoc(),
  ]);

  const categoryById = new Map<string, string>();
  const walk = (nodes: typeof tree) => {
    for (const node of nodes) {
      categoryById.set(node.id, node.name);
      walk(node.children);
    }
  };
  walk(tree);

  const documents: AdminDocument[] = allDocuments.map((doc) => ({
    id: doc.id,
    title: doc.title,
    authorNames: doc.authors.map((a) => a.name).join(", "),
    subjectNames: doc.subjects.map((s) => s.name).join(", "),
    tagNames: doc.tags.map((t) => t.name).join(", "),
    categoryId: doc.categoryId,
    categoryName: categoryById.get(doc.categoryId) ?? "",
    secondaryCategoryIds: secondaryCategoryIdsByDoc.get(doc.id) ?? [],
    fileType: doc.fileType,
    confidence: doc.confidence,
    language: doc.language ?? "",
    secondaryLanguage: doc.secondaryLanguage ?? "",
  }));

  return (
    <AdminDashboard
      documents={documents}
      categoryOptions={flattenCategoryOptions(tree)}
      categoryTree={tree}
      invites={inviteRows.map((invite) => ({
        id: invite.id,
        code: invite.code,
        email: invite.email,
        note: invite.note,
        usedBy: invite.usedBy,
        createdAt: invite.createdAt,
        multiUse: Boolean(invite.multiUse),
        useCount: invite.useCount,
      }))}
      moderationFeed={moderationFeed}
      openReports={openReports}
      referralStats={referralStats}
      growthSummary={growthSummary}
      feedbackList={feedbackList.map((item) => ({
        ...item,
        authorName: item.authorName ?? item.name ?? "Аноним",
      }))}
    />
  );
}
