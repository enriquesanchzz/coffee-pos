import type { ReminderKind } from "@prisma/client";
import { prisma } from "./prisma";
import { DEFAULT_BRANCH_ID } from "./constants";
import { zonedDateKey } from "./time";
import type { BusinessSettings } from "./settings-shared";
import { toWhatsAppNumber } from "./utils";

// Recordatorios por WhatsApp (Clientes → Recordatorios). No se mandan
// solos: no hay WhatsApp Business API todavía, así que la pantalla arma el
// link wa.me con el mensaje y quien atiende lo manda con un clic.
//
// - Cafetería ("te extrañamos"): el cliente lleva N días sin una compra de
//   Cafetería (Configuración → Recordatorios).
// - Pet Shop (resurtido): pasaron N días desde que compró un producto de
//   Pet Shop. Cada producto puede tener sus propios días y mensaje
//   (Product.reminderDays/reminderMessage); 0 días = nunca para ese.
//
// Se calcula al abrir la pantalla, no hay tarea de fondo. Un recordatorio
// atendido (mandado u omitido, CustomerReminder) no vuelve a salir hasta que
// el cliente compre otra vez: solo cuenta lo atendido después de la última
// compra.

export type DueReminder = {
  key: string;
  kind: ReminderKind;
  customerId: string;
  customerName: string;
  phone: string | null;
  // Días desde la última compra (Cafetería) o desde la más reciente de los
  // productos que toca recordar (Pet Shop).
  daysSince: number;
  products: { id: string; name: string; daysSince: number }[];
  message: string;
  whatsAppHref: string | null;
};

function daysBetween(fromKey: string, toKey: string) {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

// "a", "a y b", "a, b y c"
export function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

export function fillReminderTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{(cliente|negocio|productos|mascota)\}/g, (match, name: string) => values[name] ?? match);
}

function waHref(phone: string | null, message: string) {
  const digits = phone ? toWhatsAppNumber(phone) : null;
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : null;
}

// `settings` = getBusinessSettings() (lib/settings.ts es server-only; así
// también lo pueden correr las pruebas e2e).
export type ReminderSettings = Pick<
  BusinessSettings,
  "businessName" | "reminderCafeDays" | "reminderCafeMessage" | "reminderPetShopDays" | "reminderPetShopMessage"
>;

export async function getDueReminders(settings: ReminderSettings, now: Date = new Date()): Promise<DueReminder[]> {
  const todayKey = zonedDateKey(now);
  const due: DueReminder[] = [];

  const [cafeVisits, petPurchases, handled] = await Promise.all([
    settings.reminderCafeDays > 0
      ? // Última compra de Cafetería por cliente: una venta cobrada con al
        // menos una línea que no es de Pet Shop (los paquetes/combos son de
        // la cafetería).
        prisma.$queryRaw<{ customerId: string; last: Date }[]>`
          SELECT s."customerId", MAX(s."createdAt") AS "last"
          FROM "sales" s
          WHERE s."branchId" = ${DEFAULT_BRANCH_ID}
            AND s."status" = 'COMPLETADA'
            AND s."customerId" IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM "sale_items" si
              LEFT JOIN "product_variants" pv ON pv."id" = si."productVariantId"
              LEFT JOIN "products" p ON p."id" = pv."productId"
              LEFT JOIN "product_categories" pc ON pc."id" = p."categoryId"
              WHERE si."saleId" = s."id" AND (si."productVariantId" IS NULL OR pc."businessUnit" = 'CAFE')
            )
          GROUP BY s."customerId"`
      : Promise.resolve([]),
    settings.reminderPetShopDays > 0
      ? prisma.$queryRaw<
          { customerId: string; productId: string; name: string; reminderDays: number | null; reminderMessage: string | null; last: Date }[]
        >`
          SELECT s."customerId", p."id" AS "productId", p."name", p."reminderDays", p."reminderMessage",
                 MAX(s."createdAt") AS "last"
          FROM "sales" s
          JOIN "sale_items" si ON si."saleId" = s."id"
          JOIN "product_variants" pv ON pv."id" = si."productVariantId"
          JOIN "products" p ON p."id" = pv."productId"
          JOIN "product_categories" pc ON pc."id" = p."categoryId"
          WHERE s."branchId" = ${DEFAULT_BRANCH_ID}
            AND s."status" = 'COMPLETADA'
            AND s."customerId" IS NOT NULL
            AND pc."businessUnit" = 'PET_SHOP'
            AND p."isActive" = true
          GROUP BY s."customerId", p."id"`
      : Promise.resolve([]),
    prisma.customerReminder.groupBy({
      by: ["customerId", "kind", "productId"],
      _max: { createdAt: true },
    }),
  ]);

  const handledAt = new Map(
    handled.map((h) => [`${h.customerId}|${h.kind}|${h.productId ?? ""}`, h._max.createdAt ?? new Date(0)])
  );
  const wasHandled = (customerId: string, kind: ReminderKind, productId: string | null, last: Date) => {
    const at = handledAt.get(`${customerId}|${kind}|${productId ?? ""}`);
    return at !== undefined && at >= last;
  };

  const cafeDue = cafeVisits
    .map((v) => ({ ...v, daysSince: daysBetween(zonedDateKey(v.last), todayKey) }))
    .filter((v) => v.daysSince >= settings.reminderCafeDays && !wasHandled(v.customerId, "CAFE_TE_EXTRANAMOS", null, v.last));

  type PetDue = (typeof petPurchases)[number] & { daysSince: number };
  const petDueByCustomer = new Map<string, PetDue[]>();
  for (const p of petPurchases) {
    const days = p.reminderDays ?? settings.reminderPetShopDays;
    if (days <= 0) continue;
    const daysSince = daysBetween(zonedDateKey(p.last), todayKey);
    if (daysSince < days || wasHandled(p.customerId, "PET_SHOP_RESURTIDO", p.productId, p.last)) continue;
    const list = petDueByCustomer.get(p.customerId) ?? [];
    list.push({ ...p, daysSince });
    petDueByCustomer.set(p.customerId, list);
  }

  const customerIds = Array.from(new Set([...cafeDue.map((c) => c.customerId), ...petDueByCustomer.keys()]));
  if (customerIds.length === 0) return [];
  const customers = await prisma.customer.findMany({
    where: { id: { in: customerIds } },
    select: { id: true, name: true, phone: true, pets: { select: { name: true }, orderBy: { createdAt: "asc" } } },
  });
  const customerById = new Map(customers.map((c) => [c.id, c]));

  for (const v of cafeDue) {
    const c = customerById.get(v.customerId);
    if (!c) continue;
    const message = fillReminderTemplate(settings.reminderCafeMessage, {
      cliente: c.name.split(" ")[0],
      negocio: settings.businessName,
    });
    due.push({
      key: `CAFE|${c.id}`,
      kind: "CAFE_TE_EXTRANAMOS",
      customerId: c.id,
      customerName: c.name,
      phone: c.phone,
      daysSince: v.daysSince,
      products: [],
      message,
      whatsAppHref: waHref(c.phone, message),
    });
  }

  for (const [customerId, items] of petDueByCustomer) {
    const c = customerById.get(customerId);
    if (!c) continue;
    items.sort((a, b) => a.daysSince - b.daysSince || a.name.localeCompare(b.name));
    const values = {
      cliente: c.name.split(" ")[0],
      negocio: settings.businessName,
      mascota: c.pets.length > 0 ? joinNames(c.pets.map((p) => p.name)) : "tu mascota",
    };
    // Un solo WhatsApp por cliente: los productos con el mensaje general
    // van juntos en uno, y cada producto con mensaje propio agrega el suyo.
    const general = items.filter((i) => !i.reminderMessage?.trim());
    const parts: string[] = [];
    if (general.length > 0) {
      parts.push(
        fillReminderTemplate(settings.reminderPetShopMessage, { ...values, productos: joinNames(general.map((i) => i.name)) })
      );
    }
    for (const i of items) {
      if (i.reminderMessage?.trim()) parts.push(fillReminderTemplate(i.reminderMessage.trim(), { ...values, productos: i.name }));
    }
    const message = parts.join("\n\n");
    due.push({
      key: `PET|${c.id}`,
      kind: "PET_SHOP_RESURTIDO",
      customerId: c.id,
      customerName: c.name,
      phone: c.phone,
      daysSince: items[0].daysSince,
      products: items.map((i) => ({ id: i.productId, name: i.name, daysSince: i.daysSince })),
      message,
      whatsAppHref: waHref(c.phone, message),
    });
  }

  // Los que se pueden mandar primero; entre ellos, los más recientes (más
  // fácil que regresen).
  return due.sort(
    (a, b) =>
      Number(!a.whatsAppHref) - Number(!b.whatsAppHref) || a.daysSince - b.daysSince || a.customerName.localeCompare(b.customerName)
  );
}
