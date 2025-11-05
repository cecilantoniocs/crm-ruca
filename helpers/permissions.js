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
      togglePaid: 'Marcar pagado',
      toggleInvoice: 'Marcar facturado',
    },
  },
  clientAccount: {
    // 👈 NUEVO módulo para la pantalla /client/[id]/account
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
  admin: allTrue(), // 👈 admin tiene TODO en true, incluyendo clientAccount.read/charge

  repartidor: mergeFalse(allFalse(), {
    clients: { view: true, create: true, edit: true },
    orders: { view: true, create: true, edit: true, markDelivered: true },
    products: { view: true },
    sales: { view: true },
    clientAccount: { read: true }, // puede mirar saldo del cliente
    // nada en users
  }),

  vendedor: mergeFalse(allFalse(), {
    clients: { view: true, create: true, edit: true },
    orders: { view: true, create: true, edit: true },
    products: { view: true },
    sales: { view: true, togglePaid: true },
    clientAccount: { read: true, charge: true }, // vendedor suele cobrar
  }),

  supervisor: mergeFalse(allFalse(), {
    clients: { view: true, edit: true },
    orders: { view: true, edit: true, markDelivered: true },
    products: { view: true, edit: true },
    sales: { view: true, togglePaid: true, toggleInvoice: true },
    users: { view: true },
    clientAccount: { read: true, charge: true },
  }),

  // 'produccion' si existe en tu backend, dale lo que quieras o déjalo vacío
  produccion: mergeFalse(allFalse(), {
    products: { view: true, edit: true },
    clients: { view: true },
    clientAccount: { read: true }, // puede ver cuánto deben pero no cobrar
  }),
};

export function templateForRole(role) {
  const r = String(role || '').toLowerCase();
  const tpl = ROLE_TEMPLATES[r] || emptyPermissions();
  // devolver copia para no mutar global
  return JSON.parse(JSON.stringify(tpl));
}

// ==============================
// 3) Normalización de permisos/usuario
// ==============================
export function normalizePermissions(perms, role) {
  // "perms" que venga del backend (obj), o usamos plantilla para el rol
  const base = perms && typeof perms === 'object' ? perms : {};
  const withRole = mergeDeep(templateForRole(role), base);

  // Garantizar todas las llaves del esquema
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
  return {
    id: user.id ?? null,
    name: user.name ?? '',
    email: user.email ?? '',
    role,
    isAdmin: Boolean(isAdm),
    permissions: normalizePermissions(user.permissions, role),
    partnerTag: user.partnerTag ?? user.partner_tag ?? null,
    sellerId: user.sellerId ?? user.id ?? null,
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
  } catch {
    // noop
  }
}

export function ensureStoredUserNormalized() {
  if (typeof window === 'undefined') return null;
  const u = getCurrentUser();
  if (!u) return null;
  setCurrentUser(u);
  return u;
}

// ==============================
// 5) helpers can / canAny
// ==============================

export function isAdmin(user = getCurrentUser()) {
  return Boolean(user?.isAdmin);
}

/**
 * can('orders.edit')  o  can('orders','edit')
 */
export function can(moduleOrDot, actionOpt, user = getCurrentUser()) {
  if (!user) return false;
  if (user.isAdmin) return true; // admin siempre true

  let mod = moduleOrDot;
  let act = actionOpt;

  if (actionOpt == null && typeof moduleOrDot === 'string' && moduleOrDot.includes('.')) {
    const [m, a] = moduleOrDot.split('.');
    mod = m;
    act = a;
  }

  mod = String(mod || '').trim();
  act = String(act || '').trim();
  if (!mod || !act) return false;

  const perms = user.permissions || {};
  return Boolean(perms?.[mod]?.[act]);
}

/**
 * canAny(['orders.edit','orders.delete'])  o  canAny([['orders','edit'], ...])
 */
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
