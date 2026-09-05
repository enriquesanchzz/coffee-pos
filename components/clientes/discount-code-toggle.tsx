"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toggleDiscountCodeActive } from "@/actions/discounts";

export function DiscountCodeToggle({
  employeeId,
  discountCodeId,
  isActive,
}: {
  employeeId: string;
  discountCodeId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await toggleDiscountCodeActive({ employeeId, discountCodeId, isActive: !isActive });
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={isPending}>
      {isActive ? "Desactivar" : "Activar"}
    </Button>
  );
}
