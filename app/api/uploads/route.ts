import { NextResponse, type NextRequest } from "next/server";
import { getCurrentEmployee } from "@/lib/session";
import { storeImage, UPLOAD_MAX_BYTES } from "@/lib/uploads";

// Subida de fotos (ver lib/uploads.ts). Cualquier empleado con sesión: las
// fotos de mascotas las sube quien atiende en caja, no solo el admin. Quién
// puede *asignarla* a un producto o al logo lo siguen validando las Server
// Actions de cada pantalla.
export async function POST(request: NextRequest) {
  const employee = await getCurrentEmployee();
  if (!employee) return NextResponse.json({ error: "Tu sesión expiró. Vuelve a entrar." }, { status: 401 });

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return NextResponse.json({ error: "No se recibió ninguna imagen." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No se recibió ninguna imagen." }, { status: 400 });
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    return NextResponse.json({ error: "La imagen pesa más de 15 MB." }, { status: 413 });
  }

  try {
    const url = await storeImage(Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo guardar la imagen." }, { status: 400 });
  }
}
