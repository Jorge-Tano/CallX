import { NextResponse } from 'next/server';
import { obtenerEventosDeHikvision } from '@/lib/db/eventos/database';

export async function GET() {
  const startTime = Date.now();

  try {
    const eventos = await obtenerEventosDeHikvision();
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    const velocidad = eventos.length > 0 ? (eventos.length / duration).toFixed(1) : '0';

    // Log solo en desarrollo
    if (process.env.NODE_ENV === 'development') {
      
      const eventosAlmuerzo = eventos.filter(e => e.tipo?.includes('Almuerzo'));
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      fecha_consulta: new Date().toISOString().split('T')[0],
      estadisticas: {
        total_eventos: eventos.length,
        eventos_almuerzo: eventos.filter(e => e.tipo?.includes('Almuerzo')).length,
        tiempo_segundos: parseFloat(duration),
        velocidad_eventos_por_segundo: parseFloat(velocidad)
      },
      data: eventos
    }, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' // Cache de 5 minutos
      }
    });

  } catch (error) {
    // Log de error estructurado
    
    return NextResponse.json({
      success: false,
      error: process.env.NODE_ENV === 'production'
        ? 'Error interno del servidor' 
        : error.message,
      timestamp: new Date().toISOString()
    }, { 
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  }
}


export const runtime = 'nodejs'; 
export const dynamic = 'force-dynamic'; 