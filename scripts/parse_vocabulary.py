#!/usr/bin/env python3
"""Extract the primary vocabulary lists from the weekly course PDFs."""

from __future__ import annotations

import json
import re
import unicodedata
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
}

ENTRY_RE = re.compile(r"^(\d+)\.\s*(.+?)\s*$")
EXAMPLE_RE = re.compile(r"^[•]?\s*(Sağlık|Sosyal|Fen)\s*:\s*(.*)$", re.I)
MEANING_RE = re.compile(r"^[•]?\s*Anlamı\s*:\s*(.*)$", re.I)
DOMAIN_MAP = {"sağlık": "health", "sosyal": "social", "fen": "science"}


def clean(value: str) -> str:
    value = unicodedata.normalize("NFC", value)
    value = value.replace("\u00ad", "").replace("\u2028", " ")
    return re.sub(r"\s+", " ", value).strip()


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
    header = clean(header)
    if week != 4:
        return header, ""

    match = re.match(r"^(.*?)\s*\(([^()]*)\)\s*$", header)
    if not match:
        return header, ""
    return clean(match.group(1)), clean(match.group(2))


def collect_entries(path: Path, page_limit: int, expected_count: int) -> list[dict]:
    entries: list[dict] = []
    current: dict | None = None
    expected_number = 1

    with pdfplumber.open(path) as pdf:
        for page in pdf.pages[:page_limit]:
            for raw_line in (page.extract_text() or "").splitlines():
                line = raw_line.strip()
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
                "sentence": sentence,
                "translation": translation,
            }
        )

    meaning = header_meaning or clean(" ".join(meaning_parts))
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
        "word": word,
        "meaning": meaning,
        "examples": parsed_examples,
        "source": source,
    }


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
        vocabulary.extend(
            parse_entry(entry, week, path.name) for entry in raw_entries
        )

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(
        json.dumps(vocabulary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(vocabulary)} words to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
