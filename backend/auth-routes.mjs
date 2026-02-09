// backend/auth-routes.mjs (CON VALIDACIÓN DE ROL TEMPRANA)
import express from 'express';
import pool from './db.mjs';
import {
  isInstitutionalEmail,
  getAuthorizationUrl,
  authenticateWithCode,
  getUserInfo,
  createSessionToken
} from './microsoft-auth.mjs';

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://192.168.1.100';

// ============================================================================
// PASO 1: Iniciar autenticación CON EMAIL (sin wallet)
// ============================================================================
router.get('/api/auth/microsoft/start', (req, res) => {
  // Capturar la página de origen Y el rol requerido
  const returnTo = req.query.returnTo || '/admin';
  const requiredRole = req.query.requiredRole || null;
  
  console.log('[OAuth] Iniciando autenticación por email institucional');
  console.log('[OAuth] Página de origen:', returnTo);
  console.log('[OAuth] Rol requerido:', requiredRole);
  
  // Crear state con returnTo y requiredRole
  const state = Buffer.from(JSON.stringify({ 
    returnTo,
    requiredRole 
  })).toString('base64');
  
  let authUrl;
  
  try {
    authUrl = getAuthorizationUrl();
    const url = new URL(authUrl);
    url.searchParams.set('state', state);
    authUrl = url.toString();
    
    console.log('[OAuth] URL de autenticación generada con state personalizado');
  } catch (error) {
    console.error('[OAuth] Error generando URL:', error);
    return res.redirect(`${FRONTEND_URL}/admin?error=auth_url_failed`);
  }
  
  res.redirect(authUrl);
});

// ============================================================================
// PASO 2: Callback - Validar EMAIL Y VERIFICAR ROL ANTES DE PEDIR WALLET
// ============================================================================
router.get('/api/auth/microsoft/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  // Extraer returnTo y requiredRole del state
  let returnTo = '/admin';
  let requiredRole = null;
  
  if (state) {
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      returnTo = stateData.returnTo || '/admin';
      requiredRole = stateData.requiredRole || null;
      console.log('[OAuth] State decodificado:', stateData);
      console.log('[OAuth] returnTo:', returnTo);
      console.log('[OAuth] requiredRole:', requiredRole);
    } catch (e) {
      console.warn('[OAuth] No se pudo parsear state');
    }
  }

  if (error) {
    console.error('[OAuth] Error de Microsoft:', error, error_description);
    return res.redirect(`${FRONTEND_URL}${returnTo}?error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code) {
    console.error('[OAuth] Callback inválido - falta código');
    return res.redirect(`${FRONTEND_URL}${returnTo}?error=invalid_callback`);
  }

  try {
    console.log('[OAuth] Procesando callback');
    
    // 1. Intercambiar código por token
    const tokenData = await authenticateWithCode(code);
    console.log('[OAuth] Token obtenido exitosamente');
    
    // 2. Obtener email del usuario de Microsoft
    const userInfo = await getUserInfo(tokenData.access_token);
    const { email } = userInfo;
    console.log('[OAuth] Email de Microsoft:', email);

    // 3. Validar dominio institucional
    if (!isInstitutionalEmail(email)) {
      console.error('[OAuth] ❌ Email no institucional:', email);
      return res.redirect(`${FRONTEND_URL}${returnTo}?error=email_not_institutional&email=${encodeURIComponent(email)}`);
    }

    // 4. BUSCAR USUARIO POR EMAIL
    const result = await pool.query(
      'SELECT wallet, role, email FROM wallet_roles WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      console.error('[OAuth] ❌ Email no registrado en el sistema:', email);
      return res.redirect(`${FRONTEND_URL}${returnTo}?error=email_not_registered&email=${encodeURIComponent(email)}`);
    }

    const userData = result.rows[0];
    console.log('[OAuth] ✅ Email encontrado en BD');
    console.log('[OAuth]    Email:', userData.email);
    console.log('[OAuth]    Rol del usuario:', userData.role);
    console.log('[OAuth]    Wallet registrada:', userData.wallet);

    // 5. 🔒 VALIDACIÓN DE ROL TEMPRANA (ANTES DE PEDIR WALLET)
    if (requiredRole) {
      // Verificar si el rol del usuario coincide
      const userHasRequiredRole = checkRoleMatch(userData.role, requiredRole);
      
      if (!userHasRequiredRole) {
        console.error('[OAuth] ❌ ROL INCORRECTO');
        console.error('[OAuth]    Rol del usuario:', userData.role);
        console.error('[OAuth]    Rol requerido:', requiredRole);
        
        return res.redirect(
          `${FRONTEND_URL}${returnTo}?error=role_mismatch` +
          `&user_role=${encodeURIComponent(userData.role)}` +
          `&required_role=${encodeURIComponent(requiredRole)}` +
          `&email=${encodeURIComponent(email)}`
        );
      }
      
      console.log('[OAuth] ✅ Rol verificado correctamente');
    }

    // 6. Crear token temporal (solo con email, sin wallet validada aún)
    const tempToken = createSessionToken(null, email, userData.role);

    // 7. Redirigir a pantalla de "Conectar Wallet"
    const redirectUrl = `${FRONTEND_URL}${returnTo}?email_verified=true&email=${encodeURIComponent(email)}&role=${encodeURIComponent(userData.role)}&expected_wallet=${encodeURIComponent(userData.wallet)}&temp_token=${tempToken}`;
    console.log('[OAuth] ✅ Email y rol verificados, solicitando wallet...');
    res.redirect(redirectUrl);
    
  } catch (err) {
    console.error('[OAuth] Error en callback:', err);
    res.redirect(`${FRONTEND_URL}${returnTo}?error=authentication_failed&details=${encodeURIComponent(err.message)}`);
  }
});

// ============================================================================
// FUNCIÓN AUXILIAR: Verificar si el rol del usuario coincide con el requerido
// ============================================================================
function checkRoleMatch(userRole, requiredRole) {
  // Si requiredRole es un string simple (ej: "Secretaria")
  if (typeof requiredRole === 'string') {
    return userRole === requiredRole;
  }
  
  // Si requiredRole es un array (ej: ["Grupo-APS", "Grupo-CS", ...])
  if (Array.isArray(requiredRole)) {
    return requiredRole.includes(userRole);
  }
  
  // Si requiredRole es un JSON string de array
  if (typeof requiredRole === 'string' && requiredRole.startsWith('[')) {
    try {
      const rolesArray = JSON.parse(requiredRole);
      return rolesArray.includes(userRole);
    } catch (e) {
      console.error('[OAuth] Error parseando requiredRole:', e);
      return false;
    }
  }
  
  return false;
}

// ============================================================================
// PASO 3: Validar WALLET (después de email verificado)
// ============================================================================
router.post('/api/auth/verify-wallet', async (req, res) => {
  const { email, wallet } = req.body;

  console.log('[Auth] Verificando wallet para email:', email);
  console.log('[Auth] Wallet proporcionada:', wallet);

  if (!email || !wallet) {
    return res.status(400).json({ error: 'Email y wallet requeridos' });
  }

  if (!isInstitutionalEmail(email)) {
    return res.status(400).json({ error: 'Email no institucional' });
  }

  try {
    // VALIDACIÓN ESTRICTA: email Y wallet deben coincidir
    const result = await pool.query(
      'SELECT wallet, role, email FROM wallet_roles WHERE email = $1 AND wallet = $2',
      [email, wallet]
    );

    if (result.rows.length === 0) {
      console.error('[Auth] ❌ Wallet no coincide con email');
      
      // Verificar qué wallet está registrada para este email
      const emailCheck = await pool.query(
        'SELECT wallet FROM wallet_roles WHERE email = $1',
        [email]
      );
      
      if (emailCheck.rows.length > 0) {
        const expectedWallet = emailCheck.rows[0].wallet;
        console.error('[Auth]    Wallet esperada:', expectedWallet);
        console.error('[Auth]    Wallet recibida:', wallet);
        
        return res.status(403).json({ 
          error: 'wallet_mismatch',
          message: 'La wallet conectada no coincide con la registrada para este email',
          expected_wallet: expectedWallet.slice(0, 10) + '...'
        });
      }
      
      return res.status(404).json({ error: 'Email no encontrado en el sistema' });
    }

    const userData = result.rows[0];
    console.log('[Auth] ✅ Wallet verificada exitosamente');
    console.log('[Auth]    Email:', userData.email);
    console.log('[Auth]    Wallet:', userData.wallet);
    console.log('[Auth]    Rol:', userData.role);

    // Crear token final (con wallet validada)
    const finalToken = createSessionToken(userData.wallet, userData.email, userData.role);

    res.json({
      success: true,
      wallet: userData.wallet,
      email: userData.email,
      role: userData.role,
      token: finalToken
    });
  } catch (err) {
    console.error('[Auth] Error verificando wallet:', err);
    res.status(500).json({ error: 'Error interno verificando wallet' });
  }
});

// ============================================================================
// ENDPOINT: Verificar sesión completa (opcional, para revalidar)
// ============================================================================
router.post('/api/auth/verify-session', async (req, res) => {
  const { wallet, email } = req.body;

  if (!wallet || !email) {
    return res.status(400).json({ error: 'Wallet y email requeridos' });
  }

  try {
    const result = await pool.query(
      'SELECT wallet, role, email FROM wallet_roles WHERE wallet = $1 AND email = $2',
      [wallet, email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sesión inválida' });
    }

    const userData = result.rows[0];
    
    res.json({
      valid: true,
      wallet: userData.wallet,
      email: userData.email,
      role: userData.role
    });
  } catch (err) {
    console.error('[Auth] Error verificando sesión:', err);
    res.status(500).json({ error: 'Error verificando sesión' });
  }
});

export default router;
