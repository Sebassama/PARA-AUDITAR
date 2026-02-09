'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FolderOpen, Loader2, AlertCircle, ExternalLink, Search } from 'lucide-react'

type IndexData = {
  cid: string
  gateway: string
  endpoint: string
  docCount: number
  sizeHuman: string
  timestamp: string
}

export default function HistorialCertificados() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [indexData, setIndexData] = useState<IndexData | null>(null)

  const abrirHistorial = async () => {
    setLoading(true)
    setError(null)

    try {
      // Obtener CID del índice con failover
      const res = await fetch('/api/ipfs/get-index-info')

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'No se pudo obtener información del índice')
      }

      const data = await res.json()
      setIndexData(data)

      // MODIFICADO: Usar ruta relativa sin exponer IP del gateway
      // Nginx maneja el failover automáticamente
      const url = `/ipfs/${data.cid}`
      window.open(url, '_blank')

    } catch (e: any) {
      setError(e?.message || 'Error al consultar el índice IPFS')
      console.error('Error:', e)
    } finally {
      setLoading(false)
    }
  }

  const abrirPorHash = () => {
    if (!indexData) return
    // MODIFICADO: Usar ruta relativa sin exponer IP
    const url = `/ipfs/${indexData.cid}/by-hash`
    window.open(url, '_blank')
  }

  const abrirPorOwner = () => {
    if (!indexData) return
    // MODIFICADO: Usar ruta relativa sin exponer IP
    const url = `/ipfs/${indexData.cid}/by-owner`
    window.open(url, '_blank')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5" />
          Historial de Certificados en IPFS
        </CardTitle>
        <CardDescription>
          Accede al índice distribuido de certificados y títulos almacenados en el cluster IPFS
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Botón principal */}
        <Button
          onClick={abrirHistorial}
          disabled={loading}
          className="w-full"
          size="lg"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Consultando cluster IPFS...
            </>
          ) : (
            <>
              <FolderOpen className="w-5 h-5 mr-2" />
              Ver Índice Completo en IPFS
            </>
          )}
        </Button>

        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Información del índice */}
        {indexData && (
          <div className="space-y-4">
            {/* Estadísticas */}
            <Alert>
              <Search className="h-4 w-4" />
              <AlertDescription asChild>
                <div className="space-y-3">
                  <div className="font-semibold text-sm">Estado del Índice:</div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-muted-foreground">CID Actual:</div>
                      <div className="font-mono text-xs break-all mt-1">
                        {indexData.cid}
                      </div>
                    </div>

                    <div>
                      <div className="text-muted-foreground">Documentos:</div>
                      <div className="font-semibold mt-1">
                        {indexData.docCount} certificados/títulos
                      </div>
                    </div>

                    <div>
                      <div className="text-muted-foreground">Tamaño Total:</div>
                      <div className="font-semibold mt-1">
                        {indexData.sizeHuman}
                      </div>
                    </div>

                    <div>
                      <div className="text-muted-foreground">Nodo IPFS:</div>
                      <div className="text-xs mt-1 truncate" title={indexData.endpoint}>
                        {/* MODIFICADO: Mostrar solo host sin puerto para no dar pistas de infraestructura */}
                        Cluster IPFS
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground pt-2 border-t">
                    Última consulta: {new Date(indexData.timestamp).toLocaleString('es-EC')}
                  </div>
                </div>
              </AlertDescription>
            </Alert>

            {/* Accesos directos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={abrirPorHash}
                className="w-full justify-start"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Buscar por Hash (by-hash/)
              </Button>

              <Button
                variant="outline"
                onClick={abrirPorOwner}
                className="w-full justify-start"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Buscar por Nombre (by-owner/)
              </Button>
            </div>

            {/* Instrucciones */}
            <Alert>
              <AlertDescription className="text-sm">
                <div className="font-semibold mb-2">💡 Cómo usar el historial:</div>
                <ul className="space-y-1 text-xs list-disc list-inside">
                  <li>
                    <strong>by-hash/</strong>: Navega por carpetas (00-ff) para encontrar certificados por su hash SHA-256
                  </li>
                  <li>
                    <strong>by-owner/</strong>: Busca certificados por nombre del propietario (ordenado alfabéticamente)
                  </li>
                  <li>
                    Cada archivo .json contiene: hash, CID del PDF, txID de blockchain, título y más
                  </li>
                </ul>
              </AlertDescription>
            </Alert>

            {/* Enlaces de referencia */}
            <div className="pt-2 border-t">
              <div className="text-xs text-muted-foreground mb-2">Enlaces rápidos:</div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/ipfs/${indexData.cid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Raíz del índice
                </a>
                <a
                  href={`https://check.ipfs.network/?cid=${indexData.cid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <Search className="w-3 h-3" />
                  Verificar en IPFS Network
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Mensaje inicial */}
        {!indexData && !error && !loading && (
          <Alert>
            <AlertDescription className="text-sm">
              <div className="space-y-2">
                <p>
                  Haz clic en <strong>"Ver Índice Completo en IPFS"</strong> para acceder al historial de todos los certificados y títulos registrados.
                </p>
                <p className="text-xs text-muted-foreground">
                  El sistema consulta automáticamente el cluster IPFS y usa failover si algún nodo no está disponible.
                </p>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
