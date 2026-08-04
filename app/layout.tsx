import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nomada Café POS",
  description: "Punto de venta para Nomada Café",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
