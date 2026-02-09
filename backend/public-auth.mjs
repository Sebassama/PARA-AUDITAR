// backend/public-auth.mjs
// 🔓 AUTENTICACIÓN PÚBLICA - SOLO EMAIL MICROSOFT (SIN WALLET)
import express from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://192.168.1.100';
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const PUBLIC_REDIRECT_URI = process.env.PUBLIC_REDIRECT_URI || `${FRONTEND_URL}/api/auth/public/callback`;
const JWT_SECRET = process.env.JWT_SECRET;
const PUBLIC_SESSION_DURATION = parseInt(process.env.PUBLIC_SESSION_DURATION || '600'); // 10 min

// 🔓 VALIDADOR: Cualquier email de Microsoft es válido
function isMicrosoftEmail(email) {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  return /@(outlook|hotmail|live|[a-z0-9-]+\.onmicrosoft)\.com$/i.test(normalized);
}

// ============================================================================
// 🔓 INICIO: Autenticación pública (solo email)
// ============================================================================
router.get('/start', (req, res) => {
  try {
    const returnTo = req.query.returnTo || '/validate';
    
    console.log('[PublicAuth] 📍 Inicio autenticación pública');
    console.log('[PublicAuth] Retorno a:', returnTo);
    
    // 🔒 VALIDAR: Solo rutas de validación permitidas
    const allowedRoutes = ['/validate', '/validate/owner'];
    if (!allowedRoutes.includes(returnTo)) {
      console.error('[PublicAuth] ❌ Ruta no permitida:', returnTo);
      return res.redirect(`${FRONTEND_URL}${returnTo}?error=invalid_route`);
    }
    
    if (!MICROSOFT_CLIENT_ID) {
      console.error('[PublicAuth] ❌ MICROSOFT_CLIENT_ID no configurado');
      return res.redirect(`${FRONTEND_URL}${returnTo}?error=config_error`);
    }
    
    // State para mantener la ruta
    const state = Buffer.from(JSON.stringify({ returnTo, mode: 'public' })).toString('base64');
    
    // Construir URL de Microsoft (tenant 'common' = cualquier Microsoft)
    const authUrl = 
      `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
      `client_id=${MICROSOFT_CLIENT_ID}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(PUBLIC_REDIRECT_URI)}&` +
      `response_mode=query&` +
      `scope=openid%20email%20profile%20User.Read&` +
      `state=${state}&` +
      `prompt=select_account`;
    
    console.log('[PublicAuth] 🔄 Redirigiendo a Microsoft...');
    console.log('[PublicAuth] Redirect URI:', PUBLIC_REDIRECT_URI);
    res.redirect(authUrl);
    
  } catch (error) {
    console.error('[PublicAuth] ❌ Error en /start:', error);
    res.redirect(`${FRONTEND_URL}/validate?error=server_error`);
  }
});

// ============================================================================
// 🔓 CALLBACK: Procesar código de Microsoft
// ============================================================================
router.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  
  // Decodificar state
  let returnTo = '/validate';
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
    returnTo = decoded.returnTo || '/validate';
    console.log('[PublicAuth] State decodificado, returnTo:', returnTo);
  } catch (e) {
    console.warn('[PublicAuth] ⚠️ State inválido');
  }
  
  if (error) {
    console.error('[PublicAuth] ❌ Error OAuth:', error, error_description);
    return res.redirect(
      `${FRONTEND_URL}${returnTo}?error=auth_failed&details=${encodeURIComponent(error_description || error)}`
    );
  }
  
  if (!code) {
    console.error('[PublicAuth] ❌ No code received');
    return res.redirect(`${FRONTEND_URL}${returnTo}?error=no_code`);
  }
  
  try {
    console.log('[PublicAuth] 🔄 Intercambiando código por token...');
    
    // Intercambiar código por token
    const tokenResponse = await fetch(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          code: code,
          redirect_uri: PUBLIC_REDIRECT_URI,
          grant_type: 'authorization_code',
          scope: 'openid email profile User.Read'
        })
      }
    );
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[PublicAuth] ❌ Token exchange failed:', errorText);
      throw new Error('Token exchange failed');
    }
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    
    // Obtener perfil del usuario
    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!profileResponse.ok) {
      console.error('[PublicAuth] ❌ Profile fetch failed');
      throw new Error('Profile fetch failed');
    }
    
    const profile = await profileResponse.json();
    const email = profile.mail || profile.userPrincipalName;
    
    console.log('[PublicAuth] 📧 Email obtenido:', email);
    
    // 🔒 VALIDAR: Debe ser cuenta Microsoft
    if (!isMicrosoftEmail(email)) {
      console.error('[PublicAuth] ❌ No es email Microsoft:', email);
      return res.redirect(
        `${FRONTEND_URL}${returnTo}?error=not_microsoft&email=${encodeURIComponent(email)}`
      );
    }
    
    console.log('[PublicAuth] ✅ Email Microsoft válido');
    
    // Crear JWT público (10 minutos)
    const jwtPayload = {
      email,
      type: 'public',
      route: returnTo,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + PUBLIC_SESSION_DURATION
    };
    
    const token = jwt.sign(jwtPayload, JWT_SECRET);
    
    console.log('[PublicAuth] ✅ Token creado (10 min)');
    console.log('[PublicAuth] 📍 Redirigiendo a:', returnTo);
    
    // Redirigir con token
    res.redirect(
      `${FRONTEND_URL}${returnTo}?auth_success=true&token=${token}&email=${encodeURIComponent(email)}`
    );
    
  } catch (err) {
    console.error('[PublicAuth] ❌ Error en callback:', err);
    res.redirect(
      `${FRONTEND_URL}${returnTo}?error=auth_failed&details=${encodeURIComponent(err.message)}`
    );
  }
});

// ============================================================================
// 🔓 VERIFICAR: Validar token
// ============================================================================
router.post('/verify', (req, res) => {
  try {
    const { token, route } = req.body;
    
    if (!token) {
      return res.status(400).json({ ok: false, error: 'Token requerido' });
    }
    
    // Verificar JWT
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // 🔒 VALIDACIONES
    if (decoded.type !== 'public') {
      console.error('[PublicAuth] ❌ Token no es público');
      return res.status(403).json({ ok: false, error: 'Token no es público' });
    }
    
    if (route && decoded.route !== route) {
      console.error('[PublicAuth] ❌ Token no válido para esta ruta');
      return res.status(403).json({ ok: false, error: 'Token no válido para esta ruta' });
    }
    
    if (!isMicrosoftEmail(decoded.email)) {
      console.error('[PublicAuth] ❌ Email no válido');
      return res.status(403).json({ ok: false, error: 'Email no válido' });
    }
    
    console.log('[PublicAuth] ✅ Token válido para:', decoded.email);
    
    return res.json({
      ok: true,
      email: decoded.email,
      expiresAt: decoded.exp * 1000
    });
    
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ ok: false, error: 'Token expirado' });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ ok: false, error: 'Token inválido' });
    }
    
    console.error('[PublicAuth] ❌ Error verificando token:', error);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

export default router;
