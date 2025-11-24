// /middleware.js
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// APIs públicas (no requieren token)
const PUBLIC_API_PREFIXES = [
  '/api/auth/login',
  '/api/auth/me',
  '/api/health',
  '/api/debug', // /api/debug/supabase, etc.
];

// Páginas públicas
const PUBLIC_PAGES = new Set([
  '/login', // agrega '/' si tu home es público
]);

async function verifyToken(token) {
  const secret = process.env.JWT_SECRET || '';
  if (!secret) throw new Error('JWT_SECRET missing');
  const enc = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, enc); // HS256 por defecto
  return payload;
}

function getTokenFromReq(req) {
  // 1) cookies
  const c1 = req.cookies.get('auth_token')?.value || null;
  const c2 = req.cookies.get('token')?.value || null;

  // 2) Authorization: Bearer <jwt>
  const auth = req.headers.get('authorization') || '';
  const b = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  return c1 || c2 || b || null;
}

function isStaticPath(pathname) {
  // Rutas y extensiones que NO deben pasar por middleware (evita redirects de estáticos)
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/brand/') || // tus logos y assets
    pathname === '/sw.js' ||
    pathname === '/site.webmanifest' ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/manifest.json' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    /^\/(icon|apple-touch-icon|android-chrome)-.*\.png$/i.test(pathname) ||
    /\.(png|jpg|jpeg|svg|gif|ico|webp|avif|txt|xml|json|webmanifest)$/i.test(pathname)
  ) {
    return true;
  }
  return false;
}

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  // Bypass total para estáticos / PWA
  if (isStaticPath(pathname)) {
    return NextResponse.next();
  }

  // Páginas públicas
  if (PUBLIC_PAGES.has(pathname)) {
    return NextResponse.next();
  }

  // Preflight CORS siempre permitido
  if (req.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // APIs públicas (cualquier subruta bajo estos prefijos)
  if (pathname.startsWith('/api/')) {
    if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
      return NextResponse.next();
    }
  }

  // A partir de aquí, requiere token
  const token = getTokenFromReq(req);

  if (!token) {
    // Si es API, responde 401; si es página, redirige a /login preservando "next"
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    // preserva query del destino original (solo path para evitar open redirect)
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

// Mantén auth en APIs, pero excluye estáticos del resto del sitio
export const config = {
  matcher: [
    // Protege APIs (el código interno decidirá si son públicas o no)
    '/api/:path*',
    // Protege páginas, excluyendo explícitamente estáticos y PWA
    '/((?!_next/|favicon.ico|favicon/|icons/|images/|brand/|sw\\.js|site\\.webmanifest|manifest\\.webmanifest|manifest\\.json|robots\\.txt|sitemap\\.xml|.*\\.(?:png|jpg|jpeg|svg|gif|ico|webp|avif|txt|xml|json|webmanifest)$).*)',
  ],
};
