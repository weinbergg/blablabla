#!/usr/bin/env bash
# Download Homer / antiquity / German classics into import-staging on the VPS.
# Run ON THE SERVER (Termius), not on your Mac:
#
#   cd /var/www/blabla
#   git pull origin main
#   bash deploy/download-antiquity.sh
#   npx tsx scripts/bulk-import.ts import-staging --create-top-level --label "Античность+DE 2026-08-01"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGING="${ROOT}/import-staging"
mkdir -p \
  "${STAGING}/Античность/Гомер" \
  "${STAGING}/Античность/Платон" \
  "${STAGING}/Античность/Аристотель" \
  "${STAGING}/Античность/Вергилий" \
  "${STAGING}/Немецкий идеализм"

dl() {
  local out="$1" url="$2"
  echo "==> ${out}"
  curl -fsSL --retry 3 --retry-delay 2 -o "${out}.partial" "${url}"
  mv "${out}.partial" "${out}"
  ls -lh "${out}"
}

HOMER="${STAGING}/Античность/Гомер"
dl "${HOMER}/Homer - The Iliad (Butler).epub" "https://www.gutenberg.org/ebooks/2199.epub.noimages"
dl "${HOMER}/Homer - The Odyssey (Butler).epub" "https://www.gutenberg.org/ebooks/1727.epub.noimages"
dl "${HOMER}/Homer - The Iliad (Pope).epub" "https://www.gutenberg.org/ebooks/6130.epub.noimages"

dl "${HOMER}/Homer - Илиада (пер. Гнедич).epub" \
  "https://ws-export.wmcloud.org/?lang=ru&page=%D0%98%D0%BB%D0%B8%D0%B0%D0%B4%D0%B0_(%D0%93%D0%BE%D0%BC%D0%B5%D1%80%2F%D0%93%D0%BD%D0%B5%D0%B4%D0%B8%D1%87)&format=epub"
dl "${HOMER}/Homer - Одиссея (пер. Жуковский).epub" \
  "https://ws-export.wmcloud.org/?lang=ru&page=%D0%9E%D0%B4%D0%B8%D1%81%D1%81%D0%B5%D1%8F_(%D0%93%D0%BE%D0%BC%D0%B5%D1%80%2F%D0%96%D1%83%D0%BA%D0%BE%D0%B2%D1%81%D0%BA%D0%B8%D0%B9)&format=epub"

# Continuous Ancient Greek (Perseus TEI → plain text)
python3 - <<'PY'
import re, pathlib, urllib.request

def fetch(url: str) -> str:
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read().decode("utf-8", errors="replace")

def tei_to_txt(xml: str, title: str) -> str:
    raw = re.sub(r"<note[\s\S]*?</note>", "", xml)
    raw = re.sub(r"<bibl[\s\S]*?</bibl>", "", raw)
    raw = re.sub(r"</l\s*>", "\n", raw)
    raw = re.sub(r'<div[^>]*type="textpart"[^>]*n="(\d+)"[^>]*>', r"\n\n=== Book \1 ===\n\n", raw)
    text = re.sub(r"<[^>]+>", "", raw)
    for a, b in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"')):
        text = text.replace(a, b)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return f"{title}\n\n{text}\n"

base = "https://raw.githubusercontent.com/PerseusDL/canonical-greekLit/master/data/tlg0012"
out_dir = pathlib.Path("import-staging/Античность/Гомер")
iliad = tei_to_txt(
    fetch(f"{base}/tlg001/tlg0012.tlg001.perseus-grc2.xml"),
    "Ὅμηρος · Ἰλιάς\n(Ancient Greek text, Perseus / Open Greek and Latin)",
)
odyssey = tei_to_txt(
    fetch(f"{base}/tlg002/tlg0012.tlg002.perseus-grc2.xml"),
    "Ὅμηρος · Ὀδύσσεια\n(Ancient Greek text, Perseus / Open Greek and Latin)",
)
(out_dir / "Homer - Iliad (Ancient Greek, Perseus text).txt").write_text(iliad, encoding="utf-8")
(out_dir / "Homer - Odyssey (Ancient Greek, Perseus text).txt").write_text(odyssey, encoding="utf-8")
print("Greek Iliad/Odyssey TXT written")
PY

dl "${STAGING}/Античность/Платон/Plato - The Republic (Jowett).epub" "https://www.gutenberg.org/ebooks/1497.epub.noimages"
dl "${STAGING}/Античность/Аристотель/Aristotle - Nicomachean Ethics.epub" "https://www.gutenberg.org/ebooks/8438.epub.noimages"
dl "${STAGING}/Античность/Вергилий/Virgil - The Aeneid (Dryden).epub" "https://www.gutenberg.org/ebooks/228.epub.noimages"

DE="${STAGING}/Немецкий идеализм"
dl "${DE}/Immanuel Kant - Kritik der reinen Vernunft (1781).epub" "https://www.gutenberg.org/ebooks/6342.epub.noimages"
dl "${DE}/Immanuel Kant - Kritik der praktischen Vernunft.epub" "https://www.gutenberg.org/ebooks/49543.epub.noimages"
dl "${DE}/Friedrich Nietzsche - Jenseits von Gut und Bose.epub" "https://www.gutenberg.org/ebooks/7204.epub.noimages"
dl "${DE}/Friedrich Nietzsche - Also sprach Zarathustra.epub" "https://www.gutenberg.org/ebooks/7205.epub.noimages"
dl "${DE}/Georg Wilhelm Friedrich Hegel - Phanomenologie des Geistes.epub" "https://www.gutenberg.org/ebooks/6698.epub.noimages"
dl "${DE}/Johann Wolfgang von Goethe - Faust.epub" "https://www.gutenberg.org/ebooks/2229.epub.noimages"

echo
echo "Done. Staging tree:"
find "${STAGING}/Античность" "${STAGING}/Немецкий идеализм" -type f | sort
du -sh "${STAGING}/Античность" "${STAGING}/Немецкий идеализм"
echo
echo "Next:"
echo "  npx tsx scripts/bulk-import.ts import-staging --create-top-level --label \"Античность+DE 2026-08-01\""
