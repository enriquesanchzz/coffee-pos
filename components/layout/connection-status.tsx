"use client";

import { useEffect, useState } from "react";

const CHECK_INTERVAL_MS = 15000;
const CHECK_TIMEOUT_MS = 5000;

// Revisa /api/health (que sí toca la base) en vez de confiar solo en
// navigator.onLine — eso último solo dice "hay WiFi", no "el servidor del
// café está vivo" (ver app/api/health/route.ts).
export function useConnectionStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/health", {
          cache: "no-store",
          signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
        });
        if (!cancelled) setOnline(res.ok);
      } catch {
        if (!cancelled) setOnline(false);
      }
    }

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    // Reacciona de inmediato a los eventos del navegador, sin esperar al
    // siguiente ciclo del interval.
    window.addEventListener("online", check);
    window.addEventListener("offline", check);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
    };
  }, []);

  return online;
}

// Indicador discreto — solo ocupa espacio cuando de verdad hay un
// problema, para no distraer en operación normal.
export function ConnectionBadge() {
  const online = useConnectionStatus();
  if (online) return null;
  return (
    <span
      role="status"
      className="flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-warning/20 px-2.5 py-1 text-xs font-medium text-warning dark"
    >
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-warning" aria-hidden="true" />
      Sin conexión
    </span>
  );
}
