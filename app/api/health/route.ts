import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Usado por useConnectionStatus (components/layout/connection-status.tsx)
// para saber si de verdad se puede vender ahora mismo — no solo si hay
// WiFi (navigator.onLine no distingue "conectado a la red" de "el
// servidor/la base de datos están vivos").
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
