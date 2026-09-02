"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DateRangePicker({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [fromValue, setFromValue] = useState(from);
  const [toValue, setToValue] = useState(to);

  function apply() {
    const params = new URLSearchParams({ from: fromValue, to: toValue });
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="from">Desde</Label>
        <Input id="from" type="date" value={fromValue} onChange={(e) => setFromValue(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="to">Hasta</Label>
        <Input id="to" type="date" value={toValue} onChange={(e) => setToValue(e.target.value)} />
      </div>
      <Button onClick={apply}>Aplicar</Button>
    </div>
  );
}
