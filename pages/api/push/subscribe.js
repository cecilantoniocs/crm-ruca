// pages/api/push/subscribe.js
// POST  → guarda la suscripción push del usuario autenticado
// DELETE → elimina la suscripción de este dispositivo

import { supabaseServer } from '@/lib/supabaseServer';
import { getReqUser } from '@/server/guard';

export default async function handler(req, res) {
  const user = getReqUser(req);
  if (!user) return res.status(401).json({ error: 'No autenticado' });

  if (req.method === 'POST') {
    const subscription = req.body?.subscription;
    if (!subscription?.endpoint) {
      return res.status(400).json({ error: 'Suscripción inválida' });
    }

    // Upsert por endpoint para evitar duplicados del mismo dispositivo
    const { error } = await supabaseServer
      .from('push_subscriptions')
      .upsert(
        { user_id: user.id, subscription, endpoint: subscription.endpoint },
        { onConflict: 'endpoint' }
      );

    if (error) {
      console.error('[push/subscribe]', error);
      return res.status(500).json({ error: 'No se pudo guardar la suscripción' });
    }

    return res.status(201).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const endpoint = req.body?.endpoint;
    if (!endpoint) return res.status(400).json({ error: 'Falta endpoint' });

    await supabaseServer
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint);

    return res.json({ ok: true });
  }

  return res.status(405).end();
}
