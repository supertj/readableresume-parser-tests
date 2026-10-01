"""Compare parser output and extracted text against expected.json.

Rules (frozen in the PRD, section 4.3.5):
- Normalize before comparing: Unicode NFC, every dash to "-", whitespace collapsed
  and trimmed, leading bullet marks removed from description lines, case-insensitive.
- Arrays match one to one, in order, with equal length.
- A non-empty expected value must equal the parsed value; an empty one must stay empty.
- Every profile field, every field of every entry and every description line is one item.
- Values listed in outOfScope are shown as found / not found but never counted.

SPDX-License-Identifier: AGPL-3.0-only
"""

import re
import unicodedata

DASHES = "‐‑‒–—―−"
BULLET_MARKS = "•●-*⋅∙⦁○⚬"
LIGATURES = range(0xFB00, 0xFB07)
PRIVATE_USE = range(0xE000, 0xF900)
# Characters allowed to remain once every expected value has been removed from the text
SEPARATORS = re.compile(r"[\s|,:•●\-]+")


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text or "")
    for dash in DASHES:
        text = text.replace(dash, "-")
    text = re.sub(r"\s+", " ", text).strip()
    return text.casefold()


def normalize_description(text: str) -> str:
    return normalize(normalize(text).lstrip(BULLET_MARKS).strip())


# ---------- C1: field-by-field ----------


def _item(path: str, expected: str, actual: str, description: bool = False) -> dict:
    norm = normalize_description if description else normalize
    return {"path": path, "expected": expected, "actual": actual, "ok": norm(expected) == norm(actual)}


def _count_item(path: str, expected: list, actual: list) -> dict:
    return {"path": f"{path} (count)", "expected": len(expected), "actual": len(actual), "ok": len(expected) == len(actual)}


def _entries(path: str, fields: list[str], expected: list[dict], actual: list[dict]) -> list[dict]:
    items = [_count_item(path, expected, actual)]
    for i, exp in enumerate(expected):
        act = actual[i] if i < len(actual) else {}
        for field in fields:
            items.append(_item(f"{path}[{i}].{field}", exp[field], act.get(field, "")))
        exp_desc = exp["descriptions"]
        act_desc = act.get("descriptions", [])
        items.append(_count_item(f"{path}[{i}].descriptions", exp_desc, act_desc))
        for j, line in enumerate(exp_desc):
            items.append(_item(f"{path}[{i}].descriptions[{j}]", line, act_desc[j] if j < len(act_desc) else "", True))
    return items


def compare_fields(expected: dict, parsed: dict) -> tuple[list[dict], list[dict]]:
    """Returns (content items, structural checks).

    Content items are what the PRD counts: every profile field, every field of every
    entry, every description line. Structural checks (list lengths, nothing in
    featuredSkills or custom) must all pass too, but aren't part of the published score.
    """
    items = []
    for field, value in expected["profile"].items():
        items.append(_item(f"profile.{field}", value, parsed["profile"].get(field, "")))
    items += _entries("workExperiences", ["company", "jobTitle", "date"], expected["workExperiences"], parsed["workExperiences"])
    items += _entries("educations", ["school", "degree", "date", "gpa"], expected["educations"], parsed["educations"])
    items += _entries("projects", ["project", "date"], expected["projects"], parsed["projects"])
    exp_skills = expected["skills"]["descriptions"]
    act_skills = parsed["skills"]["descriptions"]
    items.append(_count_item("skills.descriptions", exp_skills, act_skills))
    for j, line in enumerate(exp_skills):
        items.append(_item(f"skills.descriptions[{j}]", line, act_skills[j] if j < len(act_skills) else "", True))
    featured = [skill["skill"] for skill in parsed["skills"]["featuredSkills"]]
    custom = parsed.get("custom", {}).get("descriptions", [])
    structural = [item for item in items if item["path"].endswith("(count)")]
    structural.append({"path": "skills.featuredSkills (empty)", "expected": [], "actual": [s for s in featured if s], "ok": not any(featured)})
    structural.append({"path": "custom (empty)", "expected": [], "actual": custom, "ok": not custom})
    content = [item for item in items if not item["path"].endswith("(count)")]
    return content, structural


# ---------- C2: plain text ----------


def _flatten(sequence: list) -> list[str]:
    values = []
    for entry in sequence:
        values.extend(entry["anyOrder"] if isinstance(entry, dict) else [entry])
    return values


def check_text(expected: dict, lines: list[str]) -> dict:
    raw = "\n".join(lines)
    text = normalize(" ".join(lines))
    sequence = expected["textSequence"]
    out_of_scope = [item["value"] for item in expected.get("outOfScope", [])]

    bad_chars = sorted({f"U+{ord(ch):04X}" for ch in raw if ord(ch) in LIGATURES or ord(ch) in PRIVATE_USE})

    # Split words ("Proj ect"): every word of the sample content must appear whole
    vocabulary = {w for value in _flatten(sequence) + out_of_scope for w in re.findall(r"[a-z0-9]+", normalize(value))}
    tokens = set(re.findall(r"[a-z0-9]+", text))
    split_words = sorted(vocabulary - tokens)

    # Order: each value (or group of values in any order) must come after the previous
    # one. Inside a group every value needs its own, non-overlapping occurrence.
    cursor = 0
    order_errors = []
    for entry in sequence:
        group = entry["anyOrder"] if isinstance(entry, dict) else [entry]
        taken: list[tuple[int, int]] = []
        for value in group:
            needle = normalize_description(value)
            start = cursor
            while True:
                found = text.find(needle, start)
                span = (found, found + len(needle))
                if found < 0 or not any(span[0] < end and begin < span[1] for begin, end in taken):
                    break
                start = found + 1
            if found < 0:
                order_errors.append(value)
            else:
                taken.append(span)
        if taken:
            cursor = max(end for _, end in taken)

    # Completeness: each expected value accounts for exactly one occurrence in the text
    # (the sequence lists every occurrence, out-of-scope values included). A value that
    # can't be consumed is missing; anything left over, duplicates included, is extra.
    # Longest first, so a short value can't eat part of a longer one.
    leftover = text
    missing = []
    for value in sorted(_flatten(sequence), key=len, reverse=True):
        needle = normalize_description(value)
        if needle not in leftover:
            missing.append(value)
        leftover = leftover.replace(needle, " ", 1)
    leftover = SEPARATORS.sub(" ", leftover).strip()

    return {
        "forbiddenChars": bad_chars,
        "splitWords": split_words,
        "notFoundInOrder": order_errors,
        "missingOccurrences": missing,
        "unexpectedText": leftover,
        "ok": not bad_chars and not split_words and not order_errors and not missing and not leftover,
        "firstLines": lines[:30],
    }


def check_out_of_scope(expected: dict, lines: list[str]) -> list[dict]:
    text = normalize(" ".join(lines))
    return [{**item, "foundInText": normalize(item["value"]) in text} for item in expected.get("outOfScope", [])]
