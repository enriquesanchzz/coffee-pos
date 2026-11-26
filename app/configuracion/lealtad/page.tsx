import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { loadConfigurationPage } from "@/lib/config-page";
import { activePrograms, PROGRAM_LABELS } from "@/lib/loyalty-points";
import { variantLabel } from "@/lib/coupon-label";
import { ConfigSectionPage } from "@/components/configuracion/config-section-page";
import { LoyaltySettingsForm } from "@/components/configuracion/loyalty-settings-form";
import { BirthdaySettingsForm } from "@/components/configuracion/birthday-settings-form";
import { LoyaltyTiersEditor } from "@/components/configuracion/loyalty-tiers-editor";

export const metadata: Metadata = { title: "Configuración · Lealtad" };

const SCOPE_LABELS = { CAFE: " en Cafetería", PET_SHOP: " en Pet Shop", GLOBAL: "" } as const;

export default async function ConfiguracionLealtadPage() {
  const { actor, settings } = await loadConfigurationPage();
  const programs = activePrograms(settings.loyaltyMode);
  const [tiers, balances, variants] = await Promise.all([
    prisma.loyaltyTier.findMany({
      orderBy: { pointsRequired: "asc" },
      include: { rewardVariant: { include: { product: { select: { name: true } } } } },
    }),
    prisma.loyaltyBalance.findMany({ where: { program: { in: programs } }, select: { program: true, points: true } }),
    prisma.productVariant.findMany({
      where: { isActive: true, product: { isActive: true } },
      include: { product: { select: { name: true } } },
      orderBy: [{ product: { name: "asc" } }, { name: "asc" }],
    }),
  ]);

  // Clientes en cada nivel hoy: puntos entre el umbral del nivel y el del
  // siguiente de su mismo programa.
  function customerCount(tierId: string) {
    const tier = tiers.find((t) => t.id === tierId)!;
    const next = tiers.find((t) => t.program === tier.program && t.pointsRequired > tier.pointsRequired);
    return balances.filter(
      (b) => b.program === tier.program && b.points >= tier.pointsRequired && (!next || b.points < next.pointsRequired)
    ).length;
  }

  return (
    <ConfigSectionPage
      employeeName={actor.name}
      title="Lealtad"
      description="Puntos por compra, niveles con recompensa, cupón de bienvenida y cupones de cumpleaños."
    >
      <LoyaltySettingsForm initial={settings} />
      <LoyaltyTiersEditor
        programs={programs.map((program) => ({
          program,
          label: program === "GLOBAL" ? "Puntos globales" : PROGRAM_LABELS[program],
          scopeLabel: SCOPE_LABELS[program],
        }))}
        tiers={tiers.map((t) => ({
          id: t.id,
          program: t.program,
          name: t.name,
          pointsRequired: t.pointsRequired,
          benefits: t.benefits,
          rewardType: t.rewardType,
          rewardPercent: t.rewardPercent,
          rewardVariantId: t.rewardVariantId,
          rewardVariantLabel: t.rewardVariant ? `${t.rewardVariant.product.name} (${variantLabel(t.rewardVariant)})` : null,
          rewardValidDays: t.rewardValidDays,
          customerCount: customerCount(t.id),
        }))}
        variantOptions={variants.map((v) => ({
          value: v.id,
          label: `${v.product.name} (${variantLabel(v)})`,
          description: `$${v.price.toFixed(2)}`,
        }))}
      />
      <BirthdaySettingsForm initial={settings} />
    </ConfigSectionPage>
  );
}
