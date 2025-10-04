// /pages/api/debug/supabase.js
export default function handler(req, res) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const keyType = (process.env.SUPABASE_SERVICE_ROLE ? 'service-role' : 'anon/unknown');
  res.json({
    env: process.env.NODE_ENV,
    supabaseUrlHost: url.replace(/^https?:\/\//,'').split('/')[0],
    serverKeyType: keyType
  });
}
