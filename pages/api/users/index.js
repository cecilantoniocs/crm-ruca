import { supabaseServer } from '@/lib/supabaseServer';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const role = String(req.query.role || '').toLowerCase();

    // Compat: si piden ?role=client, respondemos desde clients
    if (role === 'client' || role === 'cliente') {
      const { data, error } = await supabaseServer
        .from('clients')
        .select('id,name,local_name,dir1,zona,ciudad,telefono,email,owner_id')
        .order('name', { ascending: true });
      if (error) throw error;

      // formateo mínimo: muchos componentes solo querían dirección/owner
      const rows = (data || []).map(c => ({
        id: c.id,
        name: c.name,
        clientLocal: c.local_name || null,
        dir1: c.dir1 || null,
        zona: c.zona || null,
        ciudad: c.ciudad || null,
        email: c.email || null,
        ownerId: c.owner_id || null,
      }));

      return res.json(rows);
    }

    // Usuarios de la app (admin/vendedor/repartidor)
    let q = supabaseServer
      .from('users_app')
      .select('id,name,email,role,is_admin,partner_tag,permissions')
      .order('name', { ascending: true });

    const { data, error } = await q;
    if (error) throw error;

    const rows = (data || []).map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isAdmin: u.is_admin,
      partnerTag: u.partner_tag || '',
      permissions: u.permissions || [],
      sellerId: u.id,
    }));

    res.json(rows);
  } catch (e) {
    console.error('GET /api/users', e);
    res.status(500).json({ error: e.message });
  }
}
