import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Stochastic Hedge Terminal",
  description: "Manual paper-trading hedge dashboard"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
