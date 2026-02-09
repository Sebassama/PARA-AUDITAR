"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, Link as LinkIcon, Download, Mail, Clock, LogOut } from "lucide-react"
import { openIpfsWithFailover } from "@/app/lib/ipfs-failover"
import { usePublicAuth } from "@/hooks/usePublicAuth"

export default function OwnerSearchPage() {
  const { 
    isAuthenticated, 
    loading: authLoading, 
    error: authError,
    signIn, 
    signOut,
    userEmail,
    timeRemaining
  } = usePublicAuth();

  const [owner, setOwner] = useState("")
  const [busy, setBusy] = useState(false)
  const [items, setItems] = useState<Array<{ 
    hash: string
    txid: string
    pdf_cid: string
    timestamp: string
    title?: string | null 
  }>>([])
  const [error, setError] = useState<string | null>(null)

  const onSearch = async () => {
    setError(null)
    setItems([])
    if (!owner.trim()) {
      setError("Ingrese el nombre completo del dueño")
      return
    }
    setBusy(true)
    try {
      const r = await fetch(`/api/index/search-owner?owner=${encodeURIComponent(owner)}`)
      const j = await r.json()
      if (!r.ok) {
        setError(j?.error || "No encontrado")
        return
      }
      setItems(j?.items || [])
    } catch (e: any) {
      setError(e?.message || "Error de red")
    } finally {
      setBusy(false)
    }
  }

  const abrirTx = (txid: string) => {
    window.open(`https://explorer.perawallet.app/tx/${txid}`, "_blank")
  }

  const abrirIPFS = (cid: string) => {
    openIpfsWithFailover(cid)
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-[400px]">
          <CardContent className="pt-6">
            <p className="text-center">Verificando autenticación...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <Card className="border-blue-200 shadow-lg">
          <CardHeader className="space-y-3 pb-4">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
                <Mail className="h-8 w-8 text-blue-600" />
              </div>
            </div>
            <CardTitle className="text-center text-2xl">
              Autenticación Requerida
            </CardTitle>
            <CardDescription className="text-center text-base">
              Para buscar certificados por nombre, inicia sesión con Microsoft
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <Alert className="bg-blue-50 border-blue-200">
              <Mail className="h-4 w-4 text-blue-600" />
              <AlertTitle>Acceso Público</AlertTitle>
              <AlertDescription>
                Puedes usar <strong>cualquier cuenta Microsoft</strong>:
                <ul className="mt-2 space-y-1 text-sm">
                  <li>• Outlook.com</li>
                  <li>• Hotmail.com</li>
                  <li>• Live.com</li>
                  <li>• Correo institucional (.onmicrosoft.com)</li>
                </ul>
              </AlertDescription>
            </Alert>

            <Alert className="bg-amber-50 border-amber-200">
              <Clock className="h-4 w-4 text-amber-600" />
              <AlertTitle>Sesión Temporal</AlertTitle>
              <AlertDescription>
                Tu sesión durará <strong>10 minutos</strong> por seguridad.
              </AlertDescription>
            </Alert>

            {authError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription className="whitespace-pre-wrap">
                  {authError}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter>
            <Button onClick={signIn} className="w-full" size="lg">
              <Mail className="w-5 h-5 mr-2" />
              Iniciar con Microsoft
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Búsqueda por Nombre</h1>
        <div className="flex items-center gap-4">
          <div className="text-sm text-right">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="w-3 h-3" />
              <span>{userEmail}</span>
            </div>
            <div className="flex items-center gap-2 text-amber-600 font-mono">
              <Clock className="w-3 h-3" />
              <span>{timeRemaining}</span>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Búsqueda por Dueño</CardTitle>
          <CardDescription>
            Escriba el nombre completo (ej. "MARIA LOPEZ LOPEZ")
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input 
              placeholder="Nombre completo del dueño" 
              value={owner} 
              onChange={e => setOwner(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onSearch()}
            />
            <Button onClick={onSearch} disabled={busy}>
              {busy ? "Buscando..." : "Buscar"}
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Título</th>
                    <th className="py-2 pr-3">Hash</th>
                    <th className="py-2 pr-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="py-2 pr-3">
                        {new Date(it.timestamp).toLocaleString('es-EC')}
                      </td>
                      <td className="py-2 pr-3">{it.title || "-"}</td>
                      <td className="py-2 pr-3 font-mono text-xs break-all">
                        {it.hash.slice(0, 8)}...{it.hash.slice(-6)}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-2">
                          <Button 
                            variant="link" 
                            className="p-0 h-auto text-xs" 
                            onClick={() => abrirTx(it.txid)}
                          >
                            <LinkIcon className="w-3 h-3 mr-1" /> TX
                          </Button>
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            onClick={() => abrirIPFS(it.pdf_cid)}
                          >
                            <Download className="w-3 h-3 mr-1" /> IPFS
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!busy && !error && items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No hay resultados. Realice una búsqueda.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
