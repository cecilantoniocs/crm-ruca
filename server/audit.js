// /server/audit.js
import { supabaseServer } from '@/lib/supabaseServer';

/**
 * Registra una acción en audit_logs.
 * Nunca lanza — captura internamente para no afectar el flujo principal.
 */
export async function logAudit(user, { action, entity, entityId, description, metadata } = {}) {
  try {
    await supabaseServer.from('audit_logs').insert({
      user_id: user?.id ? String(user.id) : null,
      user_name: user?.name || user?.email || 'Sistema',
      action,
      entity: entity || null,
      entity_id: entityId ? String(entityId) : null,
      description: description || null,
      metadata: metadata || null,
    });
  } catch (e) {
    console.warn('[audit] Error al registrar:', e?.message || e);
  }
}
