import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  ensureUncategorizedCategory,
  extractArchive,
  importFromDirectory,
  isArchiveFile,
} from "@/lib/bulk-import";
import { discardStagedUpload, resolveStagedUpload } from "@/lib/staged-upload";

export const maxDuration = 3600;

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as File).arrayBuffer === "function" &&
    typeof (value as File).size === "number" &&
    typeof (value as File).name === "string"
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Требуется вход администратора" }, { status: 401 });
  }

  const formData = await request.formData();
  const defaultCategoryId =
    (formData.get("defaultCategoryId") as string | null)?.trim() || (await ensureUncategorizedCategory());
  const sourcePath = (formData.get("sourcePath") as string | null)?.trim();
  const archive = formData.get("archive");
  const archiveToken = (formData.get("archiveToken") as string | null)?.trim() ?? "";
  const staged = archiveToken ? await resolveStagedUpload(archiveToken) : null;
  if (archiveToken && !staged) {
    return NextResponse.json(
      { error: "Загруженный архив не найден на сервере — загрузите его заново." },
      { status: 400 },
    );
  }

  const workDir = path.join(os.tmpdir(), `bulk-import-${randomUUID()}`);
  let cleanupWorkDir = false;

  try {
    let importDir: string;
    let sourceLabel: string;

    if (staged) {
      // Already on disk (streamed by /api/uploads/stage), so nothing here ever
      // holds a multi-hundred-megabyte archive in memory.
      await fs.mkdir(workDir, { recursive: true });
      cleanupWorkDir = true;
      const extractDir = path.join(workDir, "extracted");
      await extractArchive(staged.path, extractDir);
      importDir = extractDir;
      sourceLabel = `архив ${staged.name}`;
    } else if (isUploadedFile(archive) && archive.size > 0) {
      await fs.mkdir(workDir, { recursive: true });
      cleanupWorkDir = true;
      const archivePath = path.join(workDir, archive.name);
      await fs.writeFile(archivePath, Buffer.from(await archive.arrayBuffer()));
      const extractDir = path.join(workDir, "extracted");
      await extractArchive(archivePath, extractDir);
      importDir = extractDir;
      sourceLabel = `архив ${archive.name}`;
    } else if (sourcePath) {
      const stat = await fs.stat(sourcePath).catch(() => null);
      if (!stat) {
        return NextResponse.json({ error: `Путь не найден на сервере: ${sourcePath}` }, { status: 400 });
      }
      if (stat.isDirectory()) {
        importDir = sourcePath;
        sourceLabel = `папка ${path.basename(sourcePath)}`;
      } else if (isArchiveFile(sourcePath)) {
        await fs.mkdir(workDir, { recursive: true });
        cleanupWorkDir = true;
        const extractDir = path.join(workDir, "extracted");
        await extractArchive(sourcePath, extractDir);
        importDir = extractDir;
        sourceLabel = `архив ${path.basename(sourcePath)}`;
      } else {
        return NextResponse.json({ error: "Указанный путь — не папка и не поддерживаемый архив." }, { status: 400 });
      }
    } else {
      return NextResponse.json(
        { error: "Загрузите архив или укажите путь к папке/архиву на сервере." },
        { status: 400 },
      );
    }

    const result = await importFromDirectory(importDir, {
      defaultCategoryId,
      sourceLabel,
      createdBy: user.id,
      confidence: "low",
    });

    revalidatePath("/");
    revalidatePath("/admin");
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось выполнить импорт." },
      { status: 400 },
    );
  } finally {
    if (cleanupWorkDir) {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
    if (archiveToken) await discardStagedUpload(archiveToken);
  }
}
