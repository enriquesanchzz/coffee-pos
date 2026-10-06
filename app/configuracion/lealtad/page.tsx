import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { loadConfigurationPage } from "@/lib/config-page";
import { ConfigSectionPage } from "@/components/configuracion/config-section-page";
import { LoyaltySettingsForm } from "@/components/configuracion/loyalty-settings-form";
import { LoyaltyTiersEditor } from "@/components/configuracion/loyalty-tiers-editor";

export const metadata: Metadata = { title: "Configuración · Lealtad" };

export default async function ConfiguracionLealtadPage() {
  const { actor, settings } = await loadConfigurationPage();
  const tiers = await prisma.loyaltyTier.findMany({
    orderBy: { minLifetimeStamps: "asc" },
    include: { _count: { select: { cards: true } } },
  });

  return (
    <ConfigSectionPage
      employeeName={actor.name}
      title="Lealtad"
      description="Sellos, cupón de bienvenida y niveles de cliente."
    >
      <LoyaltySettingsForm initial={settings} />
      <LoyaltyTiersEditor
        tiers={tiers.map((t) => ({
          id: t.id,
          name: t.name,
          minLifetimeStamps: t.minLifetimeStamps,
          benefits: t.benefits,
          cardCount: t._count.cards,
        }))}
      />
    </ConfigSectionPage>
  );
}
