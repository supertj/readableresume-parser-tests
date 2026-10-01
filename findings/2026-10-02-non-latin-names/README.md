# Non-Latin names (2026-10-02)

PRD 4.3.9: test a Chinese, a Cyrillic and an accented Latin name. Each name replaced the sample name in the
Plain (Arial) and Jake's (Times New Roman) resumes, imported into Google Docs, and exported with
File > Download > PDF. `latin-control` is the unchanged sample. Raw results: `results.json`.

| Name | Font in the PDF | Pages | Text extracted | OpenResume name field |
|---|---|---|---|---|
| Иван Петров (Cyrillic) | unchanged (Arial / Times New Roman have Cyrillic) | unchanged | correct | read correctly |
| José Álvarez (accented) | unchanged | unchanged | correct | read correctly |
| 王小明 (Chinese) | Google Docs swaps in MS PGothic (with Arial) or MS PMincho (with Times New Roman) for those characters | unchanged | correct | **empty** |

Why the Chinese name is missed: OpenResume scores a name by "letters, spaces and periods only" and by a bold
font name. The substituted CJK font is not marked bold, and the characters are not A–Z, so no candidate
scores above zero. Every other field still parsed. Practical advice: lead with the romanized name, for
example "Xiaoming Wang (王小明)".

Reproduce: `uv run python -c "import sys; sys.path.insert(0,'checks'); from verify import run_parser; print(run_parser('findings/2026-10-02-non-latin-names/names-plain-chinese.pdf')['resume']['profile'])"`
