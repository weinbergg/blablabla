import Link from "next/link";
import { ArrowLeft, ArrowDownToLine, History } from "lucide-react";
import { notFound } from "next/navigation";
import { Header } from "@/components/header";
import { DocumentWorkspace } from "@/components/document-workspace";
import { DocumentEditForm } from "@/components/document-edit-form";
import { LibraryButton } from "@/components/library-button";
import { RateReviewPanel, StarRating } from "@/components/rate-review";
import { getCurrentUser } from "@/lib/auth";
import { getLibraryStatusForDocument, getPublicReviews, getRatingSummary } from "@/lib/db/library";
import {
  flattenCategoryOptions,
  getCategoryTrail,
  getCategoryTree,
  getDocumentAnnotations,
  getDocumentById,
  getDocumentComments,
  getDocumentEditHistory,
} from "@/lib/db/queries";
import { languageLabel } from "@/lib/languages";

export const dynamic = "force-dynamic";

const FIELD_LABELS: Record<string, string> = {
  title: "Название",
  alternateTitle: "Альтернативное название",
  year: "Год",
  description: "Описание",
  categoryId: "Раздел",
  pages: "Страниц",
  file: "Файл",
  language: "Язык",
  secondaryLanguage: "Второй язык (билингва)",
};

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const document = await getDocumentById(id);
  if (!document) notFound();

  const currentUser = await getCurrentUser();

  const [trail, comments, history, tree, annotations, libraryItem, ratingSummary, publicReviews] = await Promise.all([
    getCategoryTrail(document.categoryId),
    getDocumentComments(document.id),
    getDocumentEditHistory(document.id),
    getCategoryTree(),
    getDocumentAnnotations(document.id, currentUser?.id ?? null),
    currentUser ? getLibraryStatusForDocument(currentUser.id, document.id) : Promise.resolve(null),
    getRatingSummary(document.id),
    getPublicReviews(document.id, currentUser?.id ?? null),
  ]);

  const authorNames = document.authors.map((a) => a.name).join(", ");
  const categoryOptions = flattenCategoryOptions(tree);

  function pathForCategoryId(id: string, nodes = tree, trailSoFar: string[] = []): string[] | null {
    for (const node of nodes) {
      const nextTrail = [...trailSoFar, node.slug];
      if (node.id === id) return nextTrail;
      const found = pathForCategoryId(id, node.children, nextTrail);
      if (found) return found;
    }
    return null;
  }

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <Link
          href={`/catalog/${trail.map((t) => t.slug).join("/")}`}
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />
          {trail[trail.length - 1]?.name}
        </Link>

        <nav className="mb-6 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {trail.map((item, index) => (
            <span key={item.id} className="flex items-center gap-1.5">
              {index > 0 && <span>/</span>}
              <Link
                href={`/catalog/${trail.slice(0, index + 1).map((t) => t.slug).join("/")}`}
                className="hover:text-ink"
              >
                {item.name}
              </Link>
            </span>
          ))}
        </nav>

        <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <h1 className="font-serif text-4xl leading-tight tracking-tight md:text-5xl">
              {document.title}
            </h1>
            {document.alternateTitle && (
              <p className="mt-1 text-lg italic text-muted">{document.alternateTitle}</p>
            )}
            <p className="mt-3 text-base text-muted">
              {authorNames || "Автор не указан"}
              {document.year ? `, ${document.year}` : ""}
            </p>
            {ratingSummary.count > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <StarRating value={ratingSummary.average} />
                <span className="text-xs text-muted">
                  {ratingSummary.average.toFixed(1)} · {ratingSummary.count}{" "}
                  {ratingSummary.count === 1 ? "оценка" : "оценок"}
                </span>
              </div>
            )}
            {document.subjects.length > 0 && (
              <p className="mt-1 text-sm text-muted">О ком: {document.subjects.map((s) => s.name).join(", ")}</p>
            )}
            {document.description && (
              <p className="mt-4 max-w-xl text-sm leading-6 text-muted">
                {document.description}
              </p>
            )}
            {document.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {document.tags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={`/tags/${tag.slug}`}
                    className="rounded-full border border-ink/15 px-3 py-1 text-xs text-muted transition-colors hover:border-rust hover:text-rust"
                  >
                    {tag.name}
                  </Link>
                ))}
              </div>
            )}
            {document.secondaryCategories.length > 0 && (
              <p className="mt-4 text-xs text-muted">
                Также в разделах:{" "}
                {document.secondaryCategories.map((category, index) => (
                  <span key={category.id}>
                    {index > 0 && ", "}
                    <Link
                      href={`/catalog/${(pathForCategoryId(category.id) ?? [category.slug]).join("/")}`}
                      className="text-ink underline underline-offset-2 hover:text-rust"
                    >
                      {category.name}
                    </Link>
                  </span>
                ))}
              </p>
            )}
            <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted">
              {document.fileType}
              {document.originalFormat ? ` · исходно ${document.originalFormat}` : ""}
              {document.pages ? ` · ${document.pages} стр.` : ""}
              {document.language
                ? ` · ${languageLabel(document.language)}${
                    document.secondaryLanguage ? ` / ${languageLabel(document.secondaryLanguage)}` : ""
                  }`
                : ""}
            </p>
            {document.sourceNote && (
              <p className="mt-2 text-xs text-muted">Примечание: {document.sourceNote}</p>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-start gap-3 md:items-end">
            {currentUser && (
              <LibraryButton documentId={document.id} initialStatus={libraryItem?.status ?? null} />
            )}
            {currentUser && libraryItem && (
              <RateReviewPanel
                documentId={document.id}
                status={libraryItem.status}
                initialRating={libraryItem.rating}
                initialReview={libraryItem.reviewBody}
              />
            )}
            {document.fileUrl && (
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={document.fileUrl}
                  download={document.fileName || undefined}
                  className="button-primary"
                >
                  <ArrowDownToLine size={15} />
                  Скачать
                </a>
                {document.fileType === "PDF" && annotations.length > 0 && (
                  <a
                    href={`/api/documents/${document.id}/download-annotated`}
                    className="button-secondary"
                    title="Скачать PDF с отмеченными страницами и списком пометок"
                  >
                    С пометками
                  </a>
                )}
              </div>
            )}
            {currentUser && (
              <DocumentEditForm
                documentId={document.id}
                categoryOptions={categoryOptions}
                initial={{
                  title: document.title,
                  alternateTitle: document.alternateTitle ?? "",
                  authors: authorNames,
                  subjects: document.subjects.map((s) => s.name).join(", "),
                  year: document.year ?? "",
                  description: document.description ?? "",
                  categoryId: document.categoryId,
                  secondaryCategoryIds: document.secondaryCategories.map((c) => c.id),
                  pages: document.pages ? String(document.pages) : "",
                  tags: document.tags.map((tag) => tag.name).join(", "),
                  language: document.language ?? "",
                  secondaryLanguage: document.secondaryLanguage ?? "",
                }}
              />
            )}
          </div>
        </div>

        <DocumentWorkspace
          documentId={document.id}
          fileUrl={document.fileUrl}
          fileType={document.fileType}
          comments={comments}
          annotations={annotations}
          currentUser={currentUser}
        />

        {publicReviews.length > 0 && (
          <section className="mt-12 rounded-2xl border border-ink/10 p-5">
            <p className="mb-4 flex items-center gap-2 text-sm font-medium">
              Отзывы читателей ({publicReviews.length})
            </p>
            <ul className="space-y-4">
              {publicReviews.map((review) => (
                <li key={review.itemId} className="border-t border-ink/10 pt-4 first:border-t-0 first:pt-0">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <Link
                      href={`/users/${review.userId}`}
                      className="text-sm font-medium hover:text-rust"
                    >
                      {review.userName}
                    </Link>
                    {review.rating && <StarRating value={review.rating} size={12} />}
                  </div>
                  {review.reviewBody && (
                    <p className="text-sm leading-6 text-muted">{review.reviewBody}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {history.length > 0 && (
          <details className="mt-12 rounded-2xl border border-ink/10 p-5">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <History size={15} />
              История правок ({history.length})
            </summary>
            <ul className="mt-4 space-y-2 text-xs text-muted">
              {history.map((edit) => (
                <li key={edit.id}>
                  <span className="font-medium text-ink">{edit.editorName ?? "Кто-то"}</span>{" "}
                  изменил «{FIELD_LABELS[edit.field] ?? edit.field}»:{" "}
                  <span className="line-through">{edit.oldValue || "—"}</span>{" "}
                  → <span className="text-ink">{edit.newValue || "—"}</span>{" "}
                  <span>({new Date(edit.createdAt).toLocaleString("ru-RU")})</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </main>
    </>
  );
}
