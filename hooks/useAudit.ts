// hooks/useAudit.ts
"use client";

import { useState } from 'react';

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

interface AuditHistory {
  ok: boolean;
  actions: AuditAction[];
  total: number;
  last_cid: string;
  last_tx_id: string;
  last_round: number;
  chain_length: number;
}

export function useAudit() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registerAction = async (data: {
    action: 'register' | 'delete' | 'update';
    adminEmail: string;
    adminWallet?: string;
    targetWallet?: string;
    targetEmail?: string;
    targetRole?: string;
  }) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/audit/register-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error registrando auditoría');
      }

      return await response.json();
    } catch (err: any) {
      setError(err?.message || 'Error de red');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const getFullHistory = async (): Promise<AuditHistory> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/audit/get-full-history');

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error obteniendo histórico');
      }

      return await response.json();
    } catch (err: any) {
      setError(err?.message || 'Error de red');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const verifyChain = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/audit/verify-chain');

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error verificando cadena');
      }

      return await response.json();
    } catch (err: any) {
      setError(err?.message || 'Error de red');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    registerAction,
    getFullHistory,
    verifyChain,
  };
}
