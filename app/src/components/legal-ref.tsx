import { Link } from "@tanstack/react-router";
import { legalById, citeLabel } from "../lib/legal";

// Inline „§" odkaz na právny referent — pri pojme v UI/dokumente. Tooltip nesie citáciu + zhrnutie.
export function LegalRef({ id, className = "" }: { id: string; className?: string }) {
  const e = legalById(id);
  if (!e) return null;
  const tip = `${e.term} — ${e.refs.map(citeLabel).join("; ")}.\n${e.summary}`;
  return (
    <Link
      to="/pravny-referent"
      hash={id}
      title={tip}
      aria-label={`Právny referent: ${e.term}`}
      className={
        "ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-line text-[10px] leading-none text-muted align-middle hover:border-green hover:text-green " +
        className
      }
    >
      §
    </Link>
  );
}
