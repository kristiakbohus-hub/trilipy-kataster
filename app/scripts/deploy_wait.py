#!/usr/bin/env python3
"""Čaká, kým appka na Cloudflare beží na danom commite (repo je súkromný → nie cez GitHub API).

Použitie: python3 scripts/deploy_wait.py <sha> [--timeout 900]
- úspech: GET /api/version vráti sha začínajúce na <sha> → exit 0
- zlyhanie: workflow zapísal do KV `build:last_fail` s týmto sha → vypíše chybu buildu/migrácie, exit 1
- timeout → exit 2
Adresu appky a secret berie z 25_SAVED_ALERTS/alerts_cron.json; secret sa nikdy nevypisuje.
"""
import json, sys, time, urllib.request

CFG = "/Users/skiwo/13_INFOKAT_CLAUDE/25_SAVED_ALERTS/alerts_cron.json"
UA = "trilipy-deploy-wait"


def main():
    if len(sys.argv) < 2:
        sys.exit("použitie: deploy_wait.py <sha> [--timeout s]")
    sha = sys.argv[1].strip().lower()
    timeout = int(sys.argv[sys.argv.index("--timeout") + 1]) if "--timeout" in sys.argv else 900
    c = json.load(open(CFG, encoding="utf-8"))
    base = (c.get("url") or "").rsplit("/api/", 1)[0]
    secret = c.get("secret") or ""
    t0 = time.time(); last = None
    while time.time() - t0 < timeout:
        try:
            req = urllib.request.Request(base + "/api/version", headers={"x-alert-secret": secret, "User-Agent": UA})
            d = json.loads(urllib.request.urlopen(req, timeout=20).read())
            last = d.get("sha")
            if (last or "").lower().startswith(sha):
                print(f"deploy {sha}: success (build {d.get('built_at')})")
                return 0
            f = d.get("last_fail") or {}
            if isinstance(f, dict) and str(f.get("sha", "")).lower().startswith(sha):
                print(f"deploy {sha}: FAILED\n{f.get('msg', '')}")
                return 1
        except Exception as e:  # sieť / appka sa práve nasadzuje
            last = f"chyba: {type(e).__name__}"
        time.sleep(20)
    print(f"deploy {sha}: timeout po {timeout} s (beží {last})")
    return 2


if __name__ == "__main__":
    sys.exit(main())
