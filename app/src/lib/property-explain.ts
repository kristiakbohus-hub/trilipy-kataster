// LIST NEHNUTEĽNOSTI — „Čo to pre vás znamená“: vysvetlenia pre laika pod každou kapitolou (2026-11-13).
// Statické vety s dosadenými číslami z listu (bez AI, bez nákladov). Zásady phrases.ts: žiadne sľuby, chýbajúci
// údaj = neznámy stav, pri odhadoch vždy „orientačne“. Texty prechádzajú phrase-guardom v builde.
import { checklist, completeness, fact, mainKey, riskyHit, semafor, zoneOf, type SheetData } from "./property-eval";
import type { FinResult } from "./finance";
import { FIN } from "./fin-params";

const nf = (n: number, d = 0) => n.toLocaleString("sk-SK", { maximumFractionDigits: d });
const eur = (n: number | null | undefined) => (n == null ? "—" : `${nf(Math.round(n))} €`);
const dist = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${nf(m / 1000, 1)} km`);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function explain(id: string, d: SheetData, fin: FinResult | null): string[] {
  const c = d.core; const mk = mainKey(c); const kod = c.dataset?.ku_code ?? "";
  const out: string[] = [];
  switch (id) {
    case "prehlad": {
      const area = c.parcels.reduce((s, p) => s + (p.area_m2 ?? 0), 0);
      out.push(`Predmetom listu je ${c.parcels.length === 1 ? "jedna parcela" : `${c.parcels.length} parciel`} s výmerou spolu ${nf(area)} m²${c.buildings.length ? ` a ${c.buildings.length === 1 ? "stavba" : `${c.buildings.length} stavby`}` : ""}, zapísané na ${c.lvs.length === 1 ? "jednom liste vlastníctva" : `${c.lvs.length} listoch vlastníctva`}.`);
      out.push("List vlastníctva (LV) je úradný záznam katastra: kto je vlastník (časť B), čo k nehnuteľnosti patrí (časť A) a aké práva tretích osôb ju zaťažujú (časť C). Pred kúpou si vždy vyžiadajte aktuálny výpis.");
      break;
    }
    case "skladba": {
      const agri = c.parcels.filter((p) => /orn|trval|záhrad|zahrad/i.test(p.use_type ?? ""));
      if (agri.length) out.push(`${agri.length === c.parcels.length ? "Všetky parcely sú" : `${agri.length} z ${c.parcels.length} parciel je`} vedené ako poľnohospodárska pôda (orná pôda, záhrada, trávny porast). Na stavbu treba pôdu „vyňať“ z pôdneho fondu a zaplatiť jednorazový odvod — jeho výšku určuje kvalita pôdy (kód BPEJ).`);
      if (c.parcels.some((p) => /zastav/i.test(p.use_type ?? ""))) out.push("„Zastavaná plocha a nádvorie“ znamená, že pozemok je už vedený ako stavebný — vyňatie z pôdneho fondu sa neplatí.");
      if (c.parcels.some((p) => p.register === "E")) out.push("Parcely registra E sú pozemky podľa starej pozemkovej knihy — v teréne nemusia mať hranice a vlastníkov je často viac; vysporiadanie býva zdĺhavejšie.");
      out.push("Rozmery a tvar sú vypočítané z obrysu v katastrálnej mape; či sa na pozemok zmestí dom, závisí aj od odstupov a regulatívov územného plánu.");
      break;
    }
    case "vlastnictvo": {
      const n = c.owners.perLv.reduce((s, l) => s + l.count, 0);
      out.push(n <= 1 ? "Nehnuteľnosť má jedného vlastníka — rokovanie aj podpis zmluvy sú najjednoduchšie." : `Nehnuteľnosť má ${n} vlastníkov. Na predaj celku musia podpísať všetci; ak predáva len jeden svoj podiel, ostatní spoluvlastníci majú zo zákona predkupné právo.`);
      const inh = Math.max(0, ...c.legalYears.map((y) => y.inh_max ?? 0));
      if (inh) out.push(`Posledné dedičstvo je zapísané v roku ${inh}. Dedičia často chcú nehnuteľnosť predať rýchlo a bez starostí — to býva priestor na dohodu.`);
      break;
    }
    case "pravo": {
      const tar = c.legal.reduce((s, l) => s + l.tarchyCount, 0);
      out.push(tar ? `Na LV je ${tar}× zapísaná ťarcha alebo poznámka (napr. záložné právo banky, vecné bremeno, predkupné právo). Každú treba pred podpisom vysvetliť — záložné právo sa spravidla vyplatí z kúpnej ceny a vymaže, vecné bremeno (napr. právo prechodu) prechádza na nového vlastníka.` : "V našom zázname nie je zapísaná ťarcha. To ešte neznamená istotu — rozhoduje aktuálny úradný výpis z LV v deň podpisu.");
      if (c.flags.length) out.push("Exekúcia, súdne konanie alebo konkurz bránia bežnému predaju, kým sa nevyriešia — banky na takú nehnuteľnosť úver neposkytnú.");
      break;
    }
    case "pristup": {
      const pr = mk ? fact(c, "pristup", mk) : null;
      const t = String(pr?.trieda ?? "");
      out.push(/priamy/i.test(t) ? "Pozemok hraničí s verejnou cestou — príjazd je právne zabezpečený." : /cez/i.test(t) ? "K pozemku sa ide cez iný pozemok. Bez zapísaného vecného bremena (práva prechodu) môže vlastník susedného pozemku prechod zakázať — pred kúpou to treba vyriešiť zmluvou." : /bez/i.test(t) ? "Pozemok nemá prístup z verejnej cesty. Bez vyriešeného prístupu sa naň nedá dostať ani stavať a banky ho nefinancujú." : "Prístup sme nevedeli spoľahlivo určiť — overte ho na mape a v teréne.");
      break;
    }
    case "up": {
      const z = zoneOf(d);
      out.push(z.name ? `Územný plán obce určuje, čo sa na pozemku smie postaviť. Tu je pozemok v zóne „${z.name.replace(/ — ÚP z výkresu, orientačné$/, "")}“. ${/býv|byva|obyt|zmie/i.test(z.name) ? "Bývanie je v takej zóne spravidla prípustné." : /poľno|polno|les|zele|orn/i.test(z.name) ? "Výstavba v takej zóne bez zmeny územného plánu nie je možná a zmena trvá spravidla 1–3 roky." : "Či je váš zámer prípustný, potvrdí záväzná časť ÚP alebo územnoplánovacia informácia obce."}` : "Zónu územného plánu pre túto parcelu nemáme. Kým ju obec nepotvrdí (územnoplánovacia informácia), nie je isté, či sa na pozemku dá stavať.");
      if (d.dev) out.push(`Regulatív ÚP (napr. IZP = koľko percent pozemku smie zabrať stavba, IPP = koľko podlažnej plochy na m² pozemku) dáva orientačne ${nf(d.dev.izpArea)} m² zastavateľnej plochy${d.dev.byty ? ` a ~${d.dev.byty} bytov` : ""}.`);
      break;
    }
    case "limity": {
      const hits = [...(d.limits?.items ?? []).filter((h) => h.hit).map((h) => h.label), ...(d.ext ?? []).filter(riskyHit).map((e) => e.label)];
      out.push(hits.length ? `Pozemok zasahuje do ${hits.length} obmedzení z úradných registrov (${hits.slice(0, 4).join(", ")}${hits.length > 4 ? " …" : ""}). Obmedzenie neznamená zákaz — znamená, že pri stavbe treba súhlas príslušného úradu alebo správcu a niekedy drahšie technické riešenie.` : "V sledovaných úradných registroch (záplavy, zosuvy, ochrana prírody, vodné zdroje, ložiská, záťaže…) sme pre pozemok nenašli obmedzenie. Registre však nepokrývajú všetko — vyjadrenia úradov sú súčasťou stavebného konania.");
      break;
    }
    case "teren": {
      const t = mk ? fact(c, "teren", mk) : null, s = mk ? fact(c, "slnko", mk) : null;
      const sk = num(t?.sklon_avg);
      if (sk != null) out.push(`Priemerný sklon ${nf(sk, 1)} %: ${sk < 5 ? "rovina — stavba je najlacnejšia" : sk < 12 ? "mierny svah — bežná stavba, menšie terénne úpravy" : sk < 20 ? "výraznejší svah — počítajte s vyššími nákladmi na základy, oporné múry a prístup" : "strmý svah — stavba je výrazne drahšia a niekedy nepraktická"}.`);
      const dec = num(s?.dec_slnko);
      if (dec != null) out.push(`21. decembra (najkratší deň) má stred pozemku ~${nf(dec, 1)} h priameho slnka${num(s?.zima_strata_h) ? `; okolitý terén z toho zoberie ~${nf(num(s?.zima_strata_h) as number, 1)} h` : ""}. Viac zimného slnka = svetlejší dom a nižšie náklady na kúrenie.`);
      break;
    }
    case "klima": out.push("Klimatické údaje sú dlhodobé priemery pre nadmorskú výšku pozemku. Stavebné normy (snehová a veterná oblasť, hĺbka premŕzania, seizmicita) určujú, na aké zaťaženie musí projektant dimenzovať strechu a základy — vyššie hodnoty znamenajú drahšiu konštrukciu."); break;
    case "siete": {
      const ob = fact(c, "obec", `ku:${kod}`); const osm = mk ? fact(c, "osm", mk) : null;
      out.push(`Siete (elektrina, voda, kanalizácia, plyn) sú pre stavbu kľúčové — prípojka môže stáť od stoviek po desaťtisíce eur. ${typeof osm?.cesta === "number" ? `Siete vedú spravidla po ceste; tá je od pozemku ~${dist(osm.cesta as number)}, takže prípojky budú merať zhruba toľko.` : ""} ${ob?.plyn_obec === false ? "Obec nie je plynofikovaná — kúrenie bude elektrinou, tepelným čerpadlom alebo tuhým palivom." : ""}`.trim());
      out.push("Presnú polohu a kapacitu sietí potvrdí len správca vo vyjadrení k existencii sietí — vzor žiadosti nájdete v prílohe listu.");
      break;
    }
    case "doprava": {
      const osm = mk ? fact(c, "osm", mk) : null;
      const parts = [num(osm?.skola) != null ? `škola ${dist(num(osm?.skola) as number)}` : null, num(osm?.potrav) != null ? `obchod ${dist(num(osm?.potrav) as number)}` : null, num(osm?.bus) != null ? `zastávka ${dist(num(osm?.bus) as number)}` : null, num(osm?.t_za) != null ? `Žilina autom ${num(osm?.t_za)} min` : null].filter(Boolean);
      if (parts.length) out.push(`Pre každodenný život: ${parts.join(", ")}. Vzdialenosti sú vzdušnou čiarou, skutočná cesta býva o tretinu dlhšia.`);
      break;
    }
    case "hodnota": {
      const cs = c.compStats;
      out.push(cs?.estimateEur ? `Orientačná hodnota ${eur(cs.estimateEur)} vychádza z ${cs.n} skutočných predajov podobných nehnuteľností v okrese — z cien uvedených v kúpnych zmluvách zapísaných v katastri, nie z inzerátov. Polovica týchto predajov bola medzi ${nf(cs.p25 ?? 0)} a ${nf(cs.p75 ?? 0)} €/m².` : "Na spoľahlivý odhad nemáme dosť porovnateľných predajov — hodnotu určí až znalec alebo porovnanie s ponukami.");
      out.push("Odhad nie je znalecký posudok. Banka pri hypotéke vychádza z hodnoty, ktorú určí jej znalec — ak je nižšia ako cena, rozdiel doplácate z vlastných peňazí.");
      break;
    }
    case "trh": {
      const dd = c.market.domDays?.median;
      out.push(`${dd ? `Podobné nehnuteľnosti sa v okrese predávajú bežne ${dd} dní. ` : ""}Ak je inzerát online výrazne dlhšie alebo cena klesla, predávajúci býva otvorenejší dohode.`);
      if (c.market.rent?.yieldPct != null) out.push(`Hrubý výnos z prenájmu v okrese je ~${nf(c.market.rent.yieldPct, 1)} % ročne — toľko percent z ceny vráti ročné nájomné pred nákladmi a daňami.`);
      break;
    }
    case "financovanie": {
      const m = fin?.mortgage; if (!m) { out.push("Na výpočet hypotéky chýba cena alebo odhad hodnoty."); break; }
      out.push(`Pri úvere ${eur(m.loan)} (${Math.round((m.loan / (fin!.basis.price || 1)) * 100)} % z ceny) na ${fin!.inputs.years} rokov a sadzbe ${nf(m.rate, 2)} % je splátka ~${eur(m.payment)} mesačne. Za celú dobu zaplatíte na úrokoch ~${eur(m.totalInterest)}.`);
      out.push(`Vlastné peniaze potrebujete ~${eur(m.ownFunds.total)}: ${eur(m.ownFunds.down)} je časť ceny, ktorú banka nepožičia, ${eur(m.ownFunds.costs)} poplatky a ${eur(m.ownFunds.reserve)} odporúčaná rezerva.`);
      out.push(`Národná banka Slovenska banke prikazuje overiť, či splátku zvládnete aj pri sadzbe o ${FIN.nbs.stressAddPp} body vyššej (najviac ${FIN.nbs.stressCapPct} %). Preto treba čistý príjem domácnosti aspoň ~${eur(m.income.netMonthly)} mesačne (${m.income.binding === "DSTI" ? "rozhoduje splátka voči príjmu" : "rozhoduje výška úveru voči ročnému príjmu"}).`);
      if (m.stress[1]?.diff > 0) out.push(`Fixácia ${fin!.inputs.fix} rokov znamená, že sadzba je istá len ${fin!.inputs.fix} rokov. Ak by potom bola o 2 body vyššia, splátka stúpne o ~${eur(m.stress[1].diff)} mesačne.`);
      if (m.blockers.length) out.push(`Pozor: našli sme ${m.blockers.length} ${m.blockers.length === 1 ? "vec, ktorá môže" : "veci, ktoré môžu"} hypotéku skomplikovať — sú vypísané nižšie a riešia sa pred podpisom zmluvy.`);
      break;
    }
    case "naklady": {
      const k = fin?.costs; if (!k) break;
      out.push(`K cene si pripočítajte jednorazové náklady ~${eur(k.oneOffTotal)} (vklad do katastra, overenie podpisov, úschova${fin?.mortgage ? ", znalec pre banku" : ""}) a ročné náklady vlastníctva ~${eur(k.annualTotal)} (~${eur(k.monthly)} mesačne).`);
      out.push(k.saleTax.text);
      if (k.buildTotal) out.push(`Ak na pozemku plánujete stavať, počítajte pred samotnou stavbou orientačne s ~${eur(k.buildTotal)} na prípojky, vyňatie pôdy, zemné práce a projekt.`);
      break;
    }
    case "poistenie": {
      const i = fin?.insurance; if (!i) break;
      if (i.rebuild) out.push(`Poistiť stavbu treba na sumu, za ktorú by sa dala postaviť znova (nie na trhovú cenu) — tu orientačne ${eur(i.rebuild)}. Pri nižšej poistnej sume poisťovňa pri škode krátí plnenie (podpoistenie).`);
      out.push(`Odhad ročného poistného: ${eur(i.premiumLow)} až ${eur(i.premiumHigh)}. ${i.risks.some((r) => r.level === "vysoké") ? "Lokalita má zvýšené riziko (" + i.risks.filter((r) => r.level === "vysoké").map((r) => r.label.toLowerCase()).join(", ") + ") — poistné môže byť vyššie alebo poisťovňa niektoré riziko vylúči." : "Vo sledovaných rizikách lokalita nevybočuje."}`);
      break;
    }
    case "predikcia": {
      const p = fin?.prediction; if (!p) break;
      const z = p.scenarios[1], lo = p.scenarios[0], hi = p.scenarios[2];
      out.push(`Ak sa bude trh vyvíjať ako doteraz, hodnota o 5 rokov bude orientačne ${eur(z.values[2])} (rozpätie ${eur(lo.values[2])} – ${eur(hi.values[2])}). Po odpočítaní inflácie je to v dnešných peniazoch ~${eur(p.real5)}.`);
      out.push("Predikcia nie je sľub — vychádza z doterajšieho vývoja cien zo zmlúv, miezd a cien bývania. Najviac ju ovplyvnia úrokové sadzby, ekonomika regiónu a nová výstavba v okolí.");
      break;
    }
    case "investicia": {
      const v = fin?.invest; if (!v) break;
      if (v.gross != null) out.push(`Pri nájme ~${eur(v.rent)} mesačne je hrubý výnos ${nf(v.gross, 1)} % a čistý (po nákladoch, dani a mesiaci bez nájomníka) ${nf(v.net ?? 0, 1)} % ročne.${v.monthlyCF != null ? ` S hypotékou vám po splátke ${v.monthlyCF >= 0 ? `zostane ~${eur(v.monthlyCF)}` : `bude chýbať ~${eur(-v.monthlyCF)}`} mesačne.` : ""}`);
      if (v.irr10 != null) out.push(`Celková výnosnosť za 10 rokov vrátane predaja na konci (IRR) ~${nf(v.irr10, 1)} % ročne — číslo, ktoré sa dá porovnať s vkladom alebo dlhopismi.`);
      if (v.offer) out.push(`Rozumná úvodná ponuka je ${eur(v.offer.low)} – ${eur(v.offer.high)}; argumenty sú nižšie. Konečná cena závisí od rokovania.`);
      if (v.residual) out.push(v.residual.land > 0 ? `Pre developera: po odpočítaní nákladov výstavby a zisku zostáva na pozemok ~${eur(v.residual.land)} — vyššiu cenu developer spravidla nezaplatí.` : "Pre developera: podľa regulatívu a dnešných cien bytov by projekt na pozemku nevyšiel so ziskom — hodnota pozemku pre bytovú výstavbu je nízka.");
      break;
    }
    case "obec": {
      const ob = fact(c, "obec", `ku:${kod}`);
      const t = num(ob?.obyv_trend_10r_pct);
      if (t != null) out.push(`Za 10 rokov sa počet obyvateľov obce ${t >= 0 ? "zvýšil" : "znížil"} o ${nf(Math.abs(t), 1)} %. Rastúce obce majú spravidla stabilnejší dopyt po bývaní a ceny.`);
      if (num(ob?.dlh_pomer_pct) != null) out.push(`Dlh obce je ${nf(num(ob?.dlh_pomer_pct) as number, 1)} % jej bežných príjmov — zadlženosť ovplyvňuje, koľko obec investuje do ciest, kanalizácie a škôl.`);
      break;
    }
    case "overit": {
      const n = checklist(d).length;
      out.push(`Zoznam obsahuje ${n} krokov, ktoré vyplynuli z tohto listu. Najdôležitejšie je overiť aktuálny výpis z LV, prístup, územný plán a ťarchy — pred podpisom zmluvy alebo zaplatením zálohy.`);
      break;
    }
    case "zdroje": {
      const cm = completeness(d);
      out.push(`List obsahuje údaje z ${cm.have} z ${cm.total} oblastí. Pri každej kapitole je uvedený zdroj a dátum; ak údaj chýba, znamená to „nevieme“, nie „je to v poriadku“.`);
      break;
    }
  }
  return out.filter(Boolean);
}

/** Jedna veta pod semaforom pre zhrnutie (koľko je v poriadku / pozor / riziko). */
export function lightsSentence(d: SheetData): string {
  const l = semafor(d);
  const n = (s: string) => l.filter((x) => x.state === s).length;
  return `Z ${l.length} oblastí je ${n("ok")} v poriadku, ${n("warn")} vyžaduje pozornosť, ${n("bad")} je rizikových a ${n("unknown")} nevieme posúdiť.`;
}
