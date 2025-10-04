// /middleware.js
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// APIs públicas (no requieren token)
const PUBLIC_API = ['/api/auth/login', '/api/auth/me'];

// Páginas públicas
const PUBLIC_PAGES = new Set(['/login']); // agrega '/' si tu home es público

async function verifyToken(token) {
  const secret = process.env.JWT_SECRET || '';
  if (!secret) throw new Error('JWT_SECRET missing');
  const enc = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, enc); // HS256 (compatible con jsonwebtoken)
  return payload;
}

function getTokenFromReq(req) {
  // 1) cookies comunes
  const c1 = req.cookies.get('auth_token')?.value || null;
  const c2 = req.cookies.get('token')?.value || null;

  // 2) Authorization: Bearer <jwt>
  const auth = req.headers.get('authorization') || '';
  const b = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  return c1 || c2 || b || null;
}

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  // Omite estáticos y assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/images') ||
    pathname === '/site.webmanifest'
  ) {
    return NextResponse.next();
  }

  // Páginas públicas
  if (PUBLIC_PAGES.has(pathname)) {
    return NextResponse.next();
  }

  // APIs públicas
  if (pathname.startsWith('/api/')) {
    if (PUBLIC_API.includes(pathname)) {
      return NextResponse.next();
    }
  }

  const token = getTokenFromReq(req);

  if (!token) {
    // Si es API, responde 401; si es página, redirige a /login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  try {
    await verifyToken(token);
    return NextResponse.next();
  } catch {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
}

// Evita que el middleware se aplique a assets internos
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|site.webmanifest|icons|images|public).*)'],
};
