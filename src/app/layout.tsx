import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pikachu",
  description: "Your personal engineering memory system.",
};

const NAV = [
  { href: "/", label: "Dashboard", icon: "◆" },
  { href: "/learnings", label: "Learnings", icon: "≣" },
  { href: "/explain", label: "Explain & Save", icon: "✶" },
  { href: "/review", label: "Review", icon: "↻" },
  { href: "/search", label: "Search", icon: "⌕" },
  { href: "/explore", label: "Explorer", icon: "❖" },
  { href: "/graph", label: "Graph", icon: "◎" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body>
        <div className="flex min-h-screen">
          <aside className="w-64 shrink-0 border-r border-border bg-surface p-4">
            <Link href="/" className="mb-8 flex items-center gap-2 px-2 pt-2">
              <span className="text-2xl">⚡</span>
              <div>
                <div className="font-semibold leading-tight">Pikachu</div>
                <div className="text-xs text-muted">engineering memory</div>
              </div>
            </Link>
            <nav className="flex flex-col gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <span className="w-4 text-center text-accent">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="flex-1 overflow-x-hidden">
            <div className="mx-auto max-w-5xl px-8 py-10">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
