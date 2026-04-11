// /server/guard.js
import jwt from 'jsonwebtoken';

// Permisos base que se le dan a un usuario NO admin cuando el JWT
// viene sin "permissions" o viene vacío.
// OJO: acá solo van permisos de lectura / uso normal.
// NO agregamos cosas peligrosas como marcar pagado, cobrar, etc.
const DEFAULT_NONADMIN_PERMS = [
  // productos / clientes / órdenes básicas
  'products.read',
  'clients.read',
  'clients.create',
  'clients.update',
  'orders.read',
  'orders.create',
  'orders.update',

  // ventas: solo lectura
  'sales.read',

  // cuenta de cliente: ver estado de cuenta/saldo
  'client.account.read',
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
      // a veces llega como string tipo '["a","b"]' pero con comillas dobladas
      const parsed = JSON.parse(val.replace(/""/g, '"'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // fallback: string con comas -> array
      const parts = val.split(',').map((s) => s.trim()).filter(Boolean);
      return parts;
    }
  }
  return [];
}

// normaliza la clave de permiso: lowercase y reemplaza ":" por "."
// Ej: "sales:update_payment" -> "sales.update_payment"
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

    // fallback si es NO admin y viene sin permisos -> le damos baseline segura
    if (!isAdmin && perms.length === 0) {
      perms = DEFAULT_NONADMIN_PERMS;
    }

    // carteras: array de carteras asignadas al usuario
    let carteras = Array.isArray(payload.carteras) ? payload.carteras : [];
    if (isAdmin) {
      carteras = ['rucapellan', 'cecil'];
    } else if (carteras.length === 0 && partnerTag) {
      carteras = [partnerTag]; // fallback legacy
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

      carteras,

      can_deliver: !!(payload.can_deliver ?? payload.canDeliver),
    };

    return user;
  } catch (e) {
    return null;
  }
}

// Exigir login
export function requireAuth(user) {
  if (!user) {
    const err = new Error('UNAUTHENTICATED');
    err.status = 401;
    throw err;
  }
}

// Exigir un permiso específico
// Uso: requirePerm(user, 'sales.read')
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

// Exigir AL MENOS UNO de una lista de permisos
// Uso: requireAnyPerm(user, ['sales.mark_paid','sales.update_invoice'])
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
