// hooks/useMicrosoftAuth.ts (🔒 VERSIÓN FINAL - SEGURIDAD COMPLETA)
"use client";

import { useState, useEffect } from "react";

// 🔒 MAPEO DE ROLES PERMITIDOS POR RUTA (Source of Truth)
const ROUTE_ROLE_MAP: Record<string, string[]> = {
  '/admin': ['Admin'],
  '/secretary': ['Secretaria', 'Admin'],
  '/groups': ['Grupo-APS', 'Grupo-CS', 'Grupo-COMSOC', 'Grupo-Radio', 'Admin']
};

interface EmailVerified {
  email: string;
  role: string;
  expectedWallet: string;
  allowedRoute: string; // 🔒 RUTA PARA LA QUE SE AUTENTICÓ
}

interface AuthSession {
  wallet: string;
  email: string;
  role: string;
  token: string;
  expiresAt: number;
  allowedRoute: string; // 🔒 RUTA PARA LA QUE SE AUTENTICÓ
}

export function useMicrosoftAuth(requiredRole?: string | string[]) {
  const [emailVerified, setEmailVerified] = useState<EmailVerified | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 🔒 FUNCIÓN: Verificar si un rol es válido para una ruta
  const isRoleAllowedForRoute = (role: string, route: string): boolean => {
    const allowedRoles = ROUTE_ROLE_MAP[route];
    if (!allowedRoles) return false;
    return allowedRoles.includes(role);
  };

  // 🔒 FUNCIÓN: Verificar si la sesión actual es válida para la ruta actual
  const isSessionValidForCurrentRoute = (): boolean => {
    if (!session || typeof window === 'undefined') return false;
    
    const currentRoute = window.location.pathname;
    
    // Validar que el rol sea permitido para la ruta actual
    const hasCorrectRole = isRoleAllowedForRoute(session.role, currentRoute);
    
    // Validar que la sesión fue creada para esta ruta O que el usuario es Admin (acceso total)
    const allowedForThisRoute = session.allowedRoute === currentRoute || session.role === 'Admin';
    
    return hasCorrectRole && allowedForThisRoute;
  };

  // ========================================================================
  // CARGAR SESIÓN desde localStorage al montar
  // ========================================================================
  useEffect(() => {
    const loadSession = () => {
      try {
        // Cargar sesión completa
        const stored = localStorage.getItem('microsoft_auth_session');
        if (stored) {
          const parsed: AuthSession = JSON.parse(stored);
          
          // 🔒 Verificar que tenga allowedRoute (migración de sesiones antiguas)
          if (!parsed.allowedRoute) {
            console.warn('[Auth] ⚠️ Sesión sin allowedRoute (migración), limpiando...');
            localStorage.removeItem('microsoft_auth_session');
            setSession(null);
            setLoading(false);
            return;
          }
          
          // Verificar si expiró
          if (parsed.expiresAt && parsed.expiresAt > Date.now()) {
            setSession(parsed);
          } else {
            console.log('[Auth] ⏰ Sesión expirada, limpiando...');
            localStorage.removeItem('microsoft_auth_session');
          }
        }
        
        // Cargar email verificado pendiente (paso 1 completo, falta wallet)
        const emailPending = localStorage.getItem('email_verified_pending');
        if (emailPending) {
          const parsed: EmailVerified = JSON.parse(emailPending);
          
          // 🔒 Verificar que tenga allowedRoute
          if (!parsed.allowedRoute) {
            console.warn('[Auth] ⚠️ Email verificado sin allowedRoute, limpiando...');
            localStorage.removeItem('email_verified_pending');
            setEmailVerified(null);
          } else {
            setEmailVerified(parsed);
          }
        }
      } catch (e) {
        console.error('[Auth] ❌ Error cargando sesión:', e);
        localStorage.removeItem('microsoft_auth_session');
        localStorage.removeItem('email_verified_pending');
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, []);

  // 🔒 VIGILANTE: Verificar validez de la sesión para la ruta actual (en cada render)
  useEffect(() => {
    if (session && typeof window !== 'undefined') {
      if (!isSessionValidForCurrentRoute()) {
        console.warn('[Auth] 🚫 Sesión no válida para la ruta actual, cerrando...');
        signOut();
      }
    }
  }, [session]);

  // ========================================================================
  // DETECTAR CALLBACK de Microsoft OAuth
  // ========================================================================
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const params = new URLSearchParams(window.location.search);
    const currentRoute = window.location.pathname;
    
    // CASO 1: Error de autenticación
    const errorParam = params.get('error');
    if (errorParam) {
      const email = params.get('email');
      const userRole = params.get('user_role');
      const requiredRoleParam = params.get('required_role');
      
      let errorMessage = '';
      
      switch (errorParam) {
        case 'email_not_institutional':
          errorMessage = `❌ Email No Institucional\n\nEl email ${email} no pertenece al dominio institucional @tesiscerttitlespo.onmicrosoft.com`;
          break;
          
        case 'email_not_registered':
          errorMessage = `❌ Acceso Denegado\n\nEl email ${email} no está autorizado para acceder al sistema.\n\nContacta al administrador.`;
          break;
        
        case 'role_mismatch':
        case 'role_not_allowed_for_route':
          errorMessage = `❌ Rol No Autorizado\n\n` +
            `Tu rol: ${userRole}\n` +
            `Rol requerido para ${currentRoute}: ${requiredRoleParam}\n\n` +
            `No tienes permiso para acceder a este panel.`;
          break;
          
        case 'authentication_failed':
          const details = params.get('details');
          errorMessage = `❌ Error de Autenticación\n\n${details || 'Intenta nuevamente'}`;
          break;
          
        default:
          errorMessage = `❌ Error: ${errorParam}`;
      }
      
      setError(errorMessage);
      
      // Limpiar URL después de 3 segundos
      setTimeout(() => {
        window.history.replaceState({}, '', window.location.pathname);
        setError(null);
      }, 3000);
      
      setLoading(false);
      return;
    }

    // CASO 2: Email verificado exitosamente (paso 1 completo)
    const emailVerifiedParam = params.get('email_verified');
    if (emailVerifiedParam === 'true') {
      const email = params.get('email');
      const role = params.get('role');
      const expectedWallet = params.get('expected_wallet');
      
      if (email && role && expectedWallet) {
        console.log('[Auth] ✅ Email verificado:', email);
        console.log('[Auth] 👤 Rol:', role);
        console.log('[Auth] 📍 Ruta:', currentRoute);
        console.log('[Auth] 👛 Esperando wallet:', expectedWallet.slice(0,10) + '...');
        
        const emailData: EmailVerified = {
          email,
          role,
          expectedWallet,
          allowedRoute: currentRoute // 🔒 GUARDAR LA RUTA
        };
        
        setEmailVerified(emailData);
        localStorage.setItem('email_verified_pending', JSON.stringify(emailData));
        
        // Limpiar URL
        window.history.replaceState({}, '', window.location.pathname);
      }
      
      setLoading(false);
      return;
    }

    setLoading(false);
  }, []);

  // ========================================================================
  // PASO 1: Iniciar autenticación con Microsoft
  // ========================================================================
  const signIn = async () => {
    try {
      console.log('[Auth] 🚀 Iniciando autenticación...');
      
      // 🔒 Capturar la ruta actual
      const currentPath = window.location.pathname;
      console.log('[Auth] 📍 Ruta actual:', currentPath);
      console.log('[Auth] 🔑 Rol requerido:', requiredRole);
      
      // Limpiar estados previos
      setEmailVerified(null);
      setSession(null);
      setError(null);
      localStorage.removeItem('email_verified_pending');
      localStorage.removeItem('microsoft_auth_session');
      
      // 🔒 Construir URL con la ruta actual y rol requerido
      const backendUrl = window.location.origin;
      let authUrl = `${backendUrl}/api/auth/microsoft/start?returnTo=${encodeURIComponent(currentPath)}`;
      
      if (requiredRole) {
        const roleParam = Array.isArray(requiredRole) 
          ? JSON.stringify(requiredRole) 
          : requiredRole;
        authUrl += `&requiredRole=${encodeURIComponent(roleParam)}`;
      }
      
      console.log('[Auth] 🔄 Redirigiendo a Microsoft...');
      window.location.href = authUrl;
      
    } catch (error) {
      console.error('[Auth] ❌ Error en signIn:', error);
      setError('Error al iniciar autenticación');
    }
  };

  // ========================================================================
  // PASO 2: Verificar wallet
  // ========================================================================
  const verifyWallet = async (walletAddress: string) => {
    if (!emailVerified) {
      setError('Primero debes autenticarte con tu email institucional');
      return;
    }

    try {
      console.log('[Auth] 🔍 Verificando wallet...');
      console.log('[Auth]   👛 Conectada:', walletAddress.slice(0,10) + '...');
      console.log('[Auth]   ✅ Esperada:', emailVerified.expectedWallet.slice(0,10) + '...');
      console.log('[Auth]   📍 Ruta:', emailVerified.allowedRoute);
      
      const response = await fetch('/api/auth/verify-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailVerified.email,
          wallet: walletAddress,
          intended_route: emailVerified.allowedRoute // 🔒 ENVIAR RUTA
        })
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[Auth] ❌ Wallet rechazada:', data.error);
        
        let errorMessage = '';
        
        if (data.error === 'wallet_mismatch') {
          errorMessage = `❌ Wallet Incorrecta\n\n` +
            `La wallet conectada NO corresponde al email ${emailVerified.email}\n\n` +
            `Debes conectar:\n${data.expected_wallet.slice(0,10)}...${data.expected_wallet.slice(-6)}`;
        } else if (data.error === 'role_mismatch') {
          errorMessage = `❌ Acceso Denegado\n\n${data.message}`;
        } else {
          errorMessage = data.message || 'Error verificando wallet';
        }
        
        setError(errorMessage);
        return;
      }

      console.log('[Auth] ✅ Wallet verificada');
      console.log('[Auth] ✅ Autenticación completa');
      
      // Decodificar token
      const payload = JSON.parse(atob(data.token.split('.')[1]));
      const expiresAt = payload.exp * 1000;
      
      const newSession: AuthSession = {
        wallet: data.wallet,
        email: data.email,
        role: data.role,
        token: data.token,
        expiresAt,
        allowedRoute: emailVerified.allowedRoute // 🔒 GUARDAR RUTA
      };
      
      // Guardar sesión
      localStorage.setItem('microsoft_auth_session', JSON.stringify(newSession));
      setSession(newSession);
      
      // Limpiar estado pendiente
      localStorage.removeItem('email_verified_pending');
      setEmailVerified(null);
      
    } catch (error) {
      console.error('[Auth] ❌ Error verificando wallet:', error);
      setError('Error de red al verificar wallet');
    }
  };

  // ========================================================================
  // Cerrar sesión
  // ========================================================================
  const signOut = () => {
    localStorage.removeItem('microsoft_auth_session');
    localStorage.removeItem('email_verified_pending');
    localStorage.removeItem('walletAddress');
    setSession(null);
    setEmailVerified(null);
    setError(null);
    console.log('[Auth] 👋 Sesión cerrada');
  };

  return {
    // Estados
    session,
    emailVerified,
    loading,
    error,
    
    // Flags
    isAuthenticated: !!session && isSessionValidForCurrentRoute(),
    emailIsVerified: !!emailVerified,
    needsWallet: !!emailVerified && !session,
    
    // Funciones
    isValidForCurrentRoute: isSessionValidForCurrentRoute,
    signIn,
    verifyWallet,
    signOut,
    
    // Datos
    expectedWallet: emailVerified?.expectedWallet || null,
    userEmail: emailVerified?.email || session?.email || null,
    userRole: emailVerified?.role || session?.role || null,
    allowedRoute: emailVerified?.allowedRoute || session?.allowedRoute || null
  };
}
