"use client"

import { useContext, useEffect } from "react"
import { useRouter } from "next/router"
import { WalletContext } from "../contexts/WalletContext"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

const ProtectedRoute = ({ children, requiredRole }) => {
  const { connected, role } = useContext(WalletContext)
  const router = useRouter()

  useEffect(() => {
    if (!connected) {
      router.replace("/")
    }
  }, [connected, router])

  if (!connected) {
    return null // O un spinner
  }

  if (role !== requiredRole) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Acceso denegado</AlertTitle>
          <AlertDescription>
            No tienes los permisos necesarios para acceder a esta página. Tu rol actual es: {role || "invitado"}.
          </AlertDescription>
        </Alert>
        <div className="mt-4 text-center">
          <button onClick={() => router.replace("/")} className="text-blue-500 underline">
            Volver al inicio
          </button>
        </div>
      </div>
    )
  }

  return children
}

export default ProtectedRoute
