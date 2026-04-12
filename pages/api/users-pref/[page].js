import { getReqUser } from '@/server/guard';
import { supabaseServer } from '@/lib/supabaseServer';

export default async function handler(req, res) {
  const user = getReqUser(req);
  if (!user) return res.status(401).json({ error: 'No auth' });

  const { page } = req.query;
  if (!page) return res.status(400).json({ error: 'page requerido' });

  if (req.method === 'GET') {
    const { data, error } = await supabaseServer
      .from('user_prefs')
      .select('filters')
      .eq('user_id', user.id)
      .eq('page', page)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data?.filters || null);
  }

  if (req.method === 'PUT') {
    const filters = req.body?.filters ?? {};
    const { error } = await supabaseServer
      .from('user_prefs')
      .upsert({ user_id: user.id, page, filters, updated_at: new Date().toISOString() }, { onConflict: 'user_id,page' });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method Not Allowed' });
}
