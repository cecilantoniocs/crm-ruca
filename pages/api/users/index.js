// /pages/api/users/index.js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requirePerm } from '@/server/guard';
import bcrypt from 'bcryptjs';

/* ====== helpers compartidos ====== */
const SELECT_FIELDS =
  'id,name,email,role,is_admin,permissions,created_at,partner_tag,can_deliver,last_seen_at';

const ALLOWED_ROLES = new Set(['admin', 'vendedor', 'supervisor', 'repartidor', 'produccion']);

function permsObjectToList(permsObj = {}) {
  const out = [];
  const add = (c, k) => c && out.push(k);

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

function normalizeRole(raw) {
  if (raw === undefined || raw === null) return undefined;
  let v = raw;
  if (typeof v === 'object' && v) v = v.value ?? v.label ?? String(v);
  const s = String(v || '').trim().toLowerCase();
  if (!s) return undefined;
  if (s.includes('admin')) return 'admin';
  if (s.startsWith('super') || s.includes('superv')) return 'supervisor';
  if (s.includes('repart') || s.includes('courier') || s.includes('delivery')) return 'repartidor';
  if (s.includes('producc') || s.includes('producción')) return 'produccion';
  if (s.includes('vend') || s.includes('seller') || s.includes('sales')) return 'vendedor';
  return ALLOWED_ROLES.has(s) ? s : null;
}

function mapRow(u) {
  if (!u) return null;
  const lastMs = u.last_seen_at ? new Date(u.last_seen_at).getTime() : 0;
  const online = lastMs ? (Date.now() - lastMs) <= 120_000 : false; // 2 minutos
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role || null,
    is_admin: !!u.is_admin,
    partner_tag: u.partner_tag || '',
    can_deliver: !!u.can_deliver,
    permissions: Array.isArray(u.permissions) ? u.permissions : [],
    created_at: u.created_at,
    last_seen_at: u.last_seen_at || null,
    online,
  };
}

/* ====== handler ====== */
export default async function handler(req, res) {
  const user = getReqUser(req);

  try {
    if (req.method === 'GET') {
      requirePerm(user, 'users.list');

      const { data, error } = await supabaseServer
        .from('users_app')
        .select(SELECT_FIELDS)
        .order('created_at', { ascending: false });

      if (error) return res.status(500).json({ error: 'DB_ERROR', detail: error.message });
      return res.status(200).json((data || []).map(mapRow));
    }

    if (req.method === 'POST') {
      requirePerm(user, 'users.create');

      const body = req.body || {};
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      if (!name)  return res.status(400).json({ error: 'NAME_REQUIRED' });
      if (!email) return res.status(400).json({ error: 'EMAIL_REQUIRED' });

      // email único
      const dup = await supabaseServer.from('users_app').select('id').eq('email', email).limit(1);
      if (dup.error) return res.status(500).json({ error: 'DB_ERROR', detail: dup.error.message });
      if (Array.isArray(dup.data) && dup.data.length > 0) {
        return res.status(409).json({ error: 'EMAIL_IN_USE' });
      }

      const roleNorm = normalizeRole(body.role ?? body.userRole ?? body.rol);
      if (roleNorm === null) {
        return res.status(400).json({
          error: 'ROLE_INVALID',
          detail: 'Valores permitidos: admin, vendedor, supervisor, repartidor, produccion',
        });
      }

      const partnerTag = String(body.partner_tag ?? body.partnerTag ?? '').trim() || null;
      const canDeliver = !!(body.can_deliver ?? body.canDeliver);
      const isAdmin = !!(body.is_admin ?? body.isAdmin);
      const perms = coercePermList(body.permissions ?? body.perms);

      let password_hash = null;
      if (body.password && String(body.password).trim()) {
        password_hash = await bcrypt.hash(String(body.password).trim(), 12);
      }

      const insert = {
        name,
        email,
        role: roleNorm || null,
        is_admin: isAdmin,
        partner_tag: partnerTag,
        can_deliver: canDeliver,
        permissions: perms,
        password_hash,
        // last_seen_at: null (lo setea /api/auth/ping)
      };

      let ins = await supabaseServer
        .from('users_app')
        .insert(insert)
        .select(SELECT_FIELDS)
        .single();

      if (ins.error) {
        const msg = String(ins.error.message || '');
        if (msg.includes('users_app_role_check')) {
          return res.status(400).json({
            error: 'ROLE_INVALID',
            detail: 'Valores permitidos: admin, vendedor, supervisor, repartidor, produccion',
          });
        }
        const typeProblem =
          ins.error.code === '22P02' ||
          ins.error.code === '42804' ||
          msg.toLowerCase().includes('json') ||
          msg.toLowerCase().includes('type text');
        if (typeProblem && Array.isArray(insert.permissions)) {
          const retry = await supabaseServer
            .from('users_app')
            .insert({ ...insert, permissions: JSON.stringify(insert.permissions) })
            .select(SELECT_FIELDS)
            .single();
          if (retry.error) return res.status(500).json({ error: 'DB_ERROR', detail: retry.error.message });
          ins = retry;
        } else {
          return res.status(500).json({ error: 'DB_ERROR', detail: ins.error.message });
        }
      }

      return res.status(201).json(mapRow(ins.data));
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'SERVER_ERROR' });
  }
}
