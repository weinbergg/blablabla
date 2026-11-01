/** Naming for the generated annotated file; its format is chosen by the exporter. */
export function buildAnnotatedFileName(title: string, extension: string) {
  const ext = extension.replace(/^\./, "").toLowerCase();
  const cleanTitle = title
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .replace(/(?:\.(?:pdf|epub|txt|zip|djvu|fb2|mobi|docx?|rtf))+$/i, "")
    .trim();
  return `${cleanTitle || "Книга"} (с пометками).${ext}`;
}

/** Prefer the Unicode filename supplied by the server for a blob download. */
export function annotatedDownloadFileName(disposition: string | null) {
  const encoded = disposition?.match(/(?:^|;)\s*filename\*\s*=\s*UTF-8'[^']*'([^;]+)/i)?.[1];
  if (encoded) {
    try {
      const decoded = decodeURIComponent(encoded.trim());
      if (decoded) return decoded;
    } catch {
      // A malformed extended parameter can still have a usable ASCII fallback.
    }
  }
  const fallback = disposition?.match(/(?:^|;)\s*filename\s*=\s*(?:"([^"]+)"|([^;]+))/i);
  return fallback?.[1] || fallback?.[2]?.trim() || "Книга (с пометками).pdf";
}
