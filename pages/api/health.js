export default function handler(_req, res) {
  res.json({ ok: true, ts: new Date().toISOString() });
}
