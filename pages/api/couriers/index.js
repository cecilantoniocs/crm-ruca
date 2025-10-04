// /pages/api/couriers/index.js
import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser, requireAuth } from '@/server/guard';

function normKey(s) {
  return String(s || '').toLowerCase().replace(/:/g, '.');
}
function hasAnyPerm(user, wanted = []) {
  if (!user) return false;
  if (user.is_admin || user.isAdmin) return true;
  const set = new Set((user.permissions || []).map(normKey));
  return wanted.some(w => set.has(normKey(w)) || set.has('*'));
}

export default async function handler(req, res) {
  const user = getReqUser(req);
  const wantDebug = String(req.query.debug || '') === '1';

  try {
    requireAuth(user);
    const allowed = hasAnyPerm(user, ['orders.read', 'orders.create', 'orders.update']);
    if (!allowed) {
      const payload = { error: 'FORBIDDEN' };
      if (wantDebug) payload.__debug = { user };
      return res.status(403).json(payload);
    }

    const { data, error } = await supabaseServer
      .from('users_app')
      .select('id,name,email,can_deliver')
      .eq('can_deliver', true)
      .order('name', { ascending: true });

    if (error) throw error;

    const rows = (data || []).map(u => ({
      id: u.id,
      name: u.name || u.email,
      email: u.email,
      canDeliver: !!u.can_deliver,
    }));

    if (wantDebug) {
      return res.status(200).json({
        rows,
        __debug: {
          user,
          count: rows.length,
          sample: rows.slice(0, 3),
        },
      });
    }

    return res.status(200).json(rows);
  } catch (e) {
    const status = e.status || 500;
    const msg = e.msg || e.message || 'Error';
    console.error('GET /api/couriers', e);
    const payload = { error: msg };
    if (wantDebug) payload.__debug = { user, stack: String(e.stack || '') };
    return res.status(status).json(payload);
  }
}
