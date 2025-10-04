// /pages/api/auth/logout.js
import { serialize } from 'cookie';

export default function handler(req, res) {
  const cookie = serialize('auth_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  res.setHeader('Set-Cookie', cookie);
  res.status(200).json({ ok: true });
}
