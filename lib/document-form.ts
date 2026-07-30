import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { documentAuthors, documentEdits, documents, documentTags } from "@/lib/db/schema";
import { convertDjvuToPdf } from "@/lib/djvu";
import { getOrCreateAuthorsByNames } from "@/lib/db/authors";
import { getOrCreateTagsByNames } from "@/lib/db/tags";
import { buildDisplayFileName } from "@/lib/filenames";
import type { DocumentRow } from "@/lib/db/queries";

const allowedExtensions = new Set([
  ".pdf",
  ".epub",
  ".djvu",
  ".mobi",
  ".txt",
  ".doc",
  ".docx",
  ".rtf",
]);
const maxFileSize = 60 * 1024 * 1024;

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseAuthors(formData: FormData) {
  return stringValue(formData, "authors")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

function parseTags(formData: FormData) {
  return stringValue(formData, "tags")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * Duck-types a FormData file entry instead of `instanceof File` — Node 18
 * (used in local dev) has no global `File` constructor, but undici's
 * FormData still yields File-shaped objects for uploaded files.
 */
function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as File).arrayBuffer === "function" &&
    typeof (value as File).size === "number" &&
    typeof (value as File).name === "string"
  );
}

async function storeUpload(upload: File) {
  const extension = path.extname(upload.name).toLowerCase();
  if (!allowedExtensions.has(extension)) {
    throw new Error("Этот формат файла не поддерживается.");
  }
  if (upload.size > maxFileSize) {
    throw new Error("Файл больше 60 МБ.");
  }

  const isDjvu = extension === ".djvu";
  const storedExt = isDjvu ? ".pdf" : extension;
  const storedId = randomUUID();
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadDir, { recursive: true });
  const finalPath = path.join(uploadDir, `${storedId}${storedExt}`);

  if (isDjvu) {
    const tempPath = path.join(uploadDir, `${storedId}-source.djvu`);
    await fs.writeFile(tempPath, Buffer.from(await upload.arrayBuffer()));
    await convertDjvuToPdf(tempPath, finalPath);
    await fs.unlink(tempPath).catch(() => undefined);
  } else {
    await fs.writeFile(finalPath, Buffer.from(await upload.arrayBuffer()));
  }

  return {
    fileUrl: `/uploads/${storedId}${storedExt}`,
    fileType: storedExt.slice(1).toUpperCase(),
    originalFormat: isDjvu ? "DJVU" : null,
  };
}

async function removeUploadedFile(fileUrl?: string | null) {
  if (!fileUrl?.startsWith("/uploads/")) return;
  const filePath = path.join(process.cwd(), "public", fileUrl);
  await fs.unlink(filePath).catch(() => undefined);
}

async function setDocumentAuthors(documentId: string, authorNames: string[]) {
  await db.delete(documentAuthors).where(eq(documentAuthors.documentId, documentId));
  const authorIds = await getOrCreateAuthorsByNames(authorNames);
  for (const [position, authorId] of authorIds.entries()) {
    await db.insert(documentAuthors).values({ documentId, authorId, position });
  }
}

async function setDocumentTags(documentId: string, tagNames: string[]) {
  await db.delete(documentTags).where(eq(documentTags.documentId, documentId));
  const tagIds = await getOrCreateTagsByNames(tagNames);
  for (const tagId of tagIds) {
    await db.insert(documentTags).values({ documentId, tagId }).onConflictDoNothing();
  }
}

export async function createDocument(formData: FormData, userId: string) {
  const title = stringValue(formData, "title");
  const categoryId = stringValue(formData, "categoryId");
  if (!title || !categoryId) {
    throw new Error("Заполните название и раздел.");
  }

  const upload = formData.get("file");
  if (!isUploadedFile(upload) || upload.size === 0) {
    throw new Error("Выберите файл.");
  }

  const { fileUrl, fileType, originalFormat } = await storeUpload(upload);
  const pagesValue = Number.parseInt(stringValue(formData, "pages"), 10);
  const documentId = randomUUID();
  const authorNames = parseAuthors(formData);
  const fileName = buildDisplayFileName(title, authorNames, `.${fileType.toLowerCase()}`);

  await db.insert(documents).values({
    id: documentId,
    title,
    alternateTitle: stringValue(formData, "alternateTitle") || null,
    year: stringValue(formData, "year") || null,
    description: stringValue(formData, "description") || null,
    categoryId,
    fileUrl,
    fileName,
    fileType,
    originalFormat,
    pages: Number.isFinite(pagesValue) && pagesValue > 0 ? pagesValue : null,
    language: stringValue(formData, "language") || null,
    secondaryLanguage: stringValue(formData, "secondaryLanguage") || null,
    confidence: "confirmed",
    createdBy: userId,
  });

  await setDocumentAuthors(documentId, authorNames);
  await setDocumentTags(documentId, parseTags(formData));

  return documentId;
}

const editableFields = [
  "title",
  "alternateTitle",
  "year",
  "description",
  "categoryId",
  "language",
  "secondaryLanguage",
] as const;

export async function updateDocument(
  formData: FormData,
  existing: DocumentRow,
  userId: string,
) {
  const updates: Partial<typeof documents.$inferInsert> = {};

  for (const field of editableFields) {
    const raw = stringValue(formData, field);
    const nextValue = raw || null;
    const previousValue = existing[field] ?? null;
    if (nextValue !== previousValue) {
      updates[field] = nextValue as never;
      await db.insert(documentEdits).values({
        id: randomUUID(),
        documentId: existing.id,
        editorId: userId,
        field,
        oldValue: previousValue,
        newValue: nextValue,
      });
    }
  }

  const pagesRaw = stringValue(formData, "pages");
  if (pagesRaw) {
    const pagesValue = Number.parseInt(pagesRaw, 10);
    if (Number.isFinite(pagesValue) && pagesValue !== existing.pages) {
      updates.pages = pagesValue;
      await db.insert(documentEdits).values({
        id: randomUUID(),
        documentId: existing.id,
        editorId: userId,
        field: "pages",
        oldValue: existing.pages ? String(existing.pages) : null,
        newValue: String(pagesValue),
      });
    }
  }

  const authorsField = formData.get("authors");
  const authorNames = typeof authorsField === "string" ? parseAuthors(formData) : null;
  if (authorNames) {
    await setDocumentAuthors(existing.id, authorNames);
  }

  const tagsField = formData.get("tags");
  if (typeof tagsField === "string") {
    await setDocumentTags(existing.id, parseTags(formData));
  }

  const finalTitle = (updates.title as string | undefined) ?? existing.title;
  const upload = formData.get("file");
  if (isUploadedFile(upload) && upload.size > 0) {
    const { fileUrl, fileType, originalFormat } = await storeUpload(upload);
    await removeUploadedFile(existing.fileUrl);
    const displayName = buildDisplayFileName(
      finalTitle,
      authorNames ?? [],
      `.${fileType.toLowerCase()}`,
    );
    updates.fileUrl = fileUrl;
    updates.fileName = displayName;
    updates.fileType = fileType;
    updates.originalFormat = originalFormat;
    await db.insert(documentEdits).values({
      id: randomUUID(),
      documentId: existing.id,
      editorId: userId,
      field: "file",
      oldValue: existing.fileName,
      newValue: displayName,
    });
  } else if (existing.fileUrl && (updates.title || authorNames)) {
    // No new file, but the title/authors changed — keep the download name in sync.
    const extension = path.extname(existing.fileName || existing.fileUrl) || `.${existing.fileType.toLowerCase()}`;
    updates.fileName = buildDisplayFileName(finalTitle, authorNames ?? [], extension);
  }

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = new Date().toISOString();
    await db.update(documents).set(updates).where(eq(documents.id, existing.id));
  }
}

export async function deleteDocumentById(existing: DocumentRow) {
  await db.delete(documents).where(eq(documents.id, existing.id));
  await removeUploadedFile(existing.fileUrl);
}
