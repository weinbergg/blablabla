import Link from "next/link";
import { ArrowLeft, ArrowDownToLine, History } from "lucide-react";
import { notFound } from "next/navigation";
import { Header } from "@/components/header";
import { DocumentWorkspace } from "@/components/document-workspace";
import { DocumentEditForm } from "@/components/document-edit-form";
import { getCurrentUser } from "@/lib/auth";
import {
  flattenCategoryOptions,
  getCategoryTrail,
  getCategoryTree,
  getDocumentAnnotations,
  getDocumentById,
  getDocumentComments,
  getDocumentEditHistory,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const FIELD_LABELS: Record<string, string> = {
  title: "Название",
  alternateTitle: "Альтернативное название",
  year: "Год",
  description: "Описание",
  categoryId: "Раздел",
  pages: "Страниц",
  file: "Файл",
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

  const [trail, comments, history, tree, annotations] = await Promise.all([
    getCategoryTrail(document.categoryId),
    getDocumentComments(document.id),
    getDocumentEditHistory(document.id),
    getCategoryTree(),
    getDocumentAnnotations(document.id, currentUser?.id ?? null),
  ]);

  const authorNames = document.authors.map((a) => a.name).join(", ");
  const categoryOptions = flattenCategoryOptions(tree);

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
            <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted">
              {document.fileType}
              {document.originalFormat ? ` · исходно ${document.originalFormat}` : ""}
              {document.pages ? ` · ${document.pages} стр.` : ""}
            </p>
            {document.sourceNote && (
              <p className="mt-2 text-xs text-muted">Примечание: {document.sourceNote}</p>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-start gap-3 md:items-end">
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
                  year: document.year ?? "",
                  description: document.description ?? "",
                  categoryId: document.categoryId,
                  pages: document.pages ? String(document.pages) : "",
                  tags: document.tags.map((tag) => tag.name).join(", "),
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
