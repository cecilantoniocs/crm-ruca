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
  // 1) intenta las cookies más comunes
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
  const { payload } = await jwtVerify(token, enc); // HS256 (compat con jsonwebtoken)
  return payload || null;
}

export default async function handler(req, res) {
  try {
    // 1) Primero intenta por tu guard habitual
    let u = getReqUser(req);

    // 2) Si no hay usuario o viene “flaco”, decodifica el JWT directo
    if (!u?.id) {
      const decoded = await decodeFromCookieOrHeader(req);
      if (decoded?.id) {
        u = decoded;
      }
    }

    if (!u?.id) {
      return res.status(401).json({ error: 'UNAUTHENTICATED' });
    }

    // 3) Completa desde BD si faltan campos o están vacíos
    let row = null;
    const needFetch =
      u.email == null ||
      u.name == null ||
      u.partner_tag == null ||
      (typeof u.partner_tag === 'string' && u.partner_tag.trim() === '') ||
      u.permissions == null ||
      typeof u.is_admin === 'undefined' ||
      typeof u.can_deliver === 'undefined';

    if (needFetch) {
      const { data, error } = await supabaseServer
        .from('users_app')
        .select('id,email,name,is_admin,permissions,partner_tag,can_deliver')
        .eq('id', u.id)
        .maybeSingle();
      if (!error) row = data;
    }

    const rawTag = (row?.partner_tag ?? u.partner_tag ?? u.partnerTag ?? '').toString().trim();
    const tagLower = rawTag.toLowerCase();

    const permissions = coerceArray(row?.permissions ?? u.permissions);

    const safeUser = {
      id: u.id,
      email: row?.email ?? u.email ?? null,
      name: row?.name ?? u.name ?? null,
      is_admin: !!(row?.is_admin ?? u.is_admin),
      permissions,
      partner_tag: rawTag,
      partnerTag: rawTag,
      partner_tag_lower: tagLower,
      partnerTagLower: tagLower,
      can_deliver: !!(row?.can_deliver ?? u.can_deliver),
    };

    return res.status(200).json({ user: safeUser });
  } catch (e) {
    console.error('/api/auth/me error', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}
