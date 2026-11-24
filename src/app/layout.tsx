import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { APP_ICON } from "@/lib/app-icon";

export const metadata: Metadata = { title: "Riki Maps", icons: { icon: APP_ICON, apple: APP_ICON } };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Before the first paint, or a dark page flashes light.
const KEPT_THEME = `try{var t=localStorage.getItem("riki-theme");`
  + `if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: KEPT_THEME }} /></head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
