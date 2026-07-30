import type { AuthorRow } from "@/lib/db/queries";

// Deliberately free of the "server-only" sentinel (unlike lib/db/library.ts)
// so client components (bookshelf.tsx, library-button.tsx) can pull in the
// label map and shared types without dragging the DB layer into the browser
// bundle.

export type LibraryStatus = "want" | "reading" | "done";

export const LIBRARY_STATUS_LABELS: Record<LibraryStatus, string> = {
  want: "Хочу прочитать",
  reading: "Читаю",
  done: "Прочитано",
};

export type LibraryBookSummary = {
  id: string;
  title: string;
  alternateTitle: string | null;
  year: string | null;
  fileType: string;
  categoryId: string;
  categoryName: string | null;
  authors: AuthorRow[];
};

export type LibraryEntry = {
  itemId: string;
  status: LibraryStatus;
  note: string | null;
  updatedAt: string;
  document: LibraryBookSummary;
};
