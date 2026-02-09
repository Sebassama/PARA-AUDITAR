// app/admin/page.tsx (🎨 UI MEJORADA + 🔒 SEGURIDAD COMPLETA)
'use client'

import { useEffect, useState } from 'react'
import { PeraWalletConnect } from '@perawallet/connect'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useMicrosoftAuth } from '@/hooks/useMicrosoftAuth'
import GestionRolesModern from './GestionRolesModern'
import HistorialCertificados from './HistorialCertificados'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { LogOut, Wallet, Mail, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react'

const REQUIRED_ROLE = 'Admin'
const ALLOWED_ROLES = ['Admin']
const peraWallet = new PeraWalletConnect()

export default function AdminPage() {
  const {
    session,
    emailVerified,
    loading,
    error,
    isAuthenticated,
    needsWallet,
    signIn,
    verifyWallet,
    signOut,
    expectedWallet
  } = useMicrosoftAuth(REQUIRED_ROLE)

  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  // Reconectar wallet al montar
  useEffect(() => {
    const reconnect = async () => {
      const accounts = await peraWallet.reconnectSession()
      if (accounts[0]) {
        setWalletAddress(accounts[0])
        localStorage.setItem('walletAddress', accounts[0])
      }
    }
    reconnect()
  }, [])

  // Auto-verificar si ya hay wallet conectada
  useEffect(() => {
    if (needsWallet && walletAddress && !verifying) {
      handleVerifyWallet()
    }
  }, [needsWallet, walletAddress])

  const connectWallet = async () => {
    try {
      const accounts = await peraWallet.connect()
      if (accounts[0]) {
        setWalletAddress(accounts[0])
        localStorage.setItem('walletAddress', accounts[0])
      }
    } catch (error) {
      console.warn('Conexión de wallet cancelada')
    }
  }

  const disconnectWallet = async () => {
    await peraWallet.disconnect()
    localStorage.removeItem('walletAddress')
    setWalletAddress(null)
  }

  const handleVerifyWallet = async () => {
    if (!walletAddress) {
      alert('Por favor conecta tu wallet primero')
      return
    }

    setVerifying(true)
    await verifyWallet(walletAddress)
    setVerifying(false)
  }

  const handleSignOut = () => {
    disconnectWallet()
    signOut()
  }

  // ========================================================================
  // PANTALLA: Cargando
  // ========================================================================
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-[400px]">
          <CardContent className="pt-6">
            <p className="text-center">Cargando...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ========================================================================
  // PANTALLA 1: Sin autenticación - Login con Microsoft
  // ========================================================================
  if (!emailVerified && !isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-[450px]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-6 h-6" />
              Panel de Administración
            </CardTitle>
            <CardDescription>
              Autenticación de dos factores requerida
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Mail className="h-4 w-4" />
              <AlertTitle>Paso 1: Verificación de Email</AlertTitle>
              <AlertDescription>
                Autentícate con tu email institucional de Microsoft.
                <br /><br />
                <strong>Rol requerido:</strong> {REQUIRED_ROLE}
              </AlertDescription>
            </Alert>
            <Alert>
              <Wallet className="h-4 w-4" />
              <AlertTitle>Paso 2: Verificación de Wallet</AlertTitle>
              <AlertDescription>
                Conecta tu wallet de Algorand para completar la autenticación.
              </AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter>
            <Button onClick={signIn} className="w-full" size="lg">
              <Mail className="w-5 h-5 mr-2" />
              Iniciar con Microsoft
            </Button>
          </CardFooter>
          
          {error && (
            <CardContent>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription className="whitespace-pre-wrap">
                  {error}
                </AlertDescription>
              </Alert>
            </CardContent>
          )}
        </Card>
      </div>
    )
  }

  // ========================================================================
  // PANTALLA 2: Email verificado - Solicitar wallet
  // ========================================================================
  if (needsWallet) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-[500px]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              Email Verificado
            </CardTitle>
            <CardDescription>
              {emailVerified?.email}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Wallet className="h-4 w-4" />
              <AlertTitle>Paso 2: Conecta tu Wallet</AlertTitle>
              <AlertDescription>
                Conecta tu wallet de Algorand para completar la autenticación.
                <br /><br />
                <strong>Wallet esperada:</strong> {expectedWallet?.slice(0, 10)}...{expectedWallet?.slice(-4)}
              </AlertDescription>
            </Alert>

            {walletAddress && (
              <Alert className={walletAddress === expectedWallet ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}>
                {walletAddress === expectedWallet ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                )}
                <AlertTitle>
                  {walletAddress === expectedWallet ? 'Wallet Correcta' : 'Wallet Incorrecta'}
                </AlertTitle>
                <AlertDescription>
                  Wallet conectada: {walletAddress.slice(0, 10)}...{walletAddress.slice(-4)}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex gap-2">
            {!walletAddress ? (
              <Button onClick={connectWallet} className="flex-1" size="lg">
                <Wallet className="w-5 h-5 mr-2" />
                Conectar Wallet
              </Button>
            ) : (
              <>
                <Button 
                  onClick={handleVerifyWallet} 
                  className="flex-1" 
                  size="lg"
                  disabled={verifying || walletAddress !== expectedWallet}
                >
                  {verifying ? 'Verificando...' : 'Verificar y Continuar'}
                </Button>
                <Button onClick={disconnectWallet} variant="outline" size="lg">
                  Cambiar Wallet
                </Button>
              </>
            )}
          </CardFooter>
          <CardContent>
            <Button onClick={handleSignOut} variant="ghost" className="w-full">
              <LogOut className="w-4 h-4 mr-2" />
              Cancelar y Cerrar Sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // 🎨 PANTALLA 3: Rol no autorizado (NUEVA - BONITA)
  if (isAuthenticated && session && !ALLOWED_ROLES.includes(session.role)) {
    return (
      <div className="flex items-center justify-center h-screen px-4">
        <Card className="w-full max-w-md border-red-200 shadow-lg">
          <CardHeader className="space-y-3 pb-4">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
            </div>
            <CardTitle className="text-center text-2xl text-red-600">
              Acceso Restringido
            </CardTitle>
            <CardDescription className="text-center text-base">
              No tienes los permisos necesarios para acceder a este panel
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Rol no autorizado</AlertTitle>
              <AlertDescription>
                Este módulo solo está disponible para el rol de <strong>Administrador</strong>.
              </AlertDescription>
            </Alert>

            <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-medium">{session.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Wallet:</span>
                <span className="font-mono text-xs">
                  {session.wallet.slice(0, 8)}...{session.wallet.slice(-6)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-muted-foreground">Tu rol actual:</span>
                <span className="font-semibold text-red-600">{session.role}</span>
              </div>
            </div>

            <Alert className="bg-blue-50 border-blue-200">
              <AlertDescription className="text-sm">
                💡 Si crees que esto es un error, contacta al administrador del sistema para que revise tus permisos.
              </AlertDescription>
            </Alert>
          </CardContent>

          <CardFooter className="flex flex-col gap-2 pt-4">
            <Button 
              onClick={handleSignOut} 
              variant="destructive" 
              className="w-full"
              size="lg"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Cerrar Sesión
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  // ========================================================================
  // PANTALLA 4: Autenticado y autorizado - Mostrar panel
  // ========================================================================
  if (isAuthenticated && session && ALLOWED_ROLES.includes(session.role)) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Panel de Administración</h1>
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground text-right">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <span>{session.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                <span>{session.wallet.slice(0, 10)}...{session.wallet.slice(-4)}</span>
              </div>
            </div>
            <Button variant="destructive" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </div>

        <Tabs defaultValue="roles">
          <TabsList className="mb-8">
            <TabsTrigger value="roles">Gestión de Usuarios</TabsTrigger>
            <TabsTrigger value="historial">Historial de Certificados</TabsTrigger>
          </TabsList>

          <TabsContent value="roles">
            <GestionRolesModern />
          </TabsContent>

          <TabsContent value="historial">
            <HistorialCertificados />
          </TabsContent>
        </Tabs>
      </div>
    )
  }

  return null
}
