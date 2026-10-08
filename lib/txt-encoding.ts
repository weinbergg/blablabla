/**
 * TXT из фонда приходят в UTF-8, Windows-1251 или KOI8-R.
 *
 * Правило: если UTF-8 собирается без символов замены — это UTF-8.
 * Иначе сравниваем 1251 и KOI8 по числу кириллицы. Нельзя скорить все
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
  return (
    count(sample, /[А-Яа-яЁё]/g) -
    count(sample, /\uFFFD/g) * 20 -
    count(sample, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) * 8
  );
}

export function decodeTxtBytes(buffer: ArrayBuffer): string {
  const utf8 = decode(buffer, "utf-8");
  if (!utf8.includes("\uFFFD")) return utf8;

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
