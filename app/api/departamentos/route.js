// app/api/departamentos/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { obtenerListaDepartamentos, renombrarDepartamento } from '@/lib/db/departamentos';

// Lista los departamentos conocidos (groupId -> nombre). Cualquier usuario
// autenticado puede leerla (la usa, por ejemplo, el formulario de crear
// usuario para llenar el desplegable).
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }

    const departamentos = await obtenerListaDepartamentos();
    return NextResponse.json({ success: true, data: departamentos });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Renombra un departamento existente (o lo crea si el groupId todavía no
// tenía nombre). Solo TI/Administrador, porque afecta cómo se ve el
// departamento de esa gente en toda la app.
export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }

    const role = session.user?.role;
    if (role !== 'TI' && role !== 'Administrador') {
      return NextResponse.json({ success: false, error: 'No tienes permiso para renombrar departamentos' }, { status: 403 });
    }

    const { groupId, nombre } = await request.json();

    if (!groupId || !nombre || !nombre.trim()) {
      return NextResponse.json({ success: false, error: 'groupId y nombre son requeridos' }, { status: 400 });
    }

    await renombrarDepartamento(Number(groupId), nombre);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
