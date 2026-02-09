// hooks/usePublicAuth.ts
"use client";

import { useState, useEffect } from "react";

interface PublicSession {
  email: string;
  token: string;
  expiresAt: number;
  route: string;
}

export function usePublicAuth() {
  const [session, setSession] = useState<PublicSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isValid = (): boolean => {
    if (!session) return false;
    if (session.expiresAt <= Date.now()) return false;
    if (typeof window !== 'undefined') {
      return session.route === window.location.pathname;
    }
    return false;
  };

  // Cargar sesión
  useEffect(() => {
    const stored = localStorage.getItem('public_auth_session');
    if (stored) {
      try {
        const parsed: PublicSession = JSON.parse(stored);
        if (parsed.expiresAt > Date.now()) {
          setSession(parsed);
        } else {
          localStorage.removeItem('public_auth_session');
        }
      } catch (e) {
        localStorage.removeItem('public_auth_session');
      }
    }
    setLoading(false);
  }, []);

  // Detectar callback
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const params = new URLSearchParams(window.location.search);
    const currentRoute = window.location.pathname;
    
    // Error
    const errorParam = params.get('error');
    if (errorParam) {
      const details = params.get('details');
      const email = params.get('email');
      
      let msg = '';
      if (errorParam === 'not_microsoft') {
        msg = `❌ Email No Válido\n\nEl email ${email} no es una cuenta de Microsoft.\n\nUsa: Outlook, Hotmail, Live, o correo institucional.`;
      } else if (errorParam === 'config_error') {
        msg = '❌ Error de Configuración\n\nContacta al administrador del sistema.';
      } else {
        msg = `❌ Error: ${details || errorParam}`;
      }
      
      setError(msg);
      setTimeout(() => {
        window.history.replaceState({}, '', window.location.pathname);
        setError(null);
      }, 5000);
      setLoading(false);
      return;
    }

    // Éxito
    const authSuccess = params.get('auth_success');
    if (authSuccess === 'true') {
      const token = params.get('token');
      const email = params.get('email');
      
      if (token && email) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const newSession: PublicSession = {
            email,
            token,
            expiresAt: payload.exp * 1000,
            route: currentRoute
          };
          
          localStorage.setItem('public_auth_session', JSON.stringify(newSession));
          setSession(newSession);
          window.history.replaceState({}, '', window.location.pathname);
          console.log('[PublicAuth] ✅ Sesión creada para:', email);
        } catch (e) {
          setError('Error procesando autenticación');
          console.error('[PublicAuth] ❌ Error procesando token:', e);
        }
      }
    }
    
    setLoading(false);
  }, []);

  // Auto-logout al expirar
  useEffect(() => {
    if (session) {
      const interval = setInterval(() => {
        if (!isValid()) {
          console.log('[PublicAuth] ⏰ Sesión expirada');
          signOut();
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [session]);

  const signIn = () => {
    const currentPath = window.location.pathname;
    const backendUrl = window.location.origin;
    console.log('[PublicAuth] 🚀 Iniciando autenticación pública...');
    console.log('[PublicAuth] Ruta actual:', currentPath);
    window.location.href = `${backendUrl}/api/auth/public/start?returnTo=${encodeURIComponent(currentPath)}`;
  };

  const signOut = () => {
    localStorage.removeItem('public_auth_session');
    setSession(null);
    setError(null);
    console.log('[PublicAuth] 👋 Sesión cerrada');
  };

  // Tiempo restante
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  
  useEffect(() => {
    if (session) {
      const updateTime = () => {
        const remaining = Math.max(0, session.expiresAt - Date.now());
        setTimeRemaining(remaining);
      };
      
      updateTime();
      const interval = setInterval(updateTime, 1000);
      return () => clearInterval(interval);
    } else {
      setTimeRemaining(0);
    }
  }, [session]);

  const formatTime = (): string => {
    const minutes = Math.floor(timeRemaining / 60000);
    const seconds = Math.floor((timeRemaining % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return {
    session,
    loading,
    error,
    isAuthenticated: isValid(),
    signIn,
    signOut,
    userEmail: session?.email || null,
    timeRemaining: formatTime(),
  };
}
