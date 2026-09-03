// Doménové typy, roly a pravidlá pre TRI LIPY KATASTER CORE.
// Zdieľané klientom aj serverom (žiadne server-only importy tu).

// Registrované navigačné cesty (bez dynamických) — pre typovaný <Link to>.
export type AppPath =
  | "/"
  | "/mapa"
  | "/datasety"
  | "/browser"
  | "/vlastnici"
  | "/zoning"
  | "/cases"
  | "/import"
  | "/reporty"
  | "/prilezitosti"
  | "/prieskum"
  | "/trhova-historia"
  | "/deal-radar"
  | "/deals"
  | "/pravny-referent"
  | "/ceny"
  | "/system";

export type Role =
  | "admin"
  | "manager"
  | "geodet"
  | "analytik"
  | "real_estate"
  | "viewer"
  | "external_readonly";

export const ROLES: { id: Role; label: string; desc: string }[] = [
  { id: "admin", label: "Admin", desc: "Plný prístup, onboarding, podpis." },
  { id: "manager", label: "Manažér", desc: "Review, podpis reportov, prehľad." },
  { id: "geodet", label: "Geodet", desc: "Geometria, review hraníc, owners." },
  { id: "analytik", label: "Analytik", desc: "Discovery, reporty, owners." },
  { id: "real_estate", label: "Real estate", desc: "Iba súhrny a príležitosti (bez owner PII)." },
  { id: "viewer", label: "Viewer", desc: "Iba čítanie súhrnov." },
  { id: "external_readonly", label: "External read-only", desc: "Obmedzené externé čítanie." },
];

export const ROLE_LABEL: Record<Role, string> = ROLES.reduce(
  (a, r) => ((a[r.id] = r.label), a),
  {} as Record<Role, string>,
);

export const canSeeOwners = (r: Role) =>
  (["admin", "manager", "geodet", "analytik"] as Role[]).includes(r);

// Úroveň prístupu k owner-sensitive obsahu (vynucované na serveri):
// full = mená + podiely; summary = len počty (real_estate); denied = nič (viewer/external).
export type OwnerAccess = "full" | "summary" | "denied";
export function ownerAccess(r: Role): OwnerAccess {
  if (canSeeOwners(r)) return "full";
  if (r === "real_estate") return "summary";
  return "denied";
}

export interface Lv {
  lv_no: number;
  co_owners: number;
}
export interface LvOwner {
  id: number;
  lv_no: number;
  name: string;
  share: string | null;
  is_company: number;
  // Owner-sensitive (server ich vydá len pri access=full):
  birth_date?: string | null;
  title?: string | null;
  born_name?: string | null;
  ico?: string | null;
  addr_obec?: string | null;
  addr_cislo?: string | null;
  addr_psc?: string | null;
}
export const canExport = (r: Role) =>
  (["admin", "manager", "analytik"] as Role[]).includes(r);
export const canSign = (r: Role) => (["admin", "manager"] as Role[]).includes(r);
export const canRunPipeline = (r: Role) =>
  (["admin", "manager", "geodet", "analytik"] as Role[]).includes(r);

export type DatasetStatus = "ready" | "ready_with_warnings" | "blocked";
export type GeometryQuality = "verified" | "derived" | "review";

export interface Dataset {
  id: string;
  ku_code: string;
  ku_name: string;
  region: string;
  kn_type: string;
  status: DatasetStatus;
  geometry_coverage: number;
  canonical_confidence: number;
  import_version: string;
  updated_at: string;
  note: string | null;
}

export interface Parcel {
  id: string;
  dataset_id: string;
  parcel_no: string;
  kn_type: string;
  area_m2: number;
  use_type: string | null;
  lv_no: number | null;
  geometry_quality: GeometryQuality;
  centroid_lat: number | null;
  centroid_lng: number | null;
  geometry_json: string | null;
  celok?: number | null;        // evidenčný list (celok) — meno užívateľa je gatované cez celky
  settled?: number | null;      // 1=vysporiadaná, 0=má E-KN pod sebou
  ekn_ref?: string | null;      // referencia na E-KN parcelu (pri nevysporiadanej)
  bpej?: string | null;         // 7-cifrový BPEJ kód (prevažujúca zóna)
  bpej_skupina?: number | null; // skupina kvality 1–9 (Príloha č.3 z.220/2004)
  odnatie_eur?: number | null;  // sadzba €/m² za TRVALÉ odňatie (NV 58/2013); dočasné = sadzba/100 za rok
}

// ZBGIS search bar — výsledky hľadania v datasete (parcela / LV / vlastník) → parcel_id na fokus mapy
export interface SearchParcel {
  id: string; parcel_no: string; kn_type: string; area_m2: number;
  use_type: string | null; lv_no: number | null; centroid_lat: number | null; centroid_lng: number | null;
}
export interface SearchLv { lv_no: number; n: number; parcel_id: string; }
export interface SearchOwner { name: string; lv_no: number; parcel_id: string | null; }

// Cenník odvodov za odňatie poľnohospodárskej pôdy (NV 58/2013 Z.z.) — skupina → €/m²
export interface BpejCennik {
  skupina: number;              // 1..9
  eur_m2: number;               // trvalé odňatie €/m²
  eur_m2_docasne: number | null;// dočasné odňatie €/m²/rok (= trvalé/100)
  popis: string | null;
}

// Orientačná trhová hodnota pozemku (€/m²) podľa druhu a umiestnenia — HRUBÝ screening, NIE znalecký posudok.
// Hodnoty sú konzervatívne indikatívne; reálna cena závisí od lokality, prístupu, ÚP a dopytu.
const MARKET_EUR_M2: { re: RegExp; base: number }[] = [
  { re: /zastavan|nádvor|nadvor/i, base: 35 },
  { re: /záhrad|zahrad/i, base: 18 },
  { re: /ostatn/i, base: 8 },
  { re: /vinic|chmeľ|chmel|ovocn/i, base: 6 },
  { re: /orná|orna/i, base: 2.5 },
  { re: /trvalé trávne|trvale travne|ttp|trávny|travny/i, base: 1.5 },
  { re: /vodn/i, base: 1 },
  { re: /lesn/i, base: 0.7 },
];
export function marketValueEur(useType: string | null | undefined, placement: string | null | undefined, areaM2: number): { rate: number; total: number } {
  const t = (useType ?? "").toLowerCase();
  let base = 3; // default
  for (const m of MARKET_EUR_M2) if (m.re.test(t)) { base = m.base; break; }
  const inTown = /v zastavanom/i.test(placement ?? "");
  const mult = inTown ? 1.6 : 0.85;
  const rate = Math.round(base * mult * 10) / 10;
  return { rate, total: Math.round(areaM2 * rate) };
}

export interface Owner {
  id: number;
  parcel_id: string;
  display_label: string;
  share: string | null;
  lv_no: number | null;
  protected: number;
}

export interface Opportunity {
  id: number;
  dataset_id: string;
  parcel_id: string | null;
  kind: string;
  score: number;
  status: string;
  rationale: string | null;
  est_price_eur: number | null;
}

export interface ReportRow {
  id: number;
  dataset_id: string;
  kind: string;
  title: string;
  status: string;
  audit_hash: string | null;
  created_at: string;
}

export interface ImportJob {
  id: number;
  dataset_id: string;
  step_no: number;
  step: string;
  state: string;
  message: string | null;
  created_at: string;
}

export interface AuditRow {
  id: number;
  dataset_id: string | null;
  action: string;
  actor_role: string;
  detail: string | null;
  created_at: string;
}

// ——— Vizuálne mapovania (hex → inline style, bezpečné pred purgingom) ———
export const STATUS_META: Record<
  string,
  { label: string; color: string; hint: string }
> = {
  ready: { label: "Ready", color: "#5b7a58", hint: "Pripravené na interné použitie." },
  ready_with_warnings: {
    label: "Ready · warnings",
    color: "#9a7b3e",
    hint: "Použiteľné so zobrazenými obmedzeniami.",
  },
  blocked: { label: "Blocked", color: "#9c4a40", hint: "Blokované — potrebný ďalší krok." },
};

export const QUALITY_META: Record<GeometryQuality, { label: string; color: string }> = {
  verified: { label: "Overená", color: "#5b7a58" },
  derived: { label: "Odvodená", color: "#8a8a8a" },
  review: { label: "Na review", color: "#6b6f86" },
};

export const OPP_META: Record<string, { label: string; color: string }> = {
  new: { label: "Nová", color: "#6b6f86" },
  review: { label: "Review", color: "#9a7b3e" },
  qualified: { label: "Kvalifikovaná", color: "#5b7a58" },
  blocked: { label: "Blokovaná", color: "#9c4a40" },
};

export const REPORT_STATUS_META: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "#8a8a8a" },
  review: { label: "Review", color: "#9a7b3e" },
  signed: { label: "Podpísaný", color: "#5b7a58" },
};

export const JOB_STATE_META: Record<string, { label: string; color: string }> = {
  done: { label: "Hotovo", color: "#5b7a58" },
  running: { label: "Beží", color: "#6b6f86" },
  failed: { label: "Zlyhalo", color: "#9c4a40" },
  blocked: { label: "Blokované", color: "#9c4a40" },
  skipped: { label: "Preskočené", color: "#8a8a8a" },
};

export const REPORT_KIND_LABEL: Record<string, string> = {
  evidence_list: "Evidenčný list",
  parcel_pack: "Parcel report pack",
  map_sheet: "Mapový list",
};

// ——— Mapa 2.0: miestne názvy + WMS register ———
export interface MapText {
  lat: number;
  lng: number;
  txt: string;
}
export interface WmsSource {
  id: string;
  name: string;
  url: string;
  layers: string;
  format: string;
}

// ——— Fáza 3: Zoning/ÚP, Access Review, Cases ———
export interface ZoningSource {
  id: number;
  dataset_id: string;
  name: string;
  kind: string;
  source_date: string | null;
  note: string | null;
}
export interface ZoningFinding {
  id: number;
  dataset_id: string;
  category: string; // zoning | access
  target: string | null;
  label: string;
  status: string;
  note: string | null;
  source_ref: string | null;
  created_at: string;
}
export interface Case {
  id: number;
  dataset_id: string;
  title: string;
  kind: string;
  status: string;
  owner_role: string | null;
  linked_ref: string | null;
  next_steps: string | null;
  created_at: string;
}
export interface CaseNote {
  id: number;
  case_id: number;
  author_role: string | null;
  body: string;
  created_at: string;
}

export const ZONING_STATUS_META: Record<string, { label: string; color: string }> = {
  screening: { label: "Screening", color: "#8a8a8a" },
  possible: { label: "Možný", color: "#5b7a58" },
  unclear: { label: "Nejasný", color: "#9a7b3e" },
  review: { label: "Na review", color: "#6b6f86" },
  unknown: { label: "Neznámy", color: "#8a8a8a" },
};

export const CASE_STATUS_META: Record<string, { label: string; color: string }> = {
  open: { label: "Otvorený", color: "#6b6f86" },
  review: { label: "Review", color: "#9a7b3e" },
  done: { label: "Uzavretý", color: "#5b7a58" },
};

export const CASE_KIND_LABEL: Record<string, string> = {
  vysporiadanie: "Vysporiadanie",
  screening: "Screening",
  pristup: "Prístup",
  ine: "Iné",
};

export function eur(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export function m2(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("sk-SK").format(n) + " m²";
}

// ——— Deal pipeline (Bod 2b) ———
export const DEAL_STATUS: Record<string, { label: string; color: string }> = {
  new: { label: "Nová", color: "#8a8a8a" },
  checking: { label: "Preveruje sa", color: "#9a7b3e" },
  contacted: { label: "Kontaktovaný", color: "#6b6f86" },
  negotiation: { label: "Rokovanie", color: "#5b7a58" },
  closed_won: { label: "Uzavretá", color: "#3f6b3a" },
  closed_lost: { label: "Zamietnutá", color: "#9c4a40" },
};
export const DEAL_STATUS_ORDER = ["new", "checking", "contacted", "negotiation", "closed_won", "closed_lost"] as const;
export const TASK_STATE: Record<string, { label: string; color: string }> = {
  pending: { label: "Čaká", color: "#8a8a8a" },
  contacted: { label: "Oslovený", color: "#9a7b3e" },
  agreed: { label: "Súhlasí", color: "#5b7a58" },
  signed: { label: "Podpísané", color: "#3f6b3a" },
  declined: { label: "Odmietol", color: "#9c4a40" },
};
export const TASK_STATE_ORDER = ["pending", "contacted", "agreed", "signed", "declined"] as const;
