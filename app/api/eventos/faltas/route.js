import { NextResponse } from 'next/server';
import { Client } from 'pg';

const DB_CONFIG = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
};

const analizarAlmuerzo = (horaSalidaAlmuerzo, horaEntradaAlmuerzo) => {
  if (!horaSalidaAlmuerzo && !horaEntradaAlmuerzo) {
    return {
      estado: 'NO_REGISTRADO',
      mensaje: 'Sin registro de almuerzo',
      tieneProblema: true
    };
  }
  
  if (horaSalidaAlmuerzo && horaEntradaAlmuerzo) {
    try {
      const [h1, m1] = horaSalidaAlmuerzo.split(':').map(Number);
      const [h2, m2] = horaEntradaAlmuerzo.split(':').map(Number);
      const minutosSalida = h1 * 60 + m1;
      const minutosEntrada = h2 * 60 + m2;
      const duracion = minutosEntrada - minutosSalida;
      
      if (duracion < 30) {
        return {
          estado: 'CURTO',
          mensaje: `Almuerzo muy corto (${duracion} min)`,
          duracion: duracion,
          tieneProblema: true
        };
      } else if (duracion > 120) {
        return {
          estado: 'LARGO',
          mensaje: `Almuerzo muy largo (${duracion} min)`,
          duracion: duracion,
          tieneProblema: true
        };
      } else {
        return {
          estado: 'NORMAL',
          mensaje: `Almuerzo correcto (${duracion} min)`,
          duracion: duracion,
          tieneProblema: false
        };
      }
    } catch (error) {
      return {
        estado: 'ERROR',
        mensaje: 'Error calculando duración',
        tieneProblema: true
      };
    }
  }
  
  if (horaSalidaAlmuerzo && !horaEntradaAlmuerzo) {
    return {
      estado: 'INCOMPLETO',
      mensaje: 'Falta registro de entrada almuerzo',
      tieneProblema: true
    };
  }
  
  if (!horaSalidaAlmuerzo && horaEntradaAlmuerzo) {
    return {
      estado: 'INCOMPLETO',
      mensaje: 'Falta registro de salida almuerzo',
      tieneProblema: true
    };
  }
  
  return {
    estado: 'DESCONOCIDO',
    mensaje: 'Estado desconocido',
    tieneProblema: true
  };
};

const determinarEstadoAsistencia = (registro) => {
  const tieneEntrada = !!registro.hora_entrada;
  const tieneSalida = !!registro.hora_salida;
  const tieneSalidaAlmuerzo = !!registro.hora_salida_almuerzo;
  const tieneEntradaAlmuerzo = !!registro.hora_entrada_almuerzo;
  
  // Jornada completa
  if (tieneEntrada && tieneSalida && tieneSalidaAlmuerzo && tieneEntradaAlmuerzo) {
    return 'COMPLETO';
  }
  
  // Problemas de entrada/salida
  if (!tieneEntrada && tieneSalida) return 'SALIDA_SIN_ENTRADA';
  if (tieneEntrada && !tieneSalida) return 'ENTRADA_SIN_SALIDA';
  if (!tieneEntrada && !tieneSalida && (tieneSalidaAlmuerzo || tieneEntradaAlmuerzo)) return 'SOLO_ALMUERZO';
  if (!tieneEntrada && !tieneSalida && !tieneSalidaAlmuerzo && !tieneEntradaAlmuerzo) return 'SIN_MARCAS';
  
  // Problemas de almuerzo
  if (tieneEntrada && tieneSalida && !tieneSalidaAlmuerzo && !tieneEntradaAlmuerzo) return 'SIN_ALMUERZO';
  if (tieneEntrada && tieneSalida && tieneSalidaAlmuerzo && !tieneEntradaAlmuerzo) return 'FALTA_ENTRADA_ALMUERZO';
  if (tieneEntrada && tieneSalida && !tieneSalidaAlmuerzo && tieneEntradaAlmuerzo) return 'FALTA_SALIDA_ALMUERZO';
  
  return 'OTRO';
};

const GRAVEDAD_ESTADOS = {
  'COMPLETO': 'NINGUNA',
  'SIN_MARCAS': 'ALTA',
  'ENTRADA_SIN_SALIDA': 'ALTA',
  'SALIDA_SIN_ENTRADA': 'ALTA',
  'SIN_ALMUERZO': 'MEDIA',
  'SOLO_ALMUERZO': 'MEDIA',
  'FALTA_ENTRADA_ALMUERZO': 'MEDIA',
  'FALTA_SALIDA_ALMUERZO': 'MEDIA',
  'OTRO': 'BAJA'
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const fecha = searchParams.get('fecha') || new Date().toISOString().split('T')[0];
  
  const client = new Client(DB_CONFIG);
  
  try {
    await client.connect();
    
    const query = `
      SELECT 
        documento,
        nombre,
        hora_entrada,
        hora_salida,
        hora_salida_almuerzo,
        hora_entrada_almuerzo,
        dispositivo_ip,
        created_at
      FROM attendance_events 
      WHERE fecha = $1
      ORDER BY nombre
    `;
    
    const queryParams = [fecha];
    const result = await client.query(query, queryParams);
    
    // Procesar todos los registros sin ningún filtro
    const registrosProcesados = result.rows.map(row => {
      const estadoAsistencia = determinarEstadoAsistencia(row);
      const nivelGravedad = GRAVEDAD_ESTADOS[estadoAsistencia] || 'BAJA';
      
      const analisisAlmuerzo = analizarAlmuerzo(
        row.hora_salida_almuerzo,
        row.hora_entrada_almuerzo
      );
      
      return {
        documento: row.documento,
        nombre: row.nombre,
        estado: estadoAsistencia,
        gravedad: nivelGravedad,
        horas: {
          entrada: row.hora_entrada ? row.hora_entrada.substring(0, 5) : '--:--',
          salida: row.hora_salida ? row.hora_salida.substring(0, 5) : '--:--',
          salidaAlmuerzo: row.hora_salida_almuerzo ? row.hora_salida_almuerzo.substring(0, 5) : '--:--',
          entradaAlmuerzo: row.hora_entrada_almuerzo ? row.hora_entrada_almuerzo.substring(0, 5) : '--:--'
        },
        almuerzo: {
          ...analisisAlmuerzo,
          salida: row.hora_salida_almuerzo,
          entrada: row.hora_entrada_almuerzo
        },
        dispositivo: row.dispositivo_ip || 'Desconocido',
        ultimaActualizacion: row.created_at
      };
    });
    
    // Estadísticas basadas en TODOS los registros
    const estadisticas = {
      totalRegistros: registrosProcesados.length,
      porEstado: {},
      porGravedad: {
        NINGUNA: 0,
        ALTA: 0,
        MEDIA: 0,
        BAJA: 0
      },
      almuerzos: {
        completos: 0,
        incompletos: 0,
        noRegistrados: 0,
        cortos: 0,
        largos: 0,
        normales: 0
      }
    };
    
    registrosProcesados.forEach(registro => {
      // Por estado
      estadisticas.porEstado[registro.estado] = (estadisticas.porEstado[registro.estado] || 0) + 1;
      
      // Por gravedad
      estadisticas.porGravedad[registro.gravedad] = (estadisticas.porGravedad[registro.gravedad] || 0) + 1;
      
      // Almuerzos
      switch (registro.almuerzo.estado) {
        case 'NORMAL':
          estadisticas.almuerzos.normales++;
          break;
        case 'CURTO':
          estadisticas.almuerzos.cortos++;
          break;
        case 'LARGO':
          estadisticas.almuerzos.largos++;
          break;
        case 'INCOMPLETO':
          estadisticas.almuerzos.incompletos++;
          break;
        case 'NO_REGISTRADO':
          estadisticas.almuerzos.noRegistrados++;
          break;
      }
      
      if (registro.horas.salidaAlmuerzo !== '--:--' && registro.horas.entradaAlmuerzo !== '--:--') {
        estadisticas.almuerzos.completos++;
      }
    });
    
    // Resumen por estado
    const resumenPorEstado = Object.entries(estadisticas.porEstado)
      .map(([estado, cantidad]) => ({
        estado: estado,
        cantidad: cantidad,
        gravedad: GRAVEDAD_ESTADOS[estado] || 'BAJA',
        porcentaje: Math.round((cantidad / registrosProcesados.length) * 100) || 0
      }))
      .sort((a, b) => {
        const ordenGravedad = { ALTA: 1, MEDIA: 2, BAJA: 3, NINGUNA: 4 };
        if (ordenGravedad[a.gravedad] !== ordenGravedad[b.gravedad]) {
          return ordenGravedad[a.gravedad] - ordenGravedad[b.gravedad];
        }
        return b.cantidad - a.cantidad;
      });
    
    return NextResponse.json({
      success: true,
      fecha: fecha,
      metadata: {
        fechaConsulta: new Date().toISOString(),
        totalRegistros: registrosProcesados.length
      },
      estadisticas: estadisticas,
      resumen: resumenPorEstado,
      registros: registrosProcesados, // Todos los registros sin límite
      recomendaciones: [], // Las recomendaciones se generan en el componente
      alertas: {
        requiereAccionInmediata: estadisticas.porGravedad.ALTA > 0,
        requiereSeguimiento: estadisticas.porGravedad.MEDIA > 0,
        problemasAlmuerzo: estadisticas.almuerzos.incompletos > 0 || 
                          estadisticas.almuerzos.cortos > 0 || 
                          estadisticas.almuerzos.largos > 0
      }
    });
    
  } catch (error) {
    console.error('Error en API de asistencia:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      fecha: fecha,
      timestamp: new Date().toISOString()
    }, { status: 500 });
    
  } finally {
    if (client) {
      await client.end();
    }
  }
}

export async function POST(request) {
  return await GET(request);
}