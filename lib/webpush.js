// lib/webpush.js
// Helper para enviar push notifications via web-push (VAPID).
// Uso: await sendPushToUser(userId, { title, body, data })

import webpush from 'web-push';
import { supabaseServer } from '@/lib/supabaseServer';

const VAPID_OK =
  process.env.VAPID_SUBJECT &&
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY;

if (VAPID_OK) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
  console.warn('[webpush] VAPID keys no configuradas — push notifications desactivadas');
}

/**
 * Envía una notificación push a todas las suscripciones activas de un usuario.
 * Si una suscripción ya expiró (410/404), la elimina de la tabla.
 *
 * @param {number|string} userId
 * @param {{ title: string, body: string, data?: object }} payload
 */
/**
 * Envía push a todos los usuarios que tengan alguno de los roles indicados
 * o que sean admin (is_admin = true).
 * @param {string[]} roles  e.g. ['admin', 'supervisor']
 * @param {{ title, body, data }} payload
 */
export async function sendPushToRoles(roles, payload) {
  if (!VAPID_OK || !roles?.length) return;

  // Obtener IDs de usuarios con esos roles o is_admin = true
  const { data: users, error } = await supabaseServer
    .from('users_app')
    .select('id')
    .or(`role.in.(${roles.join(',')}),is_admin.eq.true`);

  if (error || !users?.length) return;

  await Promise.allSettled(
    users.map((u) => sendPushToUser(u.id, payload))
  );
}

export async function sendPushToUser(userId, payload) {
  if (!VAPID_OK || !userId) return;

  const { data: subs, error } = await supabaseServer
    .from('push_subscriptions')
    .select('id, subscription')
    .eq('user_id', userId);

  if (error || !subs?.length) return;

  const notification = JSON.stringify({
    title: payload.title ?? 'Notificación',
    body: payload.body ?? '',
    data: payload.data ?? {},
  });

  await Promise.allSettled(
    subs.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, notification);
      } catch (err) {
        // 410 Gone o 404 = suscripción expirada → eliminar
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await supabaseServer.from('push_subscriptions').delete().eq('id', row.id);
        } else {
          console.warn('[webpush] error enviando a user', userId, err?.message || err);
        }
      }
    })
  );
}
