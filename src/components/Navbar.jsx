"use client"

import { useContext } from "react"
import Link from "next/link"
import { useRouter } from "next/router"
import { Button } from "@/components/ui/button"
import { WalletContext } from "../contexts/WalletContext"
import { CheckCircle2, Home, LogOut } from "lucide-react"

const Navbar = () => {
  const { connected, address, role, connectWallet, disconnectWallet } = useContext(WalletContext)
  const router = useRouter()

  const handleConnect = async () => {
    await connectWallet()
  }

  const handleDisconnect = () => {
    disconnectWallet()
    router.push("/")
  }

  const getRoleLink = () => {
    switch (role) {
      case "admin":
        return "/admin"
      case "secretaria":
        return "/secretary"
      case "grupo":
        return "/group"
      default:
        return "/"
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/" className="font-bold text-xl flex items-center">
            <CheckCircle2 className="h-5 w-5 mr-2" />
            CertChain
          </Link>
        </div>
        <nav className="flex items-center gap-4">
          <Link href="/" className="text-sm font-medium flex items-center">
            <Home className="h-4 w-4 mr-1" /> Inicio
          </Link>

          {connected && role && (
            <Link href={getRoleLink()} className="text-sm font-medium">
              Panel de {role === "admin" ? "Administrador" : role === "secretaria" ? "Secretaría" : "Grupo"}
            </Link>
          )}

          {!connected ? (
            <Button onClick={handleConnect}>Conectar Wallet</Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono truncate max-w-[120px]" title={address}>
                {address.substring(0, 6)}...{address.substring(address.length - 4)}
              </span>
              <Button variant="ghost" size="icon" onClick={handleDisconnect} title="Desconectar">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </nav>
      </div>
    </header>
  )
}

export default Navbar
