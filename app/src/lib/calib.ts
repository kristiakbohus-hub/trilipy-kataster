// Fáza 5: klientske čítanie kalibrácie (dev náklady/ceny/m²) pre GDV výpočty v UI.
// Server drží pravdu (calib tabuľka); tu ju načítame raz (module cache) a poskytneme ako DevOpts.
// Kým sa načíta / pri chybe → kódové defaulty (DEV_DEFAULTS / DEV_LOW_DEFAULTS).
import { useEffect, useState } from "react";
import { getCalib } from "./api/kataster.functions";
import { DEV_DEFAULTS, type DevOpts } from "./development";

export const DEV_LOW_DEFAULTS: DevOpts = { m2PerByt: 110, nakladyEurM2Hpp: 1500, predajEurM2: 1900 };
export type CalibDev = { normal: DevOpts; low: DevOpts };

let cache: Record<string, number> | null = null;
let inflight: Promise<Record<string, number>> | null = null;

function loadCalibMap(): Promise<Record<string, number>> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = getCalib()
      .then((rows) => {
        const m: Record<string, number> = {};
        for (const r of rows) m[r.key] = r.value;
        cache = m;
        return m;
      })
      .catch(() => ({}));
  }
  return inflight;
}

function devFromMap(m: Record<string, number>): CalibDev {
  const g = (k: string, d: number) => (Number.isFinite(m[k]) ? m[k] : d);
  return {
    normal: {
      m2PerByt: g("dev.m2_per_byt", DEV_DEFAULTS.m2PerByt),
      nakladyEurM2Hpp: g("dev.naklady_eur_m2", DEV_DEFAULTS.nakladyEurM2Hpp),
      predajEurM2: g("dev.predaj_eur_m2", DEV_DEFAULTS.predajEurM2),
    },
    low: {
      m2PerByt: g("dev.low_m2_per_byt", DEV_LOW_DEFAULTS.m2PerByt),
      nakladyEurM2Hpp: g("dev.low_naklady_eur_m2", DEV_LOW_DEFAULTS.nakladyEurM2Hpp),
      predajEurM2: g("dev.low_predaj_eur_m2", DEV_LOW_DEFAULTS.predajEurM2),
    },
  };
}

// Hook: kalibrované dev opts (normal + low). Kým sa načíta, vráti kódové defaulty.
export function useCalibDev(): CalibDev {
  const [dev, setDev] = useState<CalibDev>(() => (cache ? devFromMap(cache) : { normal: DEV_DEFAULTS, low: DEV_LOW_DEFAULTS }));
  useEffect(() => {
    let alive = true;
    void loadCalibMap().then((m) => { if (alive) setDev(devFromMap(m)); });
    return () => { alive = false; };
  }, []);
  return dev;
}

// Sync verzia pre non-hook kontexty (napr. export do Wordu) — posledné načítané alebo defaulty.
export function calibDevSync(): CalibDev {
  return cache ? devFromMap(cache) : { normal: DEV_DEFAULTS, low: DEV_LOW_DEFAULTS };
}

// Preload (volať pri mount stránky) aby sync verzia bola teplá.
export function preloadCalib(): void { void loadCalibMap(); }
