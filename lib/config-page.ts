import "server-only";
import { requireAdminPage } from "./admin-page";
import { getBusinessSettings } from "./settings";

// Guardia común de las pantallas de Configuración: sesión de
// Administración (email + password) y rol ADMINISTRADOR. Regresa también
// los ajustes ya resueltos para prellenar los formularios.
export async function loadConfigurationPage() {
  const actor = await requireAdminPage("/configuracion");
  const settings = await getBusinessSettings();
  return { actor, settings };
}
