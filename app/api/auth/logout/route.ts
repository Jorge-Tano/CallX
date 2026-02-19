import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const response = NextResponse.json({ success: true });
    
    const cookiesToDelete = [
      'next-auth.session-token',
      '__Secure-next-auth.session-token',
      'next-auth.csrf-token',
      '__Host-next-auth.csrf-token',
      'auth-token',
      'session'
    ];
    
    // En Next.js 16, esto funciona directamente
    cookiesToDelete.forEach(name => {
      response.cookies.delete(name);
    });
    
    // También limpiar cookies en el request
    cookiesToDelete.forEach(name => {
      response.cookies.set(name, '', {
        expires: new Date(0),
        path: '/',
      });
    });
    
    return response;
  } catch (error) {
    const response = NextResponse.json({ success: true });
    
    // Limpiar cookies básicas incluso en error
    ['session', 'auth-token'].forEach(name => {
      response.cookies.delete(name);
    });
    
    return response;
  }
}