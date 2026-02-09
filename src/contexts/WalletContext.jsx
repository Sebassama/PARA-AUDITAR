"use client"

import { createContext, useState, useEffect } from "react"
import { connectToPeraWallet, disconnectFromPeraWallet } from "../utils/peraWallet"

export const WalletContext = createContext()

export const WalletProvider = ({ children }) => {
  const [connected, setConnected] = useState(false)
  const [address, setAddress] = useState("")
  const [role, setRole] = useState(null)

  // Check if wallet is already connected on component mount
  useEffect(() => {
    const savedAddress = localStorage.getItem("walletAddress")
    if (savedAddress) {
      setAddress(savedAddress)
      setConnected(true)

      // Get role from localStorage
      const rolesWallet = JSON.parse(localStorage.getItem("rolesWallet") || "{}")
      setRole(rolesWallet[savedAddress] || null)
    }
  }, [])

  const connectWallet = async () => {
    try {
      const walletAddress = await connectToPeraWallet()
      if (walletAddress) {
        setAddress(walletAddress)
        setConnected(true)
        localStorage.setItem("walletAddress", walletAddress)

        // Get role from localStorage
        const rolesWallet = JSON.parse(localStorage.getItem("rolesWallet") || "{}")
        setRole(rolesWallet[walletAddress] || null)
      }
    } catch (error) {
      console.error("Error connecting wallet:", error)
    }
  }

  const disconnectWallet = () => {
    disconnectFromPeraWallet()
    setAddress("")
    setConnected(false)
    setRole(null)
    localStorage.removeItem("walletAddress")
  }

  return (
    <WalletContext.Provider
      value={{
        connected,
        address,
        role,
        connectWallet,
        disconnectWallet,
        setRole,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}
