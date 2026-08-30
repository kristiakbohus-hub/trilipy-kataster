# TRI LIPY KATASTER — nasadenie mimo Higgsfieldu (Cloudflare Workers)

Cieľ: verejná URL chránená heslom (`trilipy`), aby kolegovia mohli dávať feedback,
a aby sa pri každej zmene kódu sama nasadila (auto sync cez GitHub Action).

## Čo je už hotové (spravil agent)
- Cloudflare **D1** `trilipy-kataster` (uuid `84e03920-b41c-4b56-a66f-a46c3fce0d62`)
- Cloudflare **KV** `6cf426515df54988b48980352ed07c1e`
- `app/wrangler.cf.jsonc` — samostatný CF config (Higgsfield deploy ho ignoruje)
- `.github/workflows/deploy-cf.yml` — Action: build → D1 migrácie → deploy (pri každom pushi)
- Passphrase login `trilipy` a plný prístup (rola analytik) sú v kóde

## Čo spravíš ty (5 krokov)
1. **Vytvor prázdny GitHub repo**, napr. `trilipy-kataster` (private).
2. **Pridaj deploy key** (repo → Settings → Deploy keys → Add deploy key, **zaškrtni Allow write access**):
   ```
   ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAjVH7lEM1Q6Rj1Fx3zsBn0GsTGDTBZy1EDclpzf5wdw trilipy-kataster-deploy
   ```
   (tým budem môcť pushnúť kód + budúce zmeny = auto sync)
3. **Cloudflare API token**: dash.cloudflare.com → My Profile → API Tokens → Create Token →
   šablóna **„Edit Cloudflare Workers"**, pridaj aj **D1 → Edit**. Skopíruj token.
4. **CF Account ID**: v Cloudflare dashboarde (Workers & Pages → vpravo Account ID).
5. **GitHub secrets** (repo → Settings → Secrets and variables → Actions → New secret):
   - `CLOUDFLARE_API_TOKEN` = token z kroku 3
   - `CLOUDFLARE_ACCOUNT_ID` = id z kroku 4

Potom mi pošli **URL repa** — ja pushnem kód, Action zbuilduje, aplikuje migrácie (15 k.ú.)
a nasadí. Výsledok: `https://trilipy-kataster.<tvoj-subdomain>.workers.dev`, heslo `trilipy`.

## Sync
Odvtedy: keď zmením appku vo vývoji, pushnem tú istú zmenu aj sem → Action ju sama nasadí.
(Higgsfield verzia beží ďalej nezávisle; obe z rovnakého kódu.)

## Pozn.
- R2 (upload ÚP rastrov) je vypnuté — mapa aj celý kataster fungujú, len upload rastra odpadne.
  Keď zapneš R2 v CF dashboarde, doplní sa binding.
- Heslo `trilipy` je slabé — na verejnej URL zváž silnejšie (zmením v kóde na tvoje).
