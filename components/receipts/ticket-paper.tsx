// Envoltura visual del ticket — angosta y monoespaciada, como una cinta
// térmica de 80mm. @page recorta los márgenes del navegador al imprimir
// para que no salga el encabezado/pie que agrega el navegador por default.
export function TicketPaper({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`@page { size: 80mm auto; margin: 4mm; }`}</style>
      <div className="mx-auto max-w-xs border border-dashed border-border p-4 font-mono text-xs print:border-0 print:p-0">
        {children}
      </div>
    </>
  );
}

export function TicketDivider() {
  return <div className="my-2 border-t border-dashed border-border" />;
}

export function TicketRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${bold ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
