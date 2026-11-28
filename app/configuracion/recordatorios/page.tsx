import { redirect } from "next/navigation";

// Se movió fuera de Configuración (ver docs/CONTINUE.md): se conserva la
// ruta vieja para enlaces guardados.
export default function MovedPage() {
  redirect("/clientes/recordatorios#ajustes-recordatorios");
}
