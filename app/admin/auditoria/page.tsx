// app/admin/auditoria/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAudit } from '@/hooks/useAudit';
import { 
  Shield, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Link as LinkIcon,
  Download,
  AlertCircle
} from 'lucide-react';

interface AuditAction {
  action_type: 'register' | 'delete' | 'update';
  timestamp: string;
  timestamp_unix: number;
  admin: {
    email: string;
    wallet: string | null;
  };
  target_user: {
    wallet: string | null;
    email: string | null;
    role: string | null;
  };
}

const ALGO_EXPLORER = 'https://explorer.perawallet.app';

export default function PanelAuditoria() {
  const { getFullHistory, verifyChain, loading } = useAudit();
  
  const [history, setHistory] = useState<{
    actions: AuditAction[];
    total: number;
    last_cid: string;
    last_tx_id: string;
    last_round: number;
  } | null>(null);

  const [verification, setVerification] = useState<{
    valid: boolean;
    total_actions: number;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      setError(null);
      const data = await getFullHistory();
      setHistory(data);
    } catch (err: any) {
      setError(err?.message || 'Error cargando histórico');
    }
  };

  const handleVerifyChain = async () => {
    try {
      setError(null);
      const data = await verifyChain();
      setVerification(data);
    } catch (err: any) {
      setError(err?.message || 'Error verificando cadena');
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'register':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'delete':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'update':
        return <RefreshCw className="w-4 h-4 text-blue-600" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  const getActionBadge = (action: string) => {
    const colors = {
      register: 'bg-green-100 text-green-800',
      delete: 'bg-red-100 text-red-800',
      update: 'bg-blue-100 text-blue-800'
    };

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[action as keyof typeof colors] || 'bg-gray-100 text-gray-800'}`}>
        {getActionIcon(action)}
        {action.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold">Auditoría Gestión Usuarios Inmutable</h1>
        </div>
        <p className="text-muted-foreground">
          Histórico completo de registros y eliminaciones de usuarios en blockchain
        </p>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      {history && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
                  <>
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <span className="text-green-600">Verificado</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5 text-blue-600" />
                    <span className="text-blue-600">Inmutable</span>
                  </>
                )}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mb-6">
        <Button onClick={loadHistory} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refrescar
        </Button>

        <Button onClick={handleVerifyChain} variant="outline" disabled={loading}>
          <Shield className="w-4 h-4 mr-2" />
          Verificar Integridad
        </Button>

        {history?.last_tx_id && (
          <Button
            variant="outline"
            onClick={() => window.open(`${ALGO_EXPLORER}/tx/${history.last_tx_id}`, '_blank')}
          >
            <LinkIcon className="w-4 h-4 mr-2" />
            Ver en Explorer
          </Button>
        )}

        {history?.last_cid && (
          <Button
            variant="outline"
            onClick={() => window.open(`/ipfs/${history.last_cid}`, '_blank')}
          >
            <Download className="w-4 h-4 mr-2" />
            Ver JSON en IPFS
          </Button>
        )}
      </div>

      {/* Verification Results */}
      {verification && (
        <Alert className="mb-6 bg-green-50 border-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle>Cadena Verificada</AlertTitle>
          <AlertDescription>
            La cadena histórica es válida. Total de {verification.total_actions} acciones verificadas.
          </AlertDescription>
        </Alert>
      )}

      {/* History Table */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Acciones</CardTitle>
          <CardDescription>
            Registro cronológico de todas las operaciones realizadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!history ? (
            <div className="text-center py-12">
              <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {loading ? 'Cargando histórico...' : 'Carga el histórico para ver las acciones'}
              </p>
            </div>
          ) : history.actions.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No hay acciones registradas</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">#</th>
                    <th className="text-left py-3 px-4 font-medium">Fecha</th>
                    <th className="text-left py-3 px-4 font-medium">Acción</th>
                    <th className="text-left py-3 px-4 font-medium">Admin</th>
                    <th className="text-left py-3 px-4 font-medium">Usuario Afectado</th>
                    <th className="text-left py-3 px-4 font-medium">Rol</th>
                  </tr>
                </thead>
                <tbody>
                  {history.actions.map((action, index) => (
                    <tr key={index} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {history.total - index}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {new Date(action.timestamp).toLocaleString('es-EC', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="py-3 px-4">
                        {getActionBadge(action.action_type)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-sm">
                          <div className="font-medium">{action.admin.email}</div>
                          {action.admin.wallet && (
                            <div className="text-xs text-muted-foreground font-mono">
                              {action.admin.wallet.substring(0, 8)}...
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-sm">
                          <div className="font-medium">{action.target_user.email || 'N/A'}</div>
                          {action.target_user.wallet && (
                            <div className="text-xs text-muted-foreground font-mono">
                              {action.target_user.wallet.substring(0, 8)}...{action.target_user.wallet.substring(action.target_user.wallet.length - 4)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {action.target_user.role && (
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">
                            {action.target_user.role}
                          </span>
                        )}
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
  );
}
