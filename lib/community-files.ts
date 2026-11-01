import "server-only";

import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { and, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { communityAttachments } from "@/lib/db/schema";
import { sanitizeFilename } from "@/lib/sanitize-text";
import { contentDisposition } from "@/lib/file-serve";

export type AttachmentKind = "image" | "video" | "file";
export type AttachmentParent = "topic" | "post" | "channel_post" | "channel" | "seminar";

const ROOT = path.resolve(process.cwd(), "data", "community-uploads");

/** Node 18 has no global `File`. Undici still gives File-shaped form parts. */
export type UploadedBlob = {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export function isUploadedFile(value: unknown): value is UploadedBlob {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as UploadedBlob).arrayBuffer === "function" &&
    typeof (value as UploadedBlob).size === "number" &&
    typeof (value as UploadedBlob).name === "string"
  );
}

const BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  pdf: "application/pdf",
  txt: "text/plain",
  epub: "application/epub+zip",
  zip: "application/zip",
};

function mimeOf(file: UploadedBlob) {
  const declared = (file.type || "").toLowerCase();
  if (ALLOWED[declared]) return declared;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXT[ext] ?? declared;
}

const ALLOWED: Record<string, { kind: AttachmentKind; max: number; magic?: number[][] }> = {
  "image/jpeg": { kind: "image", max: 8 * 1024 * 1024, magic: [[0xff, 0xd8]] },
  "image/png": { kind: "image", max: 8 * 1024 * 1024, magic: [[0x89, 0x50, 0x4e, 0x47]] },
  "image/gif": { kind: "image", max: 4 * 1024 * 1024, magic: [[0x47, 0x49, 0x46]] },
  "image/webp": { kind: "image", max: 8 * 1024 * 1024 },
  "video/mp4": { kind: "video", max: 64 * 1024 * 1024 },
  "video/webm": { kind: "video", max: 64 * 1024 * 1024 },
  "application/pdf": { kind: "file", max: 20 * 1024 * 1024, magic: [[0x25, 0x50, 0x44, 0x46]] },
  "text/plain": { kind: "file", max: 2 * 1024 * 1024 },
  "application/epub+zip": { kind: "file", max: 20 * 1024 * 1024, magic: [[0x50, 0x4b]] },
  "application/zip": { kind: "file", max: 20 * 1024 * 1024, magic: [[0x50, 0x4b]] },
};

const DAY_CAP = 30;

function looksLike(bytes: Buffer, signatures: number[][]) {
  return signatures.some((sig) => sig.every((value, index) => bytes[index] === value));
}

function isWebp(bytes: Buffer) {
  return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

function isMp4(bytes: Buffer) {
  return bytes.toString("ascii", 4, 8) === "ftyp";
}

function isWebm(bytes: Buffer) {
  return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

export async function saveCommunityFile(options: {
  userId: string;
  file: UploadedBlob;
}) {
  const mime = mimeOf(options.file);
  const rule = ALLOWED[mime];
  if (!rule) {
    throw new Error("Этот тип файла не принимаем. Можно фото, видео, PDF, EPUB, TXT или ZIP.");
  }
  if (options.file.size > rule.max) {
    throw new Error("Файл слишком большой для этого типа.");
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [used] = await db
    .select({ n: sql<number>`count(*)` })
    .from(communityAttachments)
    .where(and(eq(communityAttachments.ownerId, options.userId), gte(communityAttachments.createdAt, since)));
  if (Number(used?.n ?? 0) >= DAY_CAP) {
    throw new Error("За сутки можно прикрепить не больше 30 файлов.");
  }

  const buffer = Buffer.from(await options.file.arrayBuffer());
  if (rule.magic && !looksLike(buffer, rule.magic)) {
    throw new Error("Содержимое файла не совпало с заявленным типом.");
  }
  if (mime === "image/webp" && !isWebp(buffer)) throw new Error("Это не WebP.");
  if (mime === "video/mp4" && !isMp4(buffer)) throw new Error("Это не MP4.");
  if (mime === "video/webm" && !isWebm(buffer)) throw new Error("Это не WebM.");
  // HTML, переименованный в картинку, часто начинается с «<».
  const head = buffer.subarray(0, 32).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<svg") || head.startsWith("<?xml")) {
    throw new Error("HTML и SVG не принимаем.");
  }

  await fs.mkdir(ROOT, { recursive: true });
  const id = randomUUID();
  const diskName = id;
  await fs.writeFile(path.join(ROOT, diskName), buffer, { flag: "wx" });

  await db.insert(communityAttachments).values({
    id,
    ownerId: options.userId,
    parentType: null,
    parentId: null,
    kind: rule.kind,
    mime,
    originalName: sanitizeFilename(options.file.name),
    diskName,
    size: buffer.length,
  });

  return {
    id,
    kind: rule.kind,
    mime,
    name: sanitizeFilename(options.file.name),
    size: buffer.length,
  };
}

export async function bindAttachments(options: {
  userId: string;
  ids: string[];
  parentType: AttachmentParent;
  parentId: string;
}) {
  const unique = [...new Set(options.ids)].slice(0, 8);
  for (const id of unique) {
    const [row] = await db
      .select()
      .from(communityAttachments)
      .where(eq(communityAttachments.id, id))
      .limit(1);
    if (!row || row.ownerId !== options.userId) continue;
    if (row.parentId && row.parentId !== options.parentId) continue;
    await db
      .update(communityAttachments)
      .set({ parentType: options.parentType, parentId: options.parentId })
      .where(eq(communityAttachments.id, id));
  }
}

export async function listAttachments(parentType: AttachmentParent, parentId: string) {
  return db
    .select({
      id: communityAttachments.id,
      kind: communityAttachments.kind,
      mime: communityAttachments.mime,
      name: communityAttachments.originalName,
      size: communityAttachments.size,
    })
    .from(communityAttachments)
    .where(and(eq(communityAttachments.parentType, parentType), eq(communityAttachments.parentId, parentId)));
}

export async function getOwnedAttachment(id: string) {
  const [row] = await db.select().from(communityAttachments).where(eq(communityAttachments.id, id)).limit(1);
  return row ?? null;
}

export function communityDiskPath(diskName: string) {
  const candidate = path.resolve(ROOT, diskName);
  if (candidate !== ROOT && !candidate.startsWith(`${ROOT}${path.sep}`)) return null;
  if (path.basename(candidate) !== diskName) return null;
  return candidate;
}

export function attachmentResponse(
  file: Buffer,
  row: { mime: string; originalName: string; kind: string },
  options: { download?: boolean } = {},
) {
  return new NextResponse(new Uint8Array(file), { headers: attachmentHeaders(row, options) });
}

export function attachmentHeaders(row: { mime: string; originalName: string; kind: string }, options: { download?: boolean } = {}) {
  const inline = !options.download && (row.kind === "image" || row.kind === "video");
  const filename = row.originalName.replace(/"/g, "");
  return {
      "Content-Type": row.mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'none'; script-src 'none'",
      "Cache-Control": "private, no-store",
      "Content-Disposition": contentDisposition(inline ? "inline" : "download", filename),
  };
}
