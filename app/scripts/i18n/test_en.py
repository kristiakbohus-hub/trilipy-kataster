#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test anglického prekladača bez node/bun: z src/lib/i18n-en-tpl.ts + i18n-en-dict.ts odstráni TS typy, načíta JS
do headless Chrome (CDP) a preloží zoznam textov rovnako ako list (enText + enNums).

Použitie: python3 scripts/i18n/test_en.py vstup.json [výstup.json]   (vstup = JSON zoznam SK textov)
Výstup: [[sk, enText(sk), enNums(enText(sk))], …]; na obrazovku počet nepreložených.
"""
import json, os, re, subprocess, sys, tempfile, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from collect_nodes import WS, CHROME  # noqa: E402
LIB = os.path.join(HERE, "..", "..", "src", "lib")

def build_js() -> str:
    tpl = open(os.path.join(LIB, "i18n-en-tpl.ts"), encoding="utf-8").read().replace("export const EN_TPL: Record<string, string> =", "const EN_TPL =")
    d = open(os.path.join(LIB, "i18n-en-dict.ts"), encoding="utf-8").read()
    d = re.sub(r"^import .*\n", "", d, flags=re.M)
    for a, b in [("export const EN_DICT: Record<string, string> =", "const EN_DICT ="), ("type Rep = string | ((...m: string[]) => string);\n", ""),
                 ("const EN_PATTERNS: [RegExp, Rep][] =", "const EN_PATTERNS ="), ("const BUILDING_EN: Record<string, string> =", "const BUILDING_EN ="),
                 ("function tplOf(s: string): [string, string[]] {", "function tplOf(s) {"), ("const nums: string[] = [];", "const nums = [];"),
                 ("function lookup(k: string): string | undefined {", "function lookup(k) {"), ("rep as never", "rep"),
                 ("function listEn(a: string): string {", "function listEn(a) {"), ("function bySegments(k: string): string | undefined {", "function bySegments(k) {"),
                 ("export function enText(k: string): string {", "function enText(k) {"), ("export function enNums(s: string): string {", "function enNums(s) {"),
                 ("const done = new WeakMap<Text, string>();", "const done = new WeakMap();"), (" as Record<string, string>)", ")"),
                 ("export function translateDom(root: HTMLElement | null): void {", "function translateDom(root) {"),
                 ("const nodes: Text[] = [];", "const nodes = [];"), ("w.currentNode as Text", "w.currentNode")]:
        d = d.replace(a, b)
    left = re.findall(r"\bas [A-Z]\w+|<\w+, ?\w+>|\): (?:string|void|number)\b", d)
    if left:
        raise SystemExit(f"v i18n-en-dict.ts pribudli TS typy, doplň ich do build_js(): {left[:5]}")
    return tpl + "\n" + d + "\nwindow.__enText = enText; window.__enNums = enNums;\n"

def translate(texts: list[str]) -> list[list[str]]:
    prof = tempfile.mkdtemp(); port = 9336
    p = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--no-first-run", f"--user-data-dir={prof}", f"--remote-debugging-port={port}", "about:blank"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try: tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/json").read()); break
            except Exception: time.sleep(0.3)
        ws = WS([t for t in tabs if t.get("type") == "page"][0]["webSocketDebuggerUrl"]); i = [0]
        def ev(expr):
            i[0] += 1; ws.send(json.dumps({"id": i[0], "method": "Runtime.evaluate", "params": {"expression": expr, "returnByValue": True}}))
            while True:
                r = json.loads(ws.recv())
                if r.get("id") == i[0]: return r["result"]
        r = ev(build_js() + "\n;'ok'")
        if "exceptionDetails" in r: raise SystemExit(f"JS chyba: {r['exceptionDetails']}")
        r = ev("JSON.stringify(" + json.dumps(texts, ensure_ascii=False) + ".map(t => { const e = window.__enText(t); return [t, e, window.__enNums(e)]; }))")
        if "exceptionDetails" in r: raise SystemExit(f"JS chyba: {r['exceptionDetails']}")
        return json.loads(r["result"]["value"])
    finally:
        p.kill()

if __name__ == "__main__":
    res = translate(json.load(open(sys.argv[1], encoding="utf-8")))
    if len(sys.argv) > 2: json.dump(res, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    left = [a for a, b, _ in res if a == b]
    print(f"{len(res)} textov, nepreložených {len(left)}")
    for a in left[:40]: print("  ", a[:120])
