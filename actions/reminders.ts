"use server";

import { safeAction } from "@/lib/safe-action";
import { revalidatePath } from "next/cache";
import type { ReminderAction, ReminderKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_ID } from "@/lib/constants";
import { getSessionEmployeeId, SessionExpiredError } from "@/lib/session";
import { requireAdminRole } from "@/lib/permissions";

const KINDS: ReminderKind[] = ["CAFE_TE_EXTRANAMOS", "PET_SHOP_RESURTIDO"];
const ACTIONS: ReminderAction[] = ["ENVIADO", "OMITIDO"];

// Marca un recordatorio como atendido (lib/reminders.ts): "ENVIADO" al
// abrir el WhatsApp, "OMITIDO" si se decide no mandarlo. Pet Shop guarda un
// registro por producto incluido en el mensaje. Mismo acceso que la
// pantalla (Clientes es solo del rol ADMINISTRADOR).
export const recordReminder = safeAction(async function recordReminder(input: {
  customerId: string;
  kind: ReminderKind;
  productIds: string[];
  action: ReminderAction;
}) {
  const employeeId = await getSessionEmployeeId();
  if (!employeeId) throw new SessionExpiredError("Tu sesión expiró. Vuelve a ingresar tu PIN.");
  await requireAdminRole(employeeId, DEFAULT_BRANCH_ID);

  if (!KINDS.includes(input.kind) || !ACTIONS.includes(input.action)) throw new Error("Recordatorio inválido.");
  const productIds = input.kind === "PET_SHOP_RESURTIDO" ? Array.from(new Set(input.productIds)) : [];
  if (input.kind === "PET_SHOP_RESURTIDO" && productIds.length === 0) throw new Error("Recordatorio sin productos.");

  await prisma.customerReminder.createMany({
    data: (productIds.length > 0 ? productIds : [null]).map((productId) => ({
      customerId: input.customerId,
      kind: input.kind,
      productId,
      action: input.action,
      employeeId,
    })),
  });
  revalidatePath("/clientes/recordatorios");
  revalidatePath("/administracion");
});
