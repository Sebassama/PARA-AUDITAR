// backend/microsoft-auth.mjs
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

const MICROSOFT_CONFIG = {
  clientId: process.env.MICROSOFT_CLIENT_ID,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  tenantId: process.env.MICROSOFT_TENANT_ID,
  redirectUri: process.env.MICROSOFT_REDIRECT_URI || 'https://192.168.1.100/api/auth/microsoft/callback',
  scopes: ['openid', 'email', 'profile', 'User.Read']
};

// Validar que el email sea institucional
export function isInstitutionalEmail(email) {
  if (!email) return false;
  return email.toLowerCase().endsWith('@tesiscerttitlespo.onmicrosoft.com');
}

// Generar URL de autorización
export function getAuthorizationUrl(wallet) {
  const params = new URLSearchParams({
    client_id: MICROSOFT_CONFIG.clientId,
    response_type: 'code',
    redirect_uri: MICROSOFT_CONFIG.redirectUri,
    response_mode: 'query',
    scope: MICROSOFT_CONFIG.scopes.join(' '),
    state: wallet, // Guardamos la wallet en state
    prompt: 'select_account'
  });

  return `https://login.microsoftonline.com/${MICROSOFT_CONFIG.tenantId}/oauth2/v2.0/authorize?${params}`;
}

// Intercambiar código por token
export async function authenticateWithCode(code) {
  const tokenEndpoint = `https://login.microsoftonline.com/${MICROSOFT_CONFIG.tenantId}/oauth2/v2.0/token`;
  
  const params = new URLSearchParams({
    client_id: MICROSOFT_CONFIG.clientId,
    client_secret: MICROSOFT_CONFIG.clientSecret,
    code: code,
    redirect_uri: MICROSOFT_CONFIG.redirectUri,
    grant_type: 'authorization_code',
    scope: MICROSOFT_CONFIG.scopes.join(' ')
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return await response.json();
}

// Obtener info del usuario
export async function getUserInfo(accessToken) {
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error('Failed to get user info');
  }

  const data = await response.json();
  return {
    email: data.mail || data.userPrincipalName,
    name: data.displayName,
    id: data.id
  };
}

// Crear JWT de sesión
export function createSessionToken(wallet, email, role) {
  const payload = { wallet, email, role };
  const secret = process.env.JWT_SECRET;
  const expiresIn = parseInt(process.env.SESSION_DURATION || '3600');
  
  return jwt.sign(payload, secret, { expiresIn });
}

// Verificar JWT
export function verifySessionToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
}
