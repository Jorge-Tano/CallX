import { NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/db/eventos/database'; // Ruta corregida

export async function POST(request) {
  try {
    const eventos = await request.json();
    
    console.log(`📝 Recibiendo ${eventos.length} eventos para guardar automáticamente`);
    
    const resultado = await DatabaseService.guardarEventosAutomatico(eventos);
    
    return NextResponse.json({
      success: true,
      message: `Eventos procesados exitosamente`,
      ...resultado
    });
    
  } catch (error) {
    console.error('❌ Error en endpoint guardar-eventos:', error);
    return NextResponse.json(
      { success: false, error: 'Error guardando eventos' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Método no permitido' }, { status: 405 });
}