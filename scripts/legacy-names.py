#!/usr/bin/env python3
"""Archive filenames in legacy Russian encodings.

Zips made by Windows Explorer / WinRAR store names in the OEM or ANSI
codepage without the UTF-8 flag. `unzip` then writes those raw bytes as the
filename: on Linux the name is undecodable (Node's readdir hands back U+FFFD
and every later stat() misses the file), on macOS the write fails outright.
Either way the books silently disappear from an import.

Two subcommands:
  unzip <archive> <dest>  extract a zip, decoding each name properly
  fix <dir>               rename already-extracted files with broken names
                          (covers tar/7z/rar, which have the same problem)
"""
import os
import sys
import unicodedata
import zipfile

CANDIDATE_ENCODINGS = ("utf-8", "cp866", "cp1251", "cp1252")

# Mojibake giveaways: Cyrillic letters no Russian filename uses (Ђ Ѓ Ґ Ў Є Ј …).
RARE_CYRILLIC = set(range(0x0400, 0x0410)) | set(range(0x0450, 0x0460)) | set(range(0x0480, 0x0500))
RARE_CYRILLIC -= {0x0401, 0x0451}  # Ё/ё are normal
PLAIN_PUNCTUATION = set(" ._-()[]{}',+&!#№")


def score(name: str) -> int:
    """How much this decoding looks like a filename a human typed."""
    total = 0
    for ch in name:
        code = ord(ch)
        if ch.isdigit() or ("a" <= ch.lower() <= "z") or ch in PLAIN_PUNCTUATION or ch == "/":
            total += 1
        elif code in RARE_CYRILLIC:
            total -= 6
        elif 0x0410 <= code <= 0x044F or code in (0x0401, 0x0451):
            total += 3 if ch.islower() else 2
        elif unicodedata.category(ch) in ("Lu", "Ll"):
            total += 1
        else:
            total -= 5
    return total


def decode_name(raw: bytes) -> str:
    best, best_score = raw.decode("utf-8", errors="replace"), -10**9
    for encoding in CANDIDATE_ENCODINGS:
        try:
            candidate = raw.decode(encoding)
        except (UnicodeDecodeError, LookupError):
            continue
        value = score(candidate)
        if value > best_score:
            best, best_score = candidate, value
    return best


def safe_parts(name: str):
    """Drop absolute paths and .. segments (zip slip)."""
    parts = [p for p in name.replace("\\", "/").split("/") if p not in ("", ".", "..")]
    return parts


def cmd_unzip(archive: str, dest: str) -> int:
    written = 0
    with zipfile.ZipFile(archive) as zf:
        for info in zf.infolist():
            if info.flag_bits & 0x800:
                name = info.filename
            else:
                # zipfile decodes flagless names as cp437, which round-trips
                # every byte, so this recovers the original bytes exactly.
                name = decode_name(info.filename.encode("cp437", errors="replace"))
            parts = safe_parts(name)
            if not parts:
                continue
            target = os.path.join(dest, *parts)
            if info.is_dir() or name.endswith("/"):
                os.makedirs(target, exist_ok=True)
                continue
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with zf.open(info) as source, open(target, "wb") as out:
                while True:
                    chunk = source.read(1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
            written += 1
    print(f"extracted {written}")
    return 0


def cmd_fix(root: str) -> int:
    renamed = 0
    for dirpath, dirnames, filenames in os.walk(os.fsencode(root), topdown=False):
        for raw_name in list(dirnames) + list(filenames):
            try:
                raw_name.decode("utf-8")
                continue  # already valid UTF-8, leave it alone
            except UnicodeDecodeError:
                pass
            fixed = decode_name(raw_name)
            source = os.path.join(dirpath, raw_name)
            target = os.path.join(dirpath, os.fsencode(fixed))
            if source == target or os.path.exists(target):
                continue
            os.rename(source, target)
            renamed += 1
    print(f"renamed {renamed}")
    return 0


def main() -> int:
    if len(sys.argv) >= 4 and sys.argv[1] == "unzip":
        return cmd_unzip(sys.argv[2], sys.argv[3])
    if len(sys.argv) >= 3 and sys.argv[1] == "fix":
        return cmd_fix(sys.argv[2])
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
