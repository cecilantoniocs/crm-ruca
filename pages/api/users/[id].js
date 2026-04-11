// /pages/api/users/[id].js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requirePerm } from '@/server/guard';
import bcrypt from 'bcryptjs';

/** UUID v4 approx */
function looksLikeUuid(v = '') {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
    String(v)
  );
}

const SELECT_FIELDS =
  'id,name,email,role,is_admin,permissions,created_at,partner_tag,can_deliver,last_seen_at,carteras';

const ALL_CARTERAS = ['rucapellan', 'cecil'];

function coerceCarteras(val, isAdmin = false) {
  if (isAdmin) return ALL_CARTERAS;
  if (Array.isArray(val)) return val.filter((v) => ALL_CARTERAS.includes(String(v)));
  return [];
}

const ALLOWED_ROLES = new Set(['admin', 'vendedor', 'supervisor', 'repartidor', 'produccion']);

/* ================= Permisos ================= */

function permsObjectToList(permsObj = {}) {
  const out = [];
  const add = (cond, key) => cond && out.push(key);

  const c = permsObj.clients || {};
  add(c.view,   'clients:read');
  add(c.create, 'clients:create');
  add(c.edit,   'clients:update');
  add(c.delete, 'clients:delete');

  const o = permsObj.orders || {};
  add(o.view,          'orders:read');
  add(o.create,        'orders:create');
  add(o.edit,          'orders:update');
  add(o.delete,        'orders:delete');
  add(o.markDelivered, 'orders:update');

  const p = permsObj.products || {};
  add(p.view,   'products:read');
  add(p.create, 'products:create');
  add(p.edit,   'products:update');
  add(p.delete, 'products:delete');

  const s = permsObj.sales || {};
  add(s.view,         'sales:read');
  add(s.togglePaid,   'sales:update');
  add(s.toggleInvoice,'sales:update');

  const u = permsObj.users || {};
  add(u.view,   'users.read');
  add(u.create, 'users.create');
  add(u.edit,   'users.update');
  add(u.delete, 'users.delete');

  return Array.from(new Set(out));
}

function coercePermList(val) {
  if (Array.isArray(val)) return val.map(String);
  if (val && typeof val === 'object') return permsObjectToList(val);
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s.replace(/""/g, '"'));
      if (Array.isArray(parsed)) return parsed.map(String);
      if (parsed && typeof parsed === 'object') return permsObjectToList(parsed);
    } catch {}
    return s.split(',').map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

/* ================= Roles ================= */

function normalizeRole(raw) {
  if (raw === undefined || raw === null) return undefined;

  let v = raw;
  if (typeof v === 'object' && v) v = v.value ?? v.label ?? String(v);
  if (typeof v === 'number') {
    if (v === 0) return 'admin';
    if (v === 1) return 'vendedor';
    if (v === 2) return 'supervisor';
    if (v === 3) return 'repartidor';
    if (v === 4) return 'produccion';
  }
  const s = String(v || '').trim().toLowerCase();
  if (!s) return undefined;

  if (s.includes('admin')) return 'admin';
  if (s.startsWith('super') || s.includes('superv')) return 'supervisor';
  if (s.includes('repart') || s.includes('courier') || s.includes('delivery')) return 'repartidor';
  if (s.includes('producc') || s.includes('producción')) return 'produccion';
  if (s.includes('vend') || s.includes('seller') || s.includes('sales')) return 'vendedor';

  return ALLOWED_ROLES.has(s) ? s : null;
}

/* ================= Utils ================= */

function mapRow(u) {
  if (!u) return null;
  const lastMs = u.last_seen_at ? new Date(u.last_seen_at).getTime() : 0;
  const online = lastMs ? (Date.now() - lastMs) <= 120_000 : false;
  const isAdmin = !!u.is_admin;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role || null,
    is_admin: isAdmin,
    partner_tag: u.partner_tag || '',
    can_deliver: !!u.can_deliver,
    permissions: Array.isArray(u.permissions) ? u.permissions : [],
    carteras: coerceCarteras(u.carteras, isAdmin),
    created_at: u.created_at,
    last_seen_at: u.last_seen_at || null,
    online,
  };
}

async function selectOneByIdOrEmail(idOrEmail) {
  if (looksLikeUuid(idOrEmail)) {
    return supabaseServer.from('users_app').select(SELECT_FIELDS).eq('id', idOrEmail).maybeSingle();
  }
  return supabaseServer.from('users_app').select(SELECT_FIELDS).ilike('email', idOrEmail).maybeSingle();
}

async function updateUserByIdRobust(id, patch) {
  let res = await supabaseServer
    .from('users_app')
    .update(patch)
    .eq('id', id)
    .select(SELECT_FIELDS)
    .maybeSingle();

  if (res.error) {
    const msg = String(res.error.message || '').toLowerCase();
    const typeProblem =
      res.error.code === '22P02' ||
      res.error.code === '42804' ||
      msg.includes('invalid input syntax') ||
      msg.includes('json') ||
      msg.includes('type text');

    if (typeProblem && Array.isArray(patch.permissions)) {
      const retryPatch = { ...patch, permissions: JSON.stringify(patch.permissions) };
      res = await supabaseServer
        .from('users_app')
        .update(retryPatch)
        .eq('id', id)
        .select(SELECT_FIELDS)
        .maybeSingle();
    }
  }
  return res;
}

/* ================= Handler ================= */

export default async function handler(req, res) {
  const user = getReqUser(req);
  const idParam = decodeURIComponent(String(req.query.id || '').trim());
  const DEBUG = false;

  try {
    if (req.method === 'GET') {
      requirePerm(user, 'users.read');

      const found = await selectOneByIdOrEmail(idParam);
      if (found.error) return res.status(500).json({ error: 'DB_ERROR', detail: found.error.message });
      if (!found.data) return res.status(404).json({ error: 'No encontrado' });
      return res.status(200).json(mapRow(found.data));
    }

    if (req.method === 'PATCH') {
      requirePerm(user, 'users.update');

      const body = req.body || {};

      const found = await selectOneByIdOrEmail(idParam);
      if (found.error) return res.status(500).json({ error: 'DB_ERROR', detail: found.error.message });
      if (!found.data) return res.status(404).json({ error: 'No encontrado' });

      const current = found.data;
      const patch = {};

      if ('name' in body) patch.name = String(body.name || '').trim() || null;

      if ('email' in body) {
        const nextEmail = String(body.email || '').trim().toLowerCase() || null;
        if (nextEmail && nextEmail !== String(current.email || '').toLowerCase()) {
          const dup = await supabaseServer
            .from('users_app')
            .select('id')
            .eq('email', nextEmail)
            .neq('id', current.id)
            .limit(1);
          if (dup.error) return res.status(500).json({ error: 'DB_ERROR', detail: dup.error.message });
          if (Array.isArray(dup.data) && dup.data.length > 0) {
            return res.status(409).json({ error: 'EMAIL_IN_USE' });
          }
          patch.email = nextEmail;
        }
      }

      const roleNorm = normalizeRole(body.role ?? body.rol ?? body.userRole);
      if (roleNorm === null) {
        return res.status(400).json({
          error: 'ROLE_INVALID',
          detail: 'Valores permitidos: admin, vendedor, supervisor, repartidor, produccion',
        });
      } else if (roleNorm !== undefined && roleNorm !== (current.role || '')) {
        patch.role = roleNorm;
      }

      if ('is_admin' in body || 'isAdmin' in body) {
        patch.is_admin = !!(body.is_admin ?? body.isAdmin);
      }
      if ('partner_tag' in body || 'partnerTag' in body) {
        const rawTag = String(body.partner_tag ?? body.partnerTag ?? '').trim();
        patch.partner_tag = rawTag || null;
      }
      if ('carteras' in body) {
        const isAdminVal = 'is_admin' in body ? !!(body.is_admin ?? body.isAdmin) : !!current.is_admin;
        patch.carteras = coerceCarteras(body.carteras, isAdminVal);
      }
      if ('can_deliver' in body || 'canDeliver' in body) {
        patch.can_deliver = !!(body.can_deliver ?? body.canDeliver);
      }

      if ('permissions' in body || 'perms' in body) {
        const src = body.permissions ?? body.perms;
        patch.permissions = coercePermList(src);
      }

      if (body.password && String(body.password).trim()) {
        patch.password_hash = await bcrypt.hash(String(body.password).trim(), 12);
      }

      // last_seen_at NO se actualiza aquí (lo hace /api/auth/ping)

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: 'Sin cambios' });
      }

      const upd = await updateUserByIdRobust(current.id, patch);
      if (upd.error) {
        const msg = String(upd.error.message || '');
        if (msg.includes('users_app_role_check')) {
          return res.status(400).json({
            error: 'ROLE_INVALID',
            detail: 'Valores permitidos: admin, vendedor, supervisor, repartidor, produccion',
          });
        }
        return res.status(500).json({ error: 'DB_ERROR', detail: upd.error.message });
      }
      if (!upd.data) return res.status(404).json({ error: 'No encontrado' });

      return res.status(200).json(mapRow(upd.data));
    }

    if (req.method === 'DELETE') {
      requirePerm(user, 'users.delete');

      const found = await selectOneByIdOrEmail(idParam);
      if (found.error) return res.status(500).json({ error: 'DB_ERROR', detail: found.error.message });
      if (!found.data) return res.status(404).json({ error: 'No encontrado' });

      const del = await supabaseServer.from('users_app').delete().eq('id', found.data.id);
      if (del.error) return res.status(500).json({ error: 'DB_ERROR', detail: del.error.message });

      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, PATCH, DELETE');
    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    const status = e.status || 500;
    const msg = e.message || 'SERVER_ERROR';
    return res.status(status).json({ error: msg });
  }
}
