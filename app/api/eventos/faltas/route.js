import { NextResponse } from 'next/server';
import { Client } from 'pg';

const DB_CONFIG = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
};

const CAMPANA_SIN_ALMUERZO = 'Campaña PARLO';

const analizarAlmuerzo = (horaSalidaAlmuerzo, horaEntradaAlmuerzo, campana) => {
  // Empleados de campaña PARLO no requieren registro de almuerzo
  if (campana === CAMPANA_SIN_ALMUERZO) {
    return {
      estado: 'NO_APLICA',
      mensaje: 'No aplica (Campaña PARLO)',
      tieneProblema: false
    };
  }

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

const determinarEstadoAsistencia = (registro, campana) => {
  const tieneEntrada = !!registro.hora_entrada;
  const tieneSalida = !!registro.hora_salida;
  const tieneSalidaAlmuerzo = !!registro.hora_salida_almuerzo;
  const tieneEntradaAlmuerzo = !!registro.hora_entrada_almuerzo;
  const esParlo = campana === CAMPANA_SIN_ALMUERZO;
  
  // Jornada completa
  if (esParlo) {
    // Para PARLO: completo si tiene entrada y salida (almuerzo no importa)
    if (tieneEntrada && tieneSalida) return 'COMPLETO';
  } else {
    if (tieneEntrada && tieneSalida && tieneSalidaAlmuerzo && tieneEntradaAlmuerzo) {
      return 'COMPLETO';
    }
  }
  
  // Problemas de entrada/salida
  if (!tieneEntrada && tieneSalida) return 'SALIDA_SIN_ENTRADA';
  if (tieneEntrada && !tieneSalida) return 'ENTRADA_SIN_SALIDA';
  if (!tieneEntrada && !tieneSalida && (tieneSalidaAlmuerzo || tieneEntradaAlmuerzo)) return 'SOLO_ALMUERZO';
  if (!tieneEntrada && !tieneSalida && !tieneSalidaAlmuerzo && !tieneEntradaAlmuerzo) return 'SIN_MARCAS';
  
  // Problemas de almuerzo (solo para no-PARLO)
  if (!esParlo) {
    if (tieneEntrada && tieneSalida && !tieneSalidaAlmuerzo && !tieneEntradaAlmuerzo) return 'SIN_ALMUERZO';
    if (tieneEntrada && tieneSalida && tieneSalidaAlmuerzo && !tieneEntradaAlmuerzo) return 'FALTA_ENTRADA_ALMUERZO';
    if (tieneEntrada && tieneSalida && !tieneSalidaAlmuerzo && tieneEntradaAlmuerzo) return 'FALTA_SALIDA_ALMUERZO';
  }
  
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
  
  // Soporte para fecha única o rango de fechas
  const fecha = searchParams.get('fecha');
  const fechaInicio = searchParams.get('fechaInicio');
  const fechaFin = searchParams.get('fechaFin');
  
  // Determinar rango efectivo
  let rangoInicio, rangoFin;
  if (fechaInicio && fechaFin) {
    rangoInicio = fechaInicio;
    rangoFin = fechaFin;
  } else if (fecha) {
    rangoInicio = fecha;
    rangoFin = fecha;
  } else {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    rangoInicio = rangoFin = ayer.toISOString().split('T')[0];
  }
  
  const client = new Client(DB_CONFIG);
  
  try {
    await client.connect();
    
    const query = `
      SELECT 
        ae.documento,
        ae.nombre,
        ae.fecha,
        ae.hora_entrada,
        ae.hora_salida,
        ae.hora_salida_almuerzo,
        ae.hora_entrada_almuerzo,
        ae.dispositivo_ip,
        ae.created_at,
        hu.departamento
      FROM attendance_events ae
      LEFT JOIN hikvision_users hu 
        ON ae.documento = hu.employee_no
      WHERE ae.fecha BETWEEN $1 AND $2
      ORDER BY ae.fecha, ae.nombre
    `;
    
    const result = await client.query(query, [rangoInicio, rangoFin]);
    
    // Procesar todos los registros
    const registrosProcesados = result.rows.map(row => {
      const campana = row.departamento || '';
      const estadoAsistencia = determinarEstadoAsistencia(row, campana);
      const nivelGravedad = GRAVEDAD_ESTADOS[estadoAsistencia] || 'BAJA';
      
      const analisisAlmuerzo = analizarAlmuerzo(
        row.hora_salida_almuerzo,
        row.hora_entrada_almuerzo,
        campana
      );
      
      return {
        documento: row.documento,
        nombre: row.nombre,
        fecha: row.fecha,
        campana: campana,
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

    // Filtrar jornadas completas — nunca se muestran
    const registrosFiltrados = registrosProcesados.filter(r => r.estado !== 'COMPLETO');
    
    // Estadísticas basadas en TODOS los registros (incluyendo completos para referencia)
    const estadisticas = {
      totalRegistros: registrosProcesados.length,
      totalIncompletos: registrosFiltrados.length,
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
        noAplica: 0,
        cortos: 0,
        largos: 0,
        normales: 0
      }
    };
    
    registrosFiltrados.forEach(registro => {
      estadisticas.porEstado[registro.estado] = (estadisticas.porEstado[registro.estado] || 0) + 1;
      estadisticas.porGravedad[registro.gravedad] = (estadisticas.porGravedad[registro.gravedad] || 0) + 1;
      
      switch (registro.almuerzo.estado) {
        case 'NORMAL': estadisticas.almuerzos.normales++; break;
        case 'CURTO': estadisticas.almuerzos.cortos++; break;
        case 'LARGO': estadisticas.almuerzos.largos++; break;
        case 'INCOMPLETO': estadisticas.almuerzos.incompletos++; break;
        case 'NO_REGISTRADO': estadisticas.almuerzos.noRegistrados++; break;
        case 'NO_APLICA': estadisticas.almuerzos.noAplica++; break;
      }
      
      if (registro.horas.salidaAlmuerzo !== '--:--' && registro.horas.entradaAlmuerzo !== '--:--') {
        estadisticas.almuerzos.completos++;
      }
    });
    
    const resumenPorEstado = Object.entries(estadisticas.porEstado)
      .map(([estado, cantidad]) => ({
        estado,
        cantidad,
        gravedad: GRAVEDAD_ESTADOS[estado] || 'BAJA',
        porcentaje: Math.round((cantidad / (registrosFiltrados.length || 1)) * 100)
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
      fechaInicio: rangoInicio,
      fechaFin: rangoFin,
      esRango: rangoInicio !== rangoFin,
      metadata: {
        fechaConsulta: new Date().toISOString(),
        totalRegistros: registrosProcesados.length,
        totalIncompletos: registrosFiltrados.length
      },
      estadisticas,
      resumen: resumenPorEstado,
      registros: registrosFiltrados,
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