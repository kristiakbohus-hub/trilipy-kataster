// Fotografie k nehnuteľnosti z dokumentov (druh „foto") — zmenšené v prehliadači na JPEG ~900 px, aby sa zmestili
// do klientskej verzie listu (limit snímky) a rýchlo sa tlačili. 2026-11-13.
import { getDocumentData, listDocuments } from "./api/kataster.functions";

export type Photo = { name: string; src: string };

async function shrink(dataUrl: string, max = 900): Promise<string | null> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement("canvas"); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      const ctx = cv.getContext("2d"); if (!ctx) return res(null);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      res(cv.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => res(null);
    img.src = dataUrl;
  });
}

export async function loadPhotos(datasetId: string, lv: number | null, max = 4): Promise<Photo[]> {
  if (lv == null) return [];
  const docs = await listDocuments({ data: { datasetId, subjectType: "lv", subjectRef: String(lv) } }).catch(() => []);
  const fotos = docs.filter((x) => x.kind === "foto" && /^image\//.test(x.mime ?? "")).slice(0, max);
  const out: Photo[] = [];
  for (const f of fotos) {
    const r = await getDocumentData({ data: { id: f.id } }).catch(() => null);
    if (!r?.ok || !r.dataUrl) continue;
    const s = await shrink(r.dataUrl);
    if (s) out.push({ name: f.name, src: s });
  }
  return out;
}
