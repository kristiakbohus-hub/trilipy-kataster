#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generuje src/lib/i18n-en-tpl.ts zo slovníka šablón en_tpl.tsv (SK šablóna <TAB> EN preklad).

Šablóna = slovenský text, v ktorom je každé číslo nahradené {0}, {1}… (rovnaké pravidlo ako tplOf v i18n-en-dict.ts),
takže jeden riadok preloží text pre ľubovoľné čísla (výmery, dátumy, sumy). Nezlomiteľné medzery sa berú ako medzera.
Použitie: python3 scripts/i18n/gen_en_tpl.py
"""
import json, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "src", "lib", "i18n-en-tpl.ts")
SP = re.compile("[   ]")
rows = {}
for ln in open(os.path.join(HERE, "en_tpl.tsv"), encoding="utf-8"):
    if "\t" not in ln:
        continue
    a, b = ln.rstrip("\n").split("\t", 1)
    a = SP.sub(" ", a)
    pa, pb = sorted(re.findall(r"\{\d+\}", a)), sorted(set(re.findall(r"\{\d+\}", b)))
    if not set(pb) <= set(pa):
        raise SystemExit(f"preklad používa neznámy zástupný znak: {a[:80]}")
    rows[a] = b
with open(OUT, "w", encoding="utf-8") as f:
    f.write("// VYGENEROVANÉ scripts/i18n/gen_en_tpl.py z scripts/i18n/en_tpl.tsv — needitovať ručne.\n")
    f.write("// Šablóny SK→EN: čísla v texte sú {0}, {1}… (pozri tplOf v i18n-en-dict.ts).\n")
    f.write("export const EN_TPL: Record<string, string> = {\n")
    for a, b in rows.items():
        f.write(f"  {json.dumps(a, ensure_ascii=False)}: {json.dumps(b, ensure_ascii=False)},\n")
    f.write("};\n")
print(f"{len(rows)} šablón → {os.path.relpath(OUT)}")
