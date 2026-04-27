import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// CONFIGURACIÓN SIMPLE: Ruta -> Roles permitidos
const rolePermissions = {
  // Rutas públicas (sin restricción)
  '/': [],
  '/login': [],
  '/register': [],
  '/auth/error': [],
  '/unauthorized': [],
  '/api/auth/[...nextauth]': [],

  '/users': ['TI', 'Administrador', 'Team Leader'],
  '/eventos': ['TI', 'Administrador', 'Team Leader'],
  '/hikvision': ['TI', 'Administrador'],
  '/sync': ['TI'],
  '/exportToSharepoint': ['TI', 'Administrador'],

  // API routes
  '/api/users': ['TI', 'Administrador', 'Team Leader'],
  '/api/eventos': ['TI', 'Administrador', 'Team Leader'],
  '/api/hikvision': ['TI', 'Administrador'],
  '/api/sync': ['TI', 'Administrador'],
  '/api/exportToSharepoint': ['TI', 'Administrador'],

}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Buscar la ruta más específica que coincida
  let allowedRoles: string[] = []

  // Verificar coincidencias exactas primero
  if (rolePermissions.hasOwnProperty(pathname)) {
    allowedRoles = rolePermissions[pathname as keyof typeof rolePermissions]
  } else {
    // Verificar rutas que comiencen con algún prefijo configurado
    for (const [route, roles] of Object.entries(rolePermissions)) {
      if (pathname.startsWith(route) && route !== '/') {
        allowedRoles = roles
        break
      }
    }
  }

  // Si no hay configuración para esta ruta, permitir acceso
  if (allowedRoles.length === 0) {
    return NextResponse.next()
  }

  // Si la ruta no requiere roles específicos (array vacío), permitir acceso
  if (allowedRoles.length === 0) {
    return NextResponse.next()
  }

  // Obtener token de sesión
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET
  })

  // Si no hay token y la ruta requiere roles, redirigir a login
  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', encodeURI(request.url))
    return NextResponse.redirect(loginUrl)
  }

  // Obtener rol del usuario desde el token
  const userRole = (token as any).role

  // Verificar si el usuario tiene un rol permitido
  if (!allowedRoles.includes(userRole)) {
    // Redirigir a página de no autorizado
    return NextResponse.redirect(new URL('/unauthorized', request.url))
  }

  // Si todo está bien, continuar
  return NextResponse.next()
}

export const config = {
  matcher: [
    // Proteger todas las rutas excepto las estáticas y públicas
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
}