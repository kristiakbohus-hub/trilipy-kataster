#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pridá nové preklady do en_tpl.tsv z dávky „SK text<TAB>EN text" (čísla píš normálne, ako v slovenskom texte).

Čísla v SK sa nahradia {0}, {1}… (rovnako ako tplOf v appke) a v EN sa zhodné čísla namapujú na tie isté zástupné znaky,
takže preklad funguje aj pre iné výmery, sumy a dátumy. Texty, ktoré appka už prekladá, sa preskočia (test cez test_en.py).
Použitie: python3 scripts/i18n/add_tsv.py davka.tsv [davka2.tsv…] && python3 scripts/i18n/gen_en_tpl.py
"""
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from test_en import translate  # noqa: E402
TSV = os.path.join(HERE, "en_tpl.tsv")
NUM = re.compile(r"\d+(?:[   ]\d{3})*(?:[.,]\d+)?")
SP = re.compile("[   ]")

pairs = []
for f in sys.argv[1:]:
    for ln in open(f, encoding="utf-8"):
        if "\t" in ln:
            a, b = ln.rstrip("\n").split("\t", 1); pairs.append((a.strip(), b.strip()))
done = {a for a, b, _ in translate([a for a, _ in pairs]) if a != b}
existing = {ln.split("\t", 1)[0] for ln in open(TSV, encoding="utf-8") if "\t" in ln}
out, skipped = [], 0
for a, b in pairs:
    if a in done: skipped += 1; continue
    nums = [SP.sub(" ", n) for n in NUM.findall(a)]
    cnt = iter(range(10_000))
    ka = SP.sub(" ", NUM.sub(lambda m: "{%d}" % next(cnt), a))
    used: set[int] = set()
    def rep(m):
        v = SP.sub(" ", m.group(0))
        for i, n in enumerate(nums):
            if i not in used and n == v: used.add(i); return "{%d}" % i
        return m.group(0)
    kb = NUM.sub(rep, b)
    if ka in existing: skipped += 1; continue
    existing.add(ka); out.append(f"{ka}\t{kb}")
with open(TSV, "a", encoding="utf-8") as f:
    for x in out: f.write(x + "\n")
print(f"pridaných {len(out)}, už preložených alebo v slovníku {skipped} → teraz spusti gen_en_tpl.py")
