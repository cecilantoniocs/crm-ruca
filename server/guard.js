// /server/guard.js
import jwt from 'jsonwebtoken';

// Permisos base para no-admin si BD/JWT vienen vacíos
const DEFAULT_NONADMIN_PERMS = [
  'products.read',
  'clients.read', 'clients.create', 'clients.update',
  'orders.read', 'orders.create', 'orders.update',
  'sales.read',
];

// ---- helpers ----
function parseCookies(cookieHeader = '') {
  const out = {};
  cookieHeader.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i === -1) return;
    const k = p.slice(0, i).trim();
    const v = decodeURIComponent(p.slice(i + 1).trim());
    if (k) out[k] = v;
  });
  return out;
}

function getTokenFromReq(req) {
  const cookies = parseCookies(req.headers?.cookie || '');
  const c1 = cookies['auth_token'];
  const c2 = cookies['token'];
  const auth = req.headers?.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  return c1 || c2 || bearer || null;
}

function normalizePerms(val) {
  if (Array.isArray(val)) return val;
  if (val == null || val === '') return [];
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val.replace(/""/g, '"'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      const parts = val.split(',').map((s) => s.trim()).filter(Boolean);
      return parts;
    }
  }
  return [];
}

// 👇 clave: normaliza la clave a minúsculas y reemplaza ":" por "."
function normalizePermKey(s) {
  return String(s || '').trim().toLowerCase().replace(/:/g, '.');
}

// ---- API ----
export function getReqUser(req) {
  try {
    const token = getTokenFromReq(req);
    if (!token) return null;
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;

    const payload = jwt.verify(token, secret);

    const isAdmin = !!(payload.is_admin ?? payload.isAdmin);
    const partnerTag = (payload.partner_tag ?? payload.partnerTag ?? '').toString();

    // normaliza array y también cada clave (":" -> ".")
    let perms = normalizePerms(payload.permissions).map(normalizePermKey);

    // fallback si no-admin y quedó vacío
    if (!isAdmin && perms.length === 0) {
      perms = DEFAULT_NONADMIN_PERMS;
    }

    const user = {
      id: payload.id,
      email: payload.email ?? null,
      name: payload.name ?? null,

      is_admin: isAdmin,
      isAdmin: isAdmin,

      permissions: perms,

      partner_tag: partnerTag,
      partnerTag: partnerTag,

      can_deliver: !!(payload.can_deliver ?? payload.canDeliver),
    };

    return user;
  } catch (e) {
    return null;
  }
}

export function requireAuth(user) {
  if (!user) {
    const err = new Error('UNAUTHENTICATED');
    err.status = 401;
    throw err;
  }
}

export function requirePerm(user, perm) {
  requireAuth(user);
  if (user.is_admin || user.isAdmin) return;

  const want = normalizePermKey(perm);
  const set = new Set((user.permissions || []).map(normalizePermKey));

  if (set.has('*') || set.has(want)) return;

  const err = new Error('FORBIDDEN');
  err.status = 403;
  throw err;
}

// ✅ Nuevo helper: permite si el usuario tiene AL MENOS UNO de la lista
export function requireAnyPerm(user, perms = []) {
  requireAuth(user);
  if (user.is_admin || user.isAdmin) return;

  const have = new Set((user.permissions || []).map(normalizePermKey));
  for (const p of perms) {
    if (have.has('*') || have.has(normalizePermKey(p))) return;
  }

  const err = new Error('FORBIDDEN');
  err.status = 403;
  throw err;
}
