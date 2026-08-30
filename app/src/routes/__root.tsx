import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportHiggsfieldError } from "../lib/higgsfield-error-reporting";
import { RoleProvider } from "../lib/role-context";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { AppShell } from "../components/app-shell";
// Page metadata committed by the marketplace meta API, read at BUILD time.
import appMetaJson from "../app-meta.json";

declare const __HF_DESIGN_INSPECTOR__: boolean;

const DEFAULT_TITLE = "TRI LIPY KATASTER CORE";
const DEFAULT_DESCRIPTION =
  "Interný pracovný nástroj pre katastrálne dáta, mapový kontext, analýzu príležitostí a kontrolované reporty.";

type AppMeta = {
  og_title?: string | null;
  og_description?: string | null;
  og_image_url?: string | null;
  favicon_url?: string | null;
  og_video_url?: string | null;
};

const appMeta = appMetaJson as AppMeta;

const APP_HOST_ZONES = ["higgsfield.app", "higgsfield-dev.app"];

function toOwnAssetUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("/")) return value;
  try {
    const u = new URL(value);
    const isAppHost = APP_HOST_ZONES.some((zone) => u.hostname === zone || u.hostname.endsWith(`.${zone}`));
    if (isAppHost) return u.pathname + u.search;
    return value;
  } catch {
    return value;
  }
}

function buildHead(meta: AppMeta) {
  const title = meta.og_title ?? DEFAULT_TITLE;
  const description = meta.og_description ?? DEFAULT_DESCRIPTION;
  const ogImage = toOwnAssetUrl(meta.og_image_url);
  const favicon = toOwnAssetUrl(meta.favicon_url);
  const ogVideo = toOwnAssetUrl(meta.og_video_url);

  return {
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title },
      { name: "description", content: description },
      { name: "author", content: "TRI LIPY" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: ogImage ? "summary_large_image" : "summary" },
      ...(ogImage
        ? [
            { property: "og:image", content: ogImage },
            { name: "twitter:image", content: ogImage },
          ]
        : []),
      ...(ogVideo ? [{ property: "og:video", content: ogVideo }] : []),
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400;500;600&family=Montserrat:wght@300;400;500;600&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      ...(favicon ? [{ rel: "icon", href: favicon }] : []),
    ],
  };
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-cream px-4 text-center">
      <div className="text-3xl font-semibold text-fg">404</div>
      <p className="max-w-sm text-sm text-muted">Táto stránka neexistuje alebo bola presunutá.</p>
      <Link to="/" className="mt-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream">
        Späť na Mission Control
      </Link>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportHiggsfieldError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-cream px-4 text-center">
      <h1 className="text-xl font-semibold text-fg">Stránka sa nenačítala</h1>
      <p className="max-w-sm text-sm text-muted">Niečo sa pokazilo. Skús obnoviť alebo prejsť domov.</p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream"
        >
          Skúsiť znova
        </button>
        <a href="/" className="rounded-lg border border-line px-4 py-2 text-sm text-fg">Domov</a>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => buildHead(appMeta),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="sk" style={{ colorScheme: "light" }}>
      <head>
        <HeadContent />
      </head>
      <body className="bg-cream text-fg antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    if (!__HF_DESIGN_INSPECTOR__) return;
    void import("../module/design-inspector/runtime")
      .then(({ installHiggsfieldDesignInspector }) => installHiggsfieldDesignInspector())
      .catch((error) => {
        reportHiggsfieldError(
          error instanceof Error ? error : new Error("Failed to load design inspector"),
          { boundary: "higgsfield_design_inspector_import" },
        );
      });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RoleProvider>
          <Gate />
        </RoleProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function Gate() {
  const { authed } = useAuth();
  if (authed === null) return <Splash />;
  if (!authed) return <LoginScreen />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function Splash() {
  return <div className="grid min-h-dvh place-items-center bg-cream text-sm text-muted">Načítavam…</div>;
}

function LoginScreen() {
  const { signIn } = useAuth();
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const ok = await signIn(pass);
    if (!ok) setErr("Nesprávna prístupová fráza.");
    setBusy(false);
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-cream px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-line bg-paper p-8 text-center">
        <div className="mb-6 flex flex-col items-center">
          <img src="/tl-logo.png" alt="TRI LIPY" className="h-24 w-auto" />
          <div className="mt-3 text-[10px] uppercase tracking-[0.3em] text-muted">Kataster Core</div>
        </div>
        <h1 className="font-display text-base font-semibold uppercase tracking-[0.15em] text-fg">Prihlásenie</h1>
        <p className="mt-1 text-sm text-muted">Interný pracovný nástroj — prístup nie je anonymný.</p>
        <input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="Prístupová fráza"
          autoFocus
          className="mt-4 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-fg outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={busy}
          className="mt-3 w-full rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream disabled:opacity-60"
        >
          {busy ? "Prihlasujem…" : "Prihlásiť sa"}
        </button>
        {err ? <div className="mt-2 text-xs" style={{ color: "#9c4a40" }}>{err}</div> : null}
        <div className="mt-4 rounded-md border border-line bg-surface-2/50 p-2.5 text-[11px] leading-relaxed text-muted">
          <span className="font-medium text-fg">Demo prístup:</span> fráza <code className="rounded bg-surface-2 px-1">trilipy</code>. Ide o
          demo credential — <span style={{ color: "#9a7b3e" }}>blocked_for_handoff</span>, pred odovzdaním rotovať.
        </div>
      </form>
    </div>
  );
}
