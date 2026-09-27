import { Inter, Poppins, Lora } from "next/font/google";

// Fuentes reales autohospedadas por next/font (se descargan una sola vez en
// build/dev, no en cada request) para que "Redondeada"/"Serif" se vean
// realmente distintas sin depender de fuentes instaladas en el SO del
// dispositivo — los stacks de sistema (ui-rounded, etc.) solo funcionan en
// Apple/WebKit y en todo lo demás caen de vuelta al sans-serif por defecto.
export const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const fontRounded = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-rounded",
  display: "swap",
});

export const fontSerif = Lora({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const FONT_VARIABLE_CLASSES = `${fontSans.variable} ${fontRounded.variable} ${fontSerif.variable}`;
