import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Control de acceso centralizado (en Next 16 "middleware" pasó a llamarse "proxy").
//
// Regla general: TODO requiere sesión, salvo lo listado en PUBLIC_PREFIXES.
// Si una ruta no aparece en ROLE_RULES, basta con estar logueado.
// Las reglas se evalúan por prefijo de segmento y gana la más específica
// (la más larga), así una ruta nueva nunca queda abierta por olvido.

type Rule = {
  roles: string[]
  // Si se indica, la regla solo aplica a esos métodos HTTP.
  methods?: string[]
}

const ADMIN = ['TI', 'Administrador']
const OPERACION = ['TI', 'Administrador', 'Team Leader']

const PUBLIC_PREFIXES = [
  '/unauthorized',
  '/auth/error',
  '/api/auth/session',
  '/api/auth/csrf',
  '/api/auth/providers',
  '/api/auth/signin',
  '/api/auth/signout',
  '/api/auth/callback',
  '/api/auth/error',
  '/api/auth/_log',
  '/api/auth/logout',
]

const ROLE_RULES: Record<string, Rule[]> = {
  // Registro de cuentas de acceso a la app
  '/auth/registrar': [{ roles: ADMIN }],
  '/api/auth/register': [{ roles: ADMIN }],

  // Páginas
  '/users': [{ roles: OPERACION }],
  '/eventos': [{ roles: OPERACION }],
  '/faltas': [{ roles: OPERACION }],
  '/nocturno': [{ roles: OPERACION }],
  '/departamentos': [{ roles: ADMIN }],
  '/debug': [{ roles: ['TI'] }],

  // APIs
  '/api/users': [{ roles: OPERACION }],
  '/api/eventos': [{ roles: OPERACION }],
  '/api/nocturno': [{ roles: OPERACION }],
  '/api/foto': [{ roles: OPERACION }],
  // El listado de departamentos lo usa el formulario de creación; editarlos es solo admin.
  '/api/departamentos': [
    { roles: OPERACION, methods: ['GET'] },
    { roles: ADMIN },
  ],
  '/api/hikvision': [{ roles: ADMIN }],
  '/api/database': [{ roles: ADMIN }],
  '/api/sync': [{ roles: ADMIN }],
  '/api/exportToSharepoint': [{ roles: ADMIN }],
}

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

function findRoles(pathname: string, method: string): string[] | null {
  let best: string | null = null
  for (const prefix of Object.keys(ROLE_RULES)) {
    if (matchesPrefix(pathname, prefix) && (!best || prefix.length > best.length)) {
      best = prefix
    }
  }
  if (!best) return null
  const rule = ROLE_RULES[best].find(r => !r.methods || r.methods.includes(method))
  return rule ? rule.roles : null
}

function deny(request: NextRequest, status: 401 | 403) {
  const { pathname } = request.nextUrl
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { success: false, error: status === 401 ? 'No autenticado' : 'No autorizado' },
      { status }
    )
  }
  if (status === 401) {
    // El login está en la raíz
    const loginUrl = new URL('/', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname + request.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.redirect(new URL('/unauthorized', request.url))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Archivos estáticos de /public (p. ej. /Logo.png). Las APIs nunca se saltan,
  // aunque su ruta termine en algo parecido a una extensión (/api/foto/...jpg).
  const isStaticFile = !pathname.startsWith('/api/') && /\.[a-zA-Z0-9]+$/.test(pathname)

  // Página de login y rutas públicas
  if (isStaticFile || pathname === '/' || PUBLIC_PREFIXES.some(p => matchesPrefix(pathname, p))) {
    return NextResponse.next()
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return deny(request, 401)

  const allowedRoles = findRoles(pathname, request.method)
  if (allowedRoles && !allowedRoles.includes(String(token.role ?? ''))) {
    return deny(request, 403)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Todo excepto los assets internos de Next
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
