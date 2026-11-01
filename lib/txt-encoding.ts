/**
 * TXT из фонда приходят в UTF-8, Windows-1251 или KOI8-R.
 *
 * Правило: если UTF-8 собирается без символов замены — это UTF-8.
 * BOM задаёт UTF-16 явно. Иначе сравниваем 1251 и KOI8 по кириллице и
 * частотности русских букв. Нельзя скорить все
 * кодировки одинаково: байты UTF-8 русского текста в 1251 тоже выглядят
 * «кириллицей», только по две штуки на букву.
 */

function count(text: string, pattern: RegExp) {
  return (text.match(pattern) || []).length;
}

function decode(buffer: ArrayBuffer, encoding: string) {
  let text = new TextDecoder(encoding, { fatal: false }).decode(buffer);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

function cyrillicScore(text: string) {
  const sample = text.slice(0, 12_000);
  // Both legacy encodings map most Russian bytes to Cyrillic, so counting
  // letters alone ties and silently picks 1251 for KOI8-R books. Frequency
  // and unexpected capitals inside words help distinguish ordinary prose.
  const letters = "оеаинтсрвлкмдпуыяьгзбчйхжшюцщэфъё";
  let frequency = 0;
  for (const char of sample.toLowerCase()) {
    const rank = letters.indexOf(char);
    if (rank >= 0) frequency += (letters.length - rank) / letters.length;
  }
  return (
    count(sample, /[А-Яа-яЁё]/g) -
    count(sample, /\uFFFD/g) * 20 -
    count(sample, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) * 8 +
    frequency -
    count(sample, /[а-яё][А-ЯЁ]/g) * 2
  );
}

export function decodeTxtBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return decode(buffer, "utf-16le");
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return decode(buffer, "utf-16be");

  try {
    // A literal U+FFFD is valid UTF-8 and must not trigger legacy detection.
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    // Invalid UTF-8: try the legacy encodings used in the library.
  }

  const utf8 = decode(buffer, "utf-8");
  let best = utf8;
  let bestScore = cyrillicScore(utf8);
  for (const encoding of ["windows-1251", "koi8-r"] as const) {
    try {
      const text = decode(buffer, encoding);
      const score = cyrillicScore(text);
      if (score > bestScore) {
        best = text;
        bestScore = score;
      }
    } catch {
      /* Node без этой кодировки в ICU */
    }
  }
  return best;
}
