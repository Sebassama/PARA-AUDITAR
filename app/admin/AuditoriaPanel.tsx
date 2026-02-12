'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useAudit } from '@/hooks/useAudit'
import {
  Shield, RefreshCw, AlertCircle, CheckCircle2,
  XCircle, Download, Link as LinkIcon
} from 'lucide-react'

const ALGO_EXPLORER = 'https://allo.info'

export default function AuditoriaPanel() {
  const { loading, error, getFullHistory, verifyChain } = useAudit()
  const [history, setHistory] = useState<any>(null)
  const [verification, setVerification] = useState<any>(null)

  const loadHistory = async () => {
    try {
      const data = await getFullHistory()
      setHistory(data)
    } catch (err: any) {
      // error ya lo maneja el hook
    }
  }

  const handleVerifyChain = async () => {
    try {
      const data = await verifyChain()
      setVerification(data)
    } catch (err: any) {
      // error ya lo maneja el hook
    }
  }

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'register': return <CheckCircle2 className="w-4 h-4 text-green-600" />
      case 'delete':   return <XCircle className="w-4 h-4 text-red-600" />
      default:         return <AlertCircle className="w-4 h-4" />
    }
  }

  const getActionBadge = (action: string) => {
    const colors: Record<string, string> = {
      register: 'bg-green-100 text-green-800',
      delete:   'bg-red-100 text-red-800',
      update:   'bg-blue-100 text-blue-800',
    }
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[action] || 'bg-gray-100 text-gray-800'}`}>
        {getActionIcon(action)}
        {action.toUpperCase()}
      </span>
    )
  }

  return (
    <div className="space-y-6">

      {/* Header descriptivo */}
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-blue-600" />
        <div>
          <h2 className="text-xl font-bold">Auditoría Inmutable de Gestión de Usuarios</h2>
          <p className="text-sm text-muted-foreground">
            Histórico completo de registros y eliminaciones almacenado en Blockchain + IPFS
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      {history && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Acciones</CardDescription>
              <CardTitle className="text-2xl">{history.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Último Round</CardDescription>
              <CardTitle className="text-2xl">{history.last_round?.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>CID Actual</CardDescription>
              <CardTitle className="text-sm font-mono truncate">
                {history.last_cid?.substring(0, 16)}...
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Estado</CardDescription>
              <CardTitle className="flex items-center gap-2 text-sm">
                {verification?.valid ? (
                  <><CheckCircle2 className="w-5 h-5 text-green-600" /><span className="text-green-600">Verificado</span></>
                ) : (
                  <><Shield className="w-5 h-5 text-blue-600" /><span className="text-blue-600">Inmutable</span></>
                )}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Botones de acción */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={loadHistory} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {history ? 'Refrescar' : 'Cargar Histórico'}
        </Button>
        <Button onClick={handleVerifyChain} variant="outline" disabled={loading}>
          <Shield className="w-4 h-4 mr-2" />
          Verificar Integridad
        </Button>
        {history?.last_tx_id && (
          <Button variant="outline" onClick={() => window.open(`${ALGO_EXPLORER}/tx/${history.last_tx_id}`, '_blank')}>
            <LinkIcon className="w-4 h-4 mr-2" />
            Ver en Explorer
          </Button>
        )}
        {history?.last_cid && (
          <Button variant="outline" onClick={() => window.open(`/ipfs/${history.last_cid}`, '_blank')}>
            <Download className="w-4 h-4 mr-2" />
            Ver JSON en IPFS
          </Button>
        )}
      </div>

      {/* Verificación */}
      {verification && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle>Cadena Verificada</AlertTitle>
          <AlertDescription>
            La cadena histórica es válida. {verification.total_actions} acciones verificadas.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabla de acciones */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Acciones</CardTitle>
          <CardDescription>Registro cronológico de todas las operaciones realizadas</CardDescription>
        </CardHeader>
        <CardContent>
          {!history ? (
            <div className="text-center py-12">
              <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {loading ? 'Cargando histórico...' : 'Pulsa "Cargar Histórico" para ver las acciones'}
              </p>
            </div>
          ) : history.actions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No hay acciones registradas aún.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-3 pr-4">Fecha</th>
                    <th className="py-3 pr-4">Acción</th>
                    <th className="py-3 pr-4">Admin</th>
                    <th className="py-3 pr-4">Usuario Afectado</th>
                    <th className="py-3">Rol</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history.actions].reverse().map((action: any, idx: number) => (
                    <tr key={idx} className="border-b hover:bg-muted/30">
                      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                        {new Date(action.timestamp).toLocaleString('es-EC')}
                      </td>
                      <td className="py-3 pr-4">{getActionBadge(action.action_type)}</td>
                      <td className="py-3 pr-4">
                        <div className="text-xs">
                          <p className="font-medium">{action.admin?.email || '—'}</p>
                          {action.admin?.wallet && (
                            <p className="text-muted-foreground font-mono">
                              {action.admin.wallet.slice(0, 8)}...
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="text-xs">
                          <p className="font-medium">{action.target_user?.email || '—'}</p>
                          {action.target_user?.wallet && (
                            <p className="text-muted-foreground font-mono">
                              {action.target_user.wallet.slice(0, 8)}...
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 text-xs text-muted-foreground">
                        {action.target_user?.role || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
