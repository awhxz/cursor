import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Дашборд руководителя",
  description: "Управленческий дашборд на данных Google Sheets",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
