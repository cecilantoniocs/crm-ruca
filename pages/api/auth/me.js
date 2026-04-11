// /pages/api/auth/me.js
import { getReqUser } from '@/server/guard';
import { supabaseServer } from '@/lib/supabaseServer';
import { jwtVerify } from 'jose';

function coerceArray(val) {
  if (Array.isArray(val)) return val;
  if (val == null || val === '') return [];
  try {
    const parsed = typeof val === 'string' ? JSON.parse(val) : val;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function decodeFromCookieOrHeader(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((p) => {
      const i = p.indexOf('=');
      if (i === -1) return [p.trim(), ''];
      const k = p.slice(0, i).trim();
      const v = decodeURIComponent(p.slice(i + 1).trim());
      return [k, v];
    })
  );

  const token =
    cookies['auth_token'] ||
    cookies['token'] ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
    '';

  if (!token) return null;

  const secret = process.env.JWT_SECRET || '';
  if (!secret) throw new Error('JWT_SECRET missing');

  const enc = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, enc); // HS256
  return payload || null;
}

export default async function handler(req, res) {
  try {
    // 1) Sesión base (guard o JWT)
    let u = getReqUser(req);
    if (!u?.id) {
      const decoded = await decodeFromCookieOrHeader(req);
      if (decoded?.id) u = decoded;
    }
    if (!u?.id) return res.status(401).json({ error: 'UNAUTHENTICATED' });

    // 2) SIEMPRE refrescamos desde BD los campos críticos (role, is_admin, can_deliver, permissions, partner_tag)
    let row = null;
    try {
      const { data, error } = await supabaseServer
        .from('users_app')
        .select('id,email,name,role,is_admin,permissions,partner_tag,can_deliver,carteras')
        .eq('id', u.id)
        .maybeSingle();
      if (error) throw error;
      row = data || null;
    } catch (e) {
      // si falla, seguimos con lo que tengamos en u
      row = null;
    }

    // 3) Normalización de tag/permissions
    const email = row?.email ?? u.email ?? null;
    const name  = row?.name  ?? u.name  ?? null;
    const role  = (row?.role ?? u.role ?? '').toString().trim();
    const isAdmin = !!(row?.is_admin ?? u.is_admin);
    const canDeliver = !!(row?.can_deliver ?? u.can_deliver);
    const permissions = coerceArray(row?.permissions ?? u.permissions);

    const rawTag = (row?.partner_tag ?? u.partner_tag ?? u.partnerTag ?? '').toString().trim();
    const tagLower = rawTag.toLowerCase();

    // carteras: siempre desde BD si está disponible
    let carteras = Array.isArray(row?.carteras) ? row.carteras : (Array.isArray(u.carteras) ? u.carteras : []);
    if (isAdmin) {
      carteras = ['rucapellan', 'cecil'];
    } else if (carteras.length === 0 && rawTag) {
      carteras = [rawTag];
    }

    // 4) User consolidado (exponemos ambos nombres de campos por compatibilidad)
    const safeUser = {
      id: u.id,
      email,
      name,
      role,
      is_admin: isAdmin,
      isAdmin,
      can_deliver: canDeliver,
      canDeliver,
      permissions,
      partner_tag: rawTag,
      partnerTag: rawTag,
      partner_tag_lower: tagLower,
      partnerTagLower: tagLower,
      carteras,
    };

    return res.status(200).json({ user: safeUser });
  } catch (e) {
    console.error('/api/auth/me error', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}
