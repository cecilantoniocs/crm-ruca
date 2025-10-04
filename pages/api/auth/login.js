// /pages/api/auth/login.js
import { supabaseServer } from '@/lib/supabaseServer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { serialize as serializeCookie } from 'cookie';

function normalizePerms(val) {
  if (Array.isArray(val)) return val.map(String);
  if (val == null || val === '') return [];
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val.replace(/""/g, '"'));
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return val.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

export default async function handler(req, res) {
  const DEV = process.env.NODE_ENV !== 'production';
  const DEBUG = DEV || process.env.DEBUG_AUTH === '1' || req.query.debug === '1';

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const dbg = { stage: 'start' };

  try {
    const { email, password } = req.body || {};
    const e = String(email || '').trim().toLowerCase();
    const p = String(password || '');

    if (!e || !p) {
      const payload = { error: 'EMAIL_OR_PASSWORD_REQUIRED' };
      if (DEBUG) payload.__debug = { eOk: !!e, pOk: !!p };
      return res.status(400).json(payload);
    }

    dbg.stage = 'db_lookup';
    const { data: u, error } = await supabaseServer
      .from('users_app')
      .select('id,name,email,is_admin,permissions,partner_tag,can_deliver,role,password_hash')
      .ilike('email', e)
      .maybeSingle();

    if (error) {
      const payload = { error: 'DB_ERROR', detail: error.message };
      if (DEBUG) payload.__debug = dbg;
      return res.status(500).json(payload);
    }
    if (!u) {
      const payload = { error: 'INVALID_CREDENTIALS' };
      if (DEBUG) payload.__debug = { ...dbg, reason: 'user_not_found', email: e };
      return res.status(401).json(payload);
    }

    dbg.stage = 'compare_password';
    const hash = u.password_hash || '';
    if (!hash) {
      const payload = { error: 'INVALID_CREDENTIALS' };
      if (DEBUG) payload.__debug = { ...dbg, reason: 'no_hash' };
      return res.status(401).json(payload);
    }

    let ok = false;
    try {
      ok = await bcrypt.compare(p, hash);
    } catch {
      // por si el hash viene con prefijo $2y$ desde pgcrypto
      ok = await bcrypt.compare(p, hash.replace(/^\$2y\$/, '$2b$'));
    }

    if (!ok) {
      const payload = { error: 'INVALID_CREDENTIALS' };
      if (DEBUG) payload.__debug = { ...dbg, reason: 'hash_compare_failed' };
      return res.status(401).json(payload);
    }

    dbg.stage = 'sign_jwt';
    const perms = normalizePerms(u.permissions);
    const payload = {
      id: u.id,
      email: u.email,
      name: u.name,
      is_admin: !!u.is_admin,
      permissions: perms,
      partner_tag: u.partner_tag || '',
      can_deliver: !!u.can_deliver,
      role: u.role || null,
    };

    const secret = process.env.JWT_SECRET || '';
    if (!secret) {
      const out = { error: 'SERVER_MISCONFIG', detail: 'JWT_SECRET missing' };
      if (DEBUG) out.__debug = dbg;
      return res.status(500).json(out);
    }

    const days = parseInt(process.env.JWT_EXPIRES_DAYS || '7', 10);
    const token = jwt.sign(payload, secret, { expiresIn: `${days}d` });

    res.setHeader(
      'Set-Cookie',
      serializeCookie('auth_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: days * 86400,
      })
    );

    return res.status(200).json({
      ok: true,
      user: payload,
      ...(DEBUG ? { __debug: dbg } : {}),
    });
  } catch (e) {
    if (DEBUG) {
      console.error('/api/auth/login error:', e);
      return res.status(500).json({ error: 'SERVER_ERROR', detail: e.message, __debug: dbg });
    }
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}
