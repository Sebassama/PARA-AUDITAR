import type React from "react"
import "@/app/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { ConnectWalletButton } from "@/components/connect-wallet-button"
import Link from "next/link"
import { Home, CheckCircle2 } from "lucide-react"

import CryptoPolyfill from "@/src/components/CryptoPolyfill"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <CryptoPolyfill />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <div className="flex min-h-screen flex-col">
            <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="container flex h-14 items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link href="/" className="font-bold text-xl flex items-center">
                    <CheckCircle2 className="h-5 w-5 mr-2" />
                    ESCUELA SUPERIOR POLITÉCNICA DE CHIMBORAZO.
                  </Link>
                </div>
                <nav className="flex items-center gap-4">
                </nav>
              </div>
            </header>
            <main className="flex-1">{children}</main>
            <footer className="border-t py-6">
              <div className="container flex flex-col items-center justify-between gap-4 md:flex-row">
                <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
                  © 2026 Sebastian Samaniego.
                </p>
                <div className="flex items-center gap-4">

                </div>
              </div>
            </footer>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}

export const metadata = {
  generator: 'v0.dev'
};
