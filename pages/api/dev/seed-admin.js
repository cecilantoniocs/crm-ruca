import bcrypt from 'bcryptjs';
import * as serverMod from '../../../lib/supabaseServer';
const supa = serverMod.supabaseServer ?? serverMod.default ?? serverMod;

export default async function handler(req, res) {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'Solo dev' });
  if (req.method !== 'POST') return res.status(405).end();

  const email = 'admin@admin.com';
  const password = 'admin123';
  const password_hash = await bcrypt.hash(password, 12);
  const role = 'admin';
  const permissions = ['clients.read','clients.create','orders.update','sales.read'];

  const { data, error } = await supa
    .from('users_app')
    .upsert({ email, password_hash, role, permissions }, { onConflict: 'email' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message, code: 'DB' });
  return res.json({ ok: true, user: { id: data.id, email: data.email, has_hash: !!data.password_hash } });
}
