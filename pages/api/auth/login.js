// pages/api/auth/login.js
import { supabaseServer as supa } from '@/lib/supabaseServer';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { email, password } = req.body || {};

  const { data: u, error } = await supa
    .from('users_app')
    .select('id,name,email,role,is_admin,password,permissions')
    .eq('email', email)
    .limit(1)
    .single();

  if (error || !u || u.password !== password) {
    return res.status(401).json({ ok: false, message: 'Credenciales inválidas' });
  }

  const { password: _p, ...safe } = u; // no devolver password
  return res.status(200).json({ ok: true, user: safe });
}
