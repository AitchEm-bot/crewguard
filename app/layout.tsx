import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CrewGuard — heat protection agent for outdoor crews",
  description:
    "An autonomous agent that keeps outdoor workers under a safe heat-strain limit using FortyGuard's 20 m hourly temperature grid: reroutes, schedules shaded recovery, and logs every action into a compliance ledger.",
  applicationName: "CrewGuard",
};

export const viewport: Viewport = {
  themeColor: "#b3cbca",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
