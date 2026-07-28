import "server-only";

import { promises as fs } from "fs";
import path from "path";
import type { LibraryData, LibraryDocument } from "@/lib/types";

const dataPath = path.join(process.cwd(), "data", "library.json");
let mutationQueue = Promise.resolve();

export async function getLibrary(): Promise<LibraryData> {
  const contents = await fs.readFile(dataPath, "utf8");
  return JSON.parse(contents) as LibraryData;
}

async function writeLibrary(data: LibraryData) {
  const temporaryPath = `${dataPath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, dataPath);
}

export function updateLibrary(
  mutation: (data: LibraryData) => LibraryData | Promise<LibraryData>,
) {
  const operation = mutationQueue.then(async () => {
    const data = await getLibrary();
    const nextData = await mutation(data);
    await writeLibrary(nextData);
    return nextData;
  });

  mutationQueue = operation.then(
    () => undefined,
    () => undefined,
  );

  return operation;
}

export async function getDocument(id: string) {
  const data = await getLibrary();
  return data.documents.find((document) => document.id === id);
}

export async function saveDocument(document: LibraryDocument) {
  return updateLibrary((data) => {
    const existingIndex = data.documents.findIndex(
      (item) => item.id === document.id,
    );

    if (existingIndex === -1) {
      data.documents.unshift(document);
    } else {
      data.documents[existingIndex] = document;
    }

    return data;
  });
}

export async function removeDocument(id: string) {
  return updateLibrary((data) => ({
    ...data,
    documents: data.documents.filter((document) => document.id !== id),
  }));
}
