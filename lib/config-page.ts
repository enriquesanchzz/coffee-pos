import "server-only";
import { redirect } from "next/navigation";
import { requirePasswordSession, resolveRoleName } from "./session";
import { DEFAULT_BRANCH_ID } from "./constants";
import { getBusinessSettings } from "./settings";

// Guardia común de las pantallas de Configuración: sesión de
// Administración (email + password) y rol ADMINISTRADOR. Regresa también
// los ajustes ya resueltos para prellenar los formularios.
export async function loadConfigurationPage() {
  const actor = await requirePasswordSession();
  if (!actor) redirect("/administracion/login");
  if (resolveRoleName(actor, DEFAULT_BRANCH_ID) !== "ADMINISTRADOR") redirect("/pos");
  const settings = await getBusinessSettings();
  return { actor, settings };
}
