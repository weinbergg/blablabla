import "server-only";

import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getLibrary } from "@/lib/library";
import type { LibraryDocument } from "@/lib/types";

const allowedExtensions = new Set([
  ".pdf",
  ".epub",
  ".mobi",
  ".djvu",
  ".txt",
  ".doc",
  ".docx",
]);
const maxFileSize = 25 * 1024 * 1024;

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function documentFromForm(
  formData: FormData,
  existing?: LibraryDocument,
) {
  const title = stringValue(formData, "title");
  const author = stringValue(formData, "author");
  const categoryId = stringValue(formData, "categoryId");
  const subcategoryId = stringValue(formData, "subcategoryId");

  if (!title || !author || !categoryId || !subcategoryId) {
    throw new Error("Заполните название, автора и раздел.");
  }

  const library = await getLibrary();
  const categoryExists = library.categories.some(
    (category) => category.id === categoryId,
  );
  const subcategoryExists = library.subcategories.some(
    (subcategory) =>
      subcategory.id === subcategoryId &&
      subcategory.categoryId === categoryId,
  );

  if (!categoryExists || !subcategoryExists) {
    throw new Error("Выбран некорректный раздел.");
  }

  const upload = formData.get("file");
  let fileUrl = existing?.fileUrl;
  let fileName = existing?.fileName;
  let fileType = existing?.fileType || "TEXT";
  let replacedFileUrl: string | undefined;

  if (upload instanceof File && upload.size > 0) {
    if (upload.size > maxFileSize) {
      throw new Error("Файл больше 25 МБ.");
    }

    const extension = path.extname(upload.name).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      throw new Error("Этот формат файла не поддерживается.");
    }

    const storedName = `${randomUUID()}${extension}`;
    const uploadDirectory = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadDirectory, { recursive: true });
    await fs.writeFile(
      path.join(uploadDirectory, storedName),
      Buffer.from(await upload.arrayBuffer()),
    );

    replacedFileUrl = existing?.fileUrl;
    fileUrl = `/uploads/${storedName}`;
    fileName = upload.name;
    fileType = extension.slice(1).toUpperCase();
  } else if (!existing?.fileUrl) {
    throw new Error("Выберите файл.");
  }

  const pagesValue = Number.parseInt(stringValue(formData, "pages"), 10);
  const now = new Date().toISOString();
  const document: LibraryDocument = {
    id: existing?.id || randomUUID(),
    title,
    author,
    year: stringValue(formData, "year") || undefined,
    description: stringValue(formData, "description") || undefined,
    categoryId,
    subcategoryId,
    fileUrl,
    fileName,
    fileType,
    pages: Number.isFinite(pagesValue) && pagesValue > 0 ? pagesValue : undefined,
    featured: existing?.featured,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  return { document, replacedFileUrl };
}

export async function deleteUploadedFile(fileUrl?: string) {
  if (!fileUrl?.startsWith("/uploads/")) return;

  const filePath = path.join(
    process.cwd(),
    "public",
    "uploads",
    path.basename(fileUrl),
  );
  await fs.unlink(filePath).catch(() => undefined);
}
