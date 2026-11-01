import "server-only";

import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { musicTracks } from "@/lib/db/schema";
import { isUploadedFile, type UploadedBlob } from "@/lib/community-files";

export const MUSIC_DIR = path.resolve(process.cwd(), "data", "music-uploads");
const MAX_BYTES = 18 * 1024 * 1024;

const ALLOWED: Record<string, string> = {
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  m4a: "audio/mp4",
};

export type MusicTrackRow = typeof musicTracks.$inferSelect;

function extensionOf(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext.replace(/[^a-z0-9]/g, "");
}

export async function listMusicTracks() {
  return db.select().from(musicTracks).orderBy(asc(musicTracks.createdAt));
}

export async function listApprovedMusic() {
  return db
    .select()
    .from(musicTracks)
    .where(eq(musicTracks.status, "approved"))
    .orderBy(asc(musicTracks.createdAt));
}

export async function getMusicTrack(id: string) {
  const [row] = await db.select().from(musicTracks).where(eq(musicTracks.id, id)).limit(1);
  return row ?? null;
}

export function musicFilePath(storedName: string) {
  const base = path.basename(storedName);
  const full = path.resolve(MUSIC_DIR, base);
  if (!full.startsWith(MUSIC_DIR + path.sep)) return null;
  return full;
}

export async function saveMusicUpload(input: {
  userId: string;
  title: string;
  composer: string;
  file: UploadedBlob;
}) {
  if (!isUploadedFile(input.file) || input.file.size <= 0) {
    throw new Error("Файл не передан");
  }
  if (input.file.size > MAX_BYTES) {
    throw new Error("Файл больше 18 МБ");
  }
  const ext = extensionOf(input.file.name);
  const mime = ALLOWED[ext];
  if (!mime) {
    throw new Error("Нужен файл mp3, ogg, wav или m4a");
  }
  const title = input.title.trim().slice(0, 160);
  if (!title) throw new Error("Нужно название");

  const id = randomUUID();
  const storedName = `${id}.${ext}`;
  await fs.mkdir(MUSIC_DIR, { recursive: true });
  const full = path.join(MUSIC_DIR, storedName);
  await fs.writeFile(full, Buffer.from(await input.file.arrayBuffer()));

  const composer = input.composer.trim().slice(0, 160) || null;
  try {
    await db.insert(musicTracks).values({
      id,
      title,
      composer,
      storedName,
      mime,
      status: "pending",
      uploadedBy: input.userId,
    });
  } catch (error) {
    await fs.unlink(full).catch(() => undefined);
    throw error;
  }
  return { id, title, composer, status: "pending" as const };
}

export async function setMusicStatus(id: string, status: "pending" | "approved" | "rejected") {
  const row = await getMusicTrack(id);
  if (!row) return null;
  await db.update(musicTracks).set({ status }).where(eq(musicTracks.id, id));
  return { ...row, status };
}

export async function deleteMusicTrack(id: string) {
  const row = await getMusicTrack(id);
  if (!row) return false;
  await db.delete(musicTracks).where(eq(musicTracks.id, id));
  const full = musicFilePath(row.storedName);
  if (full) await fs.unlink(full).catch(() => undefined);
  return true;
}
