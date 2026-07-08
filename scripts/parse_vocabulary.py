#!/usr/bin/env python3
"""Extract the primary vocabulary lists from the weekly course PDFs."""

from __future__ import annotations

import json
import re
import unicodedata
from collections import defaultdict
from csv import reader as csv_reader
from pathlib import Path

import pdfplumber


ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / "Word"
OUTPUT_FILE = ROOT / "data" / "vocabulary.json"

WEEKS = {
    1: {"pattern": "1.HAFTA*.pdf", "pages": 44, "count": 115},
    2: {"pattern": "2. HAFTA*.pdf", "pages": 40, "count": 145},
    3: {"pattern": "3.HAFTA*.pdf", "pages": 37, "count": 120},
    4: {"pattern": "4.HAFTA*.pdf", "pages": 29, "count": 120},
    5: {"pattern": "5.HAFTA*.pdf", "pages": 54, "count": 160},
}

ENTRY_RE = re.compile(r"^(\d+)\.\s*(.+?)\s*$")
EXAMPLE_RE = re.compile(r"^[•]?\s*(Sağlık|Sosyal|Fen)\s*:\s*(.*)$", re.I)
MEANING_RE = re.compile(r"^[•]?\s*Anlamı\s*:\s*(.*)$", re.I)
DOMAIN_MAP = {"sağlık": "health", "sosyal": "social", "fen": "science"}
STOP_MARKERS = ("EŞ ANLAMLI KELİMELER",)
TABLE_HEADER_RE = re.compile(r"^No\s+Kelime\s+Türkçe\s+Anlamı\s+Eş\s+Anlamlıları", re.I)
NUMBERED_SYNONYM_RE = re.compile(r"^(\d+)\.\s*(.+?)\s*:\s*(.+)$")
COLON_SYNONYM_RE = re.compile(r"^([^:]+?)\s*:\s*(.+)$")
SYNONYM_WORD_ALIASES = {
    "aimed at": "aim at",
    "coverly": "covertly",
    "forecasts": "forecast",
    "sanctions": "sanction",
}
TEXT_REDACTIONS = {
    "ommission": "omission",
    "Ommission": "Omission",
}
MANUAL_ENTRY_OVERRIDES = {
    (1, 23): {"meaning": "Yeterlilik, uzmanlık, beceri"},
    (2, 74): {"meaning": "Sevmek, tercih etmek; eğiliminde olmak"},
    (2, 28): {"meaning": "Müdahale etmek, engellemek"},
    (2, 91): {"meaning": "Aralıksız, durmak bilmeyen"},
    (3, 27): {"synonyms": ["constitute", "compose", "account for", "form"]},
    (3, 57): {"meaning": "Belirsizce, hayal meyal, belli belirsiz"},
    (3, 98): {"synonyms": ["Briefly", "for a short time", "provisionally"]},
    (4, 3): {"meaning": "Tutma / Muhafaza / Akılda tutma"},
    (4, 5): {"meaning": "Ölümcül / Son evre / Nihai"},
    (4, 7): {"meaning": "Dikkatsizce / İlgisizce"},
    (4, 8): {"meaning": "Binmek; iyi geçinmek/ilerlemek"},
    (4, 17): {"meaning": "Karışıklık / Dolanıklık / İç içe geçme"},
    (4, 33): {"meaning": "Sıkı / Katı bir şekilde"},
    (4, 43): {"meaning": "Güç, baskı veya çaba uygulamak; kendini zorlamak"},
    (4, 64): {"synonyms": ["Inseparably", "closely"]},
    (4, 66): {"meaning": "Örtük/zımni şekilde, dolaylı olarak"},
    (4, 70): {"meaning": "İkna edici şekilde / Güçlü biçimde"},
    (4, 76): {"meaning": "Daha düşük olma / Aşağılık duygusu"},
    (4, 90): {"meaning": "Azaltmak / Hafifletmek"},
    (4, 92): {"meaning": "Gizlice / Örtülü biçimde"},
    (4, 111): {"synonyms": ["Decrease", "decline", "diminish"]},
    (4, 112): {"synonyms": ["Display", "show", "demonstrate"]},
    (4, 113): {"synonyms": ["Divergence", "departure", "variation"]},
    (4, 114): {"synonyms": ["Postpone", "delay", "defer"]},
    (4, 115): {"synonyms": ["Reserve", "put aside", "annul"]},
    (4, 116): {"synonyms": ["Widespread", "omnipresent", "prevalent"]},
    (4, 117): {"synonyms": ["Disappear gradually", "diminish", "vanish"]},
    (4, 118): {"synonyms": ["Shockingly", "terribly", "horribly"]},
    (4, 120): {"synonyms": ["Pacify", "soothe", "calm"]},
    (5, 83): {"meaning": "İkna yöntemleri; inançlar/görüşler"},
    (5, 145): {
        "meaning": "Ürün/sonuç vermek, sağlamak; teslim olmak/boyun eğmek",
        "synonyms": ["Produce", "generate", "Succumb", "surrender"],
    },
    (5, 148): {"synonyms": ["Obstruct", "impede", "meddle with"]},
}


def clean(value: str) -> str:
    value = unicodedata.normalize("NFC", value)
    value = value.replace("\u00ad", "").replace("\u2028", " ")
    return re.sub(r"\s+", " ", value).strip()


def redact_text(value: str) -> str:
    for source, replacement in TEXT_REDACTIONS.items():
        value = value.replace(source, replacement)
    return clean(value)


def lookup_key(value: str) -> str:
    value = re.sub(r"\s*\(\d+\)\s*$", "", clean(value))
    value = unicodedata.normalize("NFD", value)
    value = "".join(char for char in value if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def lookup_candidates(value: str) -> list[str]:
    key = lookup_key(value)
    candidates = [key]
    if key in SYNONYM_WORD_ALIASES:
        candidates.append(lookup_key(SYNONYM_WORD_ALIASES[key]))
    if key.endswith("s") and len(key) > 3:
        candidates.append(key[:-1])
    pieces = key.split()
    if pieces and pieces[0].endswith("ed") and len(pieces[0]) > 3:
        candidates.append(" ".join([pieces[0][:-2], *pieces[1:]]))
    return list(dict.fromkeys(candidate for candidate in candidates if candidate))


def is_synonym_marker(line: str) -> bool:
    line = clean(line)
    upper = line.upper()
    return upper.startswith("EŞ ANLAM") or bool(TABLE_HEADER_RE.match(line))


def split_translation(value: str) -> tuple[str, str]:
    """Split the final balanced parenthesis group from an example sentence."""
    value = clean(value).rstrip(" :;")
    if not value.endswith(")"):
        opening = value.rfind("(")
        if opening > 0:
            return value[:opening].strip(), value[opening + 1 :].strip()
        return value, ""

    depth = 0
    for index in range(len(value) - 1, -1, -1):
        char = value[index]
        if char == ")":
            depth += 1
        elif char == "(":
            depth -= 1
            if depth == 0:
                sentence = value[:index].strip()
                translation = value[index + 1 : -1].strip()
                return sentence, translation
    return value, ""


def parse_header(header: str, week: int) -> tuple[str, str]:
    header = clean(header).rstrip(".")
    if week != 4:
        return header, ""

    match = re.match(r"^(.*?)\s*\(([^()]*)\)\s*$", header)
    if not match:
        return header, ""
    return clean(match.group(1)), clean(match.group(2))


def split_at_top_level_separators(value: str) -> list[str]:
    pieces = []
    current = []
    depth = 0
    for char in value:
        if char == "(":
            depth += 1
        elif char == ")" and depth:
            depth -= 1

        if depth == 0 and char in {",", "/", ";"}:
            pieces.append("".join(current))
            current = []
        else:
            current.append(char)

    pieces.append("".join(current))
    return pieces


def split_synonyms(value: str) -> list[str]:
    value = clean(value).strip(' "\'')
    value = re.sub(r"^\(?Repetitive\)?\s*", "", value, flags=re.I)
    value = value.replace("–", "/").replace("—", "/")
    pieces = split_at_top_level_separators(value)
    synonyms: list[str] = []
    seen: set[str] = set()
    for piece in pieces:
        synonym = clean(piece).strip(' "\'')
        synonym = re.sub(r"^\(?Repetitive\)?\s*", "", synonym, flags=re.I)
        synonym = synonym.strip(" /")
        key = lookup_key(synonym)
        if not synonym or not key or key in seen:
            continue
        seen.add(key)
        synonyms.append(synonym)
    return synonyms


def collect_synonym_section(path: Path, start_page_index: int) -> tuple[list[str], list[int], bool]:
    lines: list[str] = []
    page_indexes: list[int] = []
    has_pdf_table = False
    in_synonym_section = False
    with pdfplumber.open(path) as pdf:
        for page_index, page in enumerate(pdf.pages[start_page_index:], start=start_page_index):
            page_has_synonym_content = in_synonym_section
            for raw_line in (page.extract_text() or "").splitlines():
                line = clean(raw_line)
                if not line:
                    continue
                if is_synonym_marker(line):
                    in_synonym_section = True
                    has_pdf_table = has_pdf_table or bool(TABLE_HEADER_RE.match(line))
                    page_has_synonym_content = True
                    continue
                if in_synonym_section:
                    lines.append(line)
                    page_has_synonym_content = True
            if page_has_synonym_content:
                page_indexes.append(page_index)
    return lines, page_indexes, has_pdf_table


def add_synonyms(
    target: dict[str, list[str]],
    entry_id: str,
    raw_synonyms: str,
) -> None:
    existing = target[entry_id]
    seen = {lookup_key(item) for item in existing}
    for synonym in split_synonyms(raw_synonyms):
        key = lookup_key(synonym)
        if key and key not in seen:
            existing.append(synonym)
            seen.add(key)


def assign_synonyms_by_word(
    target: dict[str, list[str]],
    entry_by_word: dict[str, list[dict]],
    raw_word: str,
    raw_synonyms: str,
) -> None:
    word = clean(raw_word)
    candidates = [word]
    if not any(candidate in entry_by_word for candidate in lookup_candidates(word)) and "/" in word:
        candidates.extend(clean(candidate) for candidate in word.split("/"))

    for candidate in candidates:
        for key in lookup_candidates(candidate):
            for entry in entry_by_word.get(key, []):
                add_synonyms(target, entry["id"], raw_synonyms)


def extract_table_synonyms(
    path: Path,
    target: dict[str, list[str]],
    entry_by_number: dict[int, dict],
    entry_by_word: dict[str, list[dict]],
    page_indexes: list[int],
) -> None:
    if not page_indexes:
        return

    with pdfplumber.open(path) as pdf:
        for page_index in page_indexes:
            page = pdf.pages[page_index]
            for table in page.extract_tables():
                for row in table:
                    cells = [clean(cell or "") for cell in row]
                    if len(cells) < 4 or not cells[0].isdigit() or not cells[1] or not cells[-1]:
                        continue

                    entry = entry_by_number.get(int(cells[0]))
                    if entry and lookup_key(cells[1]) == lookup_key(entry["word"]):
                        add_synonyms(target, entry["id"], cells[-1])
                    else:
                        assign_synonyms_by_word(target, entry_by_word, cells[1], cells[-1])


def extract_line_synonyms(
    lines: list[str],
    target: dict[str, list[str]],
    entry_by_number: dict[int, dict],
    entry_by_word: dict[str, list[dict]],
) -> None:
    for line in lines:
        if TABLE_HEADER_RE.match(line) or is_synonym_marker(line):
            continue

        if re.match(r"^\d+,", line):
            row = next(csv_reader([line]))
            cells = [clean(cell) for cell in row]
            if len(cells) >= 4 and cells[0].isdigit():
                entry = entry_by_number.get(int(cells[0]))
                raw_synonyms = ", ".join(cells[3:])
                if entry:
                    add_synonyms(target, entry["id"], raw_synonyms)
                else:
                    assign_synonyms_by_word(target, entry_by_word, cells[1], raw_synonyms)
            continue

        numbered_match = NUMBERED_SYNONYM_RE.match(line)
        if numbered_match:
            assign_synonyms_by_word(
                target,
                entry_by_word,
                numbered_match.group(2),
                numbered_match.group(3),
            )
            continue

        colon_match = COLON_SYNONYM_RE.match(line)
        if colon_match:
            assign_synonyms_by_word(
                target,
                entry_by_word,
                colon_match.group(1),
                colon_match.group(2),
            )


def extract_synonyms(path: Path, entries: list[dict], start_page_index: int) -> dict[str, list[str]]:
    target: dict[str, list[str]] = defaultdict(list)
    entry_by_number = {entry["number"]: entry for entry in entries}
    entry_by_word: dict[str, list[dict]] = defaultdict(list)
    for entry in entries:
        entry_by_word[lookup_key(entry["word"])].append(entry)

    lines, page_indexes, has_pdf_table = collect_synonym_section(path, start_page_index)
    if has_pdf_table:
        extract_table_synonyms(path, target, entry_by_number, entry_by_word, page_indexes)
    extract_line_synonyms(lines, target, entry_by_number, entry_by_word)
    return target


def collect_entries(path: Path, page_limit: int, expected_count: int) -> list[dict]:
    entries: list[dict] = []
    current: dict | None = None
    expected_number = 1

    with pdfplumber.open(path) as pdf:
        for page in pdf.pages[:page_limit]:
            for raw_line in (page.extract_text() or "").splitlines():
                line = raw_line.strip()
                normalized_line = clean(line).upper()
                if any(normalized_line.startswith(marker) for marker in STOP_MARKERS):
                    if current:
                        entries.append(current)
                        current = None
                    if len(entries) != expected_count:
                        raise ValueError(
                            f"{path.name}: expected {expected_count} entries, "
                            f"found {len(entries)} before stop marker"
                        )
                    return entries

                match = ENTRY_RE.match(line)
                if match and int(match.group(1)) == expected_number:
                    if current:
                        entries.append(current)
                    current = {
                        "number": expected_number,
                        "header": match.group(2),
                        "lines": [],
                    }
                    expected_number += 1
                elif current:
                    current["lines"].append(line)

    if current:
        entries.append(current)

    if len(entries) != expected_count:
        raise ValueError(
            f"{path.name}: expected {expected_count} entries, found {len(entries)}"
        )
    return entries


def parse_entry(raw: dict, week: int, source: str) -> dict:
    word, header_meaning = parse_header(raw["header"], week)
    meaning_parts: list[str] = []
    examples: list[dict] = []
    active_example: dict | None = None

    for raw_line in raw["lines"]:
        line = clean(raw_line)
        if not line or line in {"•", ""}:
            continue

        example_match = EXAMPLE_RE.match(line)
        if example_match:
            if active_example:
                examples.append(active_example)
            domain_label = example_match.group(1).lower()
            active_example = {
                "domain": DOMAIN_MAP[domain_label],
                "content": example_match.group(2),
            }
            continue

        meaning_match = MEANING_RE.match(line)
        if meaning_match and not active_example:
            meaning_parts.append(meaning_match.group(1))
            continue

        if active_example:
            active_example["content"] += f" {line}"
        elif meaning_parts:
            meaning_parts.append(line)

    if active_example:
        examples.append(active_example)

    parsed_examples = []
    for example in examples:
        sentence, translation = split_translation(example["content"])
        parsed_examples.append(
            {
                "domain": example["domain"],
                "sentence": redact_text(sentence),
                "translation": redact_text(translation),
            }
        )

    meaning = redact_text(header_meaning or clean(" ".join(meaning_parts)))
    if not meaning:
        raise ValueError(f"Week {week}, word {raw['number']} ({word}): missing meaning")
    if len(parsed_examples) != 3:
        raise ValueError(
            f"Week {week}, word {raw['number']} ({word}): "
            f"expected 3 examples, found {len(parsed_examples)}"
        )
    if any(not item["sentence"] or not item["translation"] for item in parsed_examples):
        raise ValueError(
            f"Week {week}, word {raw['number']} ({word}): incomplete example"
        )

    return {
        "id": f"week-{week}-{raw['number']:03d}",
        "week": week,
        "number": raw["number"],
        "word": redact_text(word),
        "meaning": meaning,
        "synonyms": [],
        "examples": parsed_examples,
        "source": source,
    }


def normalise_synonym_list(entry: dict, synonyms: list[str]) -> list[str]:
    cleaned = []
    seen = set()
    word_key = lookup_key(entry["word"])
    for synonym in synonyms:
        synonym = redact_text(synonym)
        key = lookup_key(synonym)
        if not synonym or not key or key == word_key or key in seen:
            continue
        seen.add(key)
        cleaned.append(synonym)
    return cleaned


def apply_manual_redactions(entry: dict) -> dict:
    override = MANUAL_ENTRY_OVERRIDES.get((entry["week"], entry["number"]))
    entry["synonyms"] = normalise_synonym_list(entry, entry.get("synonyms", []))
    if not override:
        return entry

    if "meaning" in override:
        entry["meaning"] = redact_text(override["meaning"])
    if "synonyms" in override:
        entry["synonyms"] = normalise_synonym_list(entry, override["synonyms"])
    return entry


def resolve_cross_references(entries: list[dict]) -> list[dict]:
    """Expand entries that only point back to an earlier fully defined word."""
    resolved = []
    for entry in entries:
        match = re.search(r"\(Bkz No\s+(\d+)\)", entry["header"], re.I)
        if not match:
            resolved.append(entry)
            continue

        reference_number = int(match.group(1))
        if reference_number >= entry["number"]:
            raise ValueError(
                f"Entry {entry['number']} has an invalid reference to {reference_number}"
            )
        reference = resolved[reference_number - 1]
        resolved.append(
            {
                **entry,
                "header": reference["header"],
                "lines": list(reference["lines"]),
            }
        )
    return resolved


def main() -> None:
    vocabulary = []
    for week, config in WEEKS.items():
        matches = sorted(PDF_DIR.glob(config["pattern"]))
        if len(matches) != 1:
            raise FileNotFoundError(
                f"Week {week}: expected one PDF matching {config['pattern']!r}, "
                f"found {len(matches)}"
            )
        path = matches[0]
        raw_entries = resolve_cross_references(
            collect_entries(path, config["pages"], config["count"])
        )
        parsed_entries = [
            parse_entry(entry, week, path.name) for entry in raw_entries
        ]
        synonyms = extract_synonyms(path, parsed_entries, max(config["pages"] - 1, 0))
        for entry in parsed_entries:
            entry["synonyms"] = synonyms.get(entry["id"], [])
            apply_manual_redactions(entry)
        vocabulary.extend(parsed_entries)

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(
        json.dumps(vocabulary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(vocabulary)} words to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
