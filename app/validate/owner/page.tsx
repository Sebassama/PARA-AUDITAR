"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, Link as LinkIcon, Download } from "lucide-react"
import { openIpfsWithFailover } from "@/app/lib/ipfs-failover"

export default function OwnerSearchPage() {
  const [owner, setOwner] = useState("")
  const [busy, setBusy] = useState(false)
  const [items, setItems] = useState<Array<{ hash: string, txid: string, pdf_cid: string, timestamp: string, title?: string | null }>>([])
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

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Búsqueda por Dueño</CardTitle>
          <CardDescription>Escriba el nombre completo (ej. "MARIA LOPEZ LOPEZ").</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="Nombre completo del dueño" value={owner} onChange={e => setOwner(e.target.value)} />
            <Button onClick={onSearch} disabled={busy}>{busy ? "Buscando..." : "Buscar"}</Button>
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
                  <tr className="text-left">
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Título</th>
                    <th className="py-2 pr-3">Hash</th>
                    <th className="py-2 pr-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="py-2 pr-3">{new Date(it.timestamp).toLocaleString('es-EC')}</td>
                      <td className="py-2 pr-3">{it.title || "-"}</td>
                      <td className="py-2 pr-3 font-mono break-all">{it.hash}</td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-2">
                          <Button variant="link" className="p-0 h-auto" onClick={() => abrirTx(it.txid)}>
                            <LinkIcon className="w-4 h-4" /> Ver TX
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => abrirIPFS(it.pdf_cid)}>
                            <Download className="w-4 h-4" /> IPFS
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
            <p className="text-sm text-muted-foreground">No hay resultados todavía. Realice una búsqueda.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
