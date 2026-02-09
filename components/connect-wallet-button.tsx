"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Wallet } from "lucide-react"
import { connectPeraWallet, type AlgorandAccount } from "@/lib/algorand"

interface ConnectWalletButtonProps {
  onConnect?: (account: AlgorandAccount) => void
}

export function ConnectWalletButton({ onConnect }: ConnectWalletButtonProps) {
  const [isConnecting, setIsConnecting] = useState(false)
  const [account, setAccount] = useState<AlgorandAccount | null>(null)

  const handleConnect = async () => {
    setIsConnecting(true)
    try {
      const connectedAccount = await connectPeraWallet()
      if (connectedAccount) {
        setAccount(connectedAccount)
        if (onConnect) {
          onConnect(connectedAccount)
        }
      }
    } catch (error) {
      console.error("Error al conectar wallet:", error)
    } finally {
      setIsConnecting(false)
    }
  }

  if (account) {
    return (
      <Button variant="outline" className="font-mono text-sm">
        <Wallet className="mr-2 h-4 w-4" />
        {account.address.substring(0, 6)}...{account.address.substring(account.address.length - 4)}
      </Button>
    )
  }

  return (
    <Button onClick={handleConnect} disabled={isConnecting}>
      <Wallet className="mr-2 h-4 w-4" />
      {isConnecting ? "Conectando..." : "Conectar PeraWallet"}
    </Button>
  )
}
