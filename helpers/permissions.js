// /helpers/permissions.js

// ==============================
// 1) Esquema de permisos
// ==============================
export const PERMISSIONS_SCHEMA = {
  clients: {
    label: 'Clientes',
    actions: {
      view: 'Ver',
      create: 'Crear',
      edit: 'Editar',
      delete: 'Eliminar',
    },
  },
  orders: {
    label: 'Pedidos',
    actions: {
      view: 'Ver',
      create: 'Crear',
      edit: 'Editar',
      delete: 'Eliminar',
      markDelivered: 'Marcar entregado',
    },
  },
  products: {
    label: 'Productos',
    actions: {
      view: 'Ver',
      create: 'Crear',
      edit: 'Editar',
      delete: 'Eliminar',
    },
  },
  sales: {
    label: 'Ventas / Cobranza',
    actions: {
      view: 'Ver',
      markPaid: 'Marcar pagado',
      updateInvoice: 'Marcar facturado',
      updatePayment: 'Cambiar método de pago',
      kpis: 'Ver KPIs',
    },
  },
  clientAccount: {
    label: 'Cuenta del Cliente',
    actions: {
      read: 'Ver cuenta',
      charge: 'Registrar / eliminar abonos',
    },
  },
  users: {
    label: 'Usuarios',
    actions: {
      view: 'Ver',
      create: 'Crear',
      edit: 'Editar',
      delete: 'Eliminar',
    },
  },
  // Nuevo módulo: Tracking
  tracking: {
    label: 'Tracking',
    actions: {
      view: 'Ver',
    },
  },
};

// ==============================
// helpers internos
// ==============================
export function emptyPermissions() {
  const out = {};
  for (const mod of Object.keys(PERMISSIONS_SCHEMA)) {
    out[mod] = {};
    for (const a of Object.keys(PERMISSIONS_SCHEMA[mod].actions)) {
      out[mod][a] = false;
    }
  }
  return out;
}
function allTrue() {
  const out = {};
  for (const mod of Object.keys(PERMISSIONS_SCHEMA)) {
    out[mod] = {};
    for (const a of Object.keys(PERMISSIONS_SCHEMA[mod].actions)) {
      out[mod][a] = true;
    }
  }
  return out;
}
function mergeDeep(base, patch) {
  const out = JSON.parse(JSON.stringify(base || {}));
  for (const k of Object.keys(patch || {})) {
    const v = patch[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = mergeDeep(out[k] || {}, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
function mergeFalse(base, patch) {
  return mergeDeep(base, patch);
}
function allFalse() {
  return emptyPermissions();
}

// ==============================
// 2) Plantillas por rol
// ==============================
export const ROLE_TEMPLATES = {
  admin: allTrue(), // Admin todo true

  repartidor: mergeFalse(allFalse(), {
    clients: { view: true, create: true, edit: true },
    orders: { view: true, create: true, edit: true, markDelivered: true },
    products: { view: true },
    sales: { view: true, markPaid: true },
    clientAccount: { read: true, charge: true },
    // tracking: { view: false } // por defecto no
  }),

  vendedor: mergeFalse(allFalse(), {
    clients: { view: true, create: true, edit: true },
    orders: { view: true, create: true, edit: true },
    products: { view: true },
    sales: {
      view: true,
      markPaid: true,
      updateInvoice: false,
      updatePayment: false,
      // kpis: true,
    },
    clientAccount: { read: true, charge: true },
    // tracking: { view: false }
  }),

  supervisor: mergeFalse(allFalse(), {
    clients: { view: true, edit: true },
    orders: { view: true, edit: true, markDelivered: true },
    products: { view: true, edit: true },
    sales: {
      view: true,
      markPaid: true,
      updateInvoice: true,
      updatePayment: true,
      kpis: true,
    },
    users: { view: true },
    clientAccount: { read: true, charge: true },
    tracking: { view: true }, // <- puede ver Tracking
  }),

  produccion: mergeFalse(allFalse(), {
    products: { view: true, edit: true },
    clients: { view: true },
    clientAccount: { read: true },
    // tracking: { view: false }
  }),
};

export function templateForRole(role) {
  const r = String(role || '').toLowerCase();
  const tpl = ROLE_TEMPLATES[r] || emptyPermissions();
  return JSON.parse(JSON.stringify(tpl));
}

// ==============================
// 3) Normalización tokens <-> objeto y usuario
// ==============================

// Convierte lista de tokens ("module:action") a objeto booleans por módulo/acción
export function tokensToPermsObject(list = []) {
  const out = emptyPermissions();
  const has = (k) => list.some((p) => String(p).toLowerCase() === String(k).toLowerCase());

  // clients
  out.clients.view   = has('clients:read');
  out.clients.create = has('clients:create');
  out.clients.edit   = has('clients:update');
  out.clients.delete = has('clients:delete');

  // orders
  out.orders.view          = has('orders:read') || has('orders:update') || has('orders:create') || has('orders:delete');
  out.orders.create        = has('orders:create');
  out.orders.edit          = has('orders:update');
  out.orders.delete        = has('orders:delete');
  out.orders.markDelivered = has('orders:update');

  // products
  out.products.view   = has('products:read') || has('products:update') || has('products:create') || has('products:delete');
  out.products.create = has('products:create');
  out.products.edit   = has('products:update');
  out.products.delete = has('products:delete');

  // sales (granular) + legacy fallback 'sales:update'
  out.sales.view          = has('sales:read') || has('sales:update');
  out.sales.markPaid      = has('sales.mark_paid') || has('sales:update');
  out.sales.updateInvoice = has('sales.update_invoice') || has('sales:update');
  out.sales.updatePayment = has('sales.update_payment') || has('sales:update');
  out.sales.kpis          = has('sales.kpis.view') || has('sales:update');

  // clientAccount
  out.clientAccount.read   = has('client.account.read');
  out.clientAccount.charge = has('client.account.charge');

  // tracking (acepta varias formas)
  out.tracking.view =
    has('tracking:view') ||
    has('tracking.view') ||
    has('tracking:read') ||
    has('tracking.read') ||
    has('gps:view') ||
    has('gps.read') ||
    has('locations:view') ||
    has('locations.read');

  // users
  out.users.view   = has('users:read') || has('users:update') || has('users:create') || has('users:delete');
  out.users.create = has('users:create');
  out.users.edit   = has('users:update');
  out.users.delete = has('users:delete');

  return out;
}

export function normalizePermissions(perms, role) {
  const base =
    Array.isArray(perms) ? tokensToPermsObject(perms)
    : perms && typeof perms === 'object' ? perms
    : {};

  const withRole = mergeDeep(templateForRole(role), base);

  const out = {};
  for (const mod of Object.keys(PERMISSIONS_SCHEMA)) {
    out[mod] = {};
    const actions = PERMISSIONS_SCHEMA[mod].actions;
    const src = withRole[mod] || {};
    for (const act of Object.keys(actions)) {
      out[mod][act] = Boolean(src[act]);
    }
  }
  return out;
}

export function normalizeUser(user) {
  if (!user || typeof user !== 'object') return null;
  const role = user.role || (user.isAdmin ? 'admin' : user.role) || '';
  const isAdm = user.isAdmin || String(role).toLowerCase() === 'admin';
  // Si viene array de tokens desde backend, convertir antes de normalizar
  const permsInput = Array.isArray(user.permissions)
    ? tokensToPermsObject(user.permissions)
    : user.permissions;

  return {
    id: user.id ?? null,
    name: user.name ?? '',
    email: user.email ?? '',
    role,
    isAdmin: Boolean(isAdm),
    permissions: normalizePermissions(permsInput, role),
    partnerTag: user.partnerTag ?? user.partner_tag ?? null,
    sellerId: user.sellerId ?? user.id ?? null,

    // flags reparto
    canDeliver: user.canDeliver ?? user.can_deliver ?? false,
    can_deliver: user.can_deliver ?? user.canDeliver ?? false,
  };
}


// ==============================
// 4) localStorage helpers
// ==============================
const LS_KEY = 'userData';

export function getCurrentUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return normalizeUser(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function setCurrentUser(userObj) {
  if (typeof window === 'undefined') return;
  try {
    const normalized = normalizeUser(userObj);
    localStorage.setItem(LS_KEY, JSON.stringify(normalized));
  } catch {}
}

export function ensureStoredUserNormalized() {
  if (typeof window === 'undefined') return null;
  const u = getCurrentUser();
  if (!u) return null;
  setCurrentUser(u);
  return u;
}

// ==============================
// 5) helpers can / canAny / isAdmin
// ==============================
export function isAdmin(user = getCurrentUser()) {
  return Boolean(user?.isAdmin);
}

/**
 * can('orders.edit')  o  can('orders','edit')  o  can('sales.kpis.view')
 */
export function can(moduleOrDot, actionOpt, user = getCurrentUser()) {
  if (!user) return false;
  if (user.isAdmin) return true;

  let mod = moduleOrDot;
  let act = actionOpt;

  if (actionOpt == null && typeof moduleOrDot === 'string' && moduleOrDot.includes('.')) {
    // Soporta acciones con varios puntos ('kpis.view', 'account.read', etc.)
    const firstDot = moduleOrDot.indexOf('.');
    const m = moduleOrDot.slice(0, firstDot);
    const a = moduleOrDot.slice(firstDot + 1);
    mod = m;
    act = a;
  }

  mod = String(mod || '').trim();
  act = String(act || '').trim();
  if (!mod || !act) return false;

  const perms = user.permissions || {};
  // Compatibilidad: si no existe 'kpis.view' intenta 'kpis'
  if (act.includes('.') && !(perms?.[mod]?.[act])) {
    const head = act.split('.')[0];
    return Boolean(perms?.[mod]?.[head]);
  }
  return Boolean(perms?.[mod]?.[act]);
}

export function canAny(permsList = [], user = getCurrentUser()) {
  if (!user) return false;
  if (user.isAdmin) return true;
  for (const entry of permsList) {
    if (Array.isArray(entry)) {
      const [m, a] = entry;
      if (can(m, a, user)) return true;
    } else if (typeof entry === 'string') {
      if (can(entry, undefined, user)) return true;
    }
  }
  return false;
}
