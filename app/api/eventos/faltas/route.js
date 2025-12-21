import { NextResponse } from 'next/server';
import { Client } from 'pg';

const DB_CONFIG = {
  host: process.env.DB_HOST ,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
  database: process.env.DB_NAME ,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD 
};

const SUBTIPOS_FALTAS = [
  'Jornada completa',
  'Sin almuerzo registrado',
  'Solo entrada',
  'Solo salida',
  'Falta salida final',
  'Falta entrada inicial',
  'Solo almuerzo',
  'Solo salida almuerzo',
  'Solo entrada almuerzo',
  'ERROR - Misma hora',
  'Sin registros',
  'Solo Entrada',
  'Solo Salida',
  'Entrada y Salida',
  'Entrada y Salida Almuerzo',
  'Falta entrada almuerzo',
  'Falta salida almuerzo'
];

const CATEGORIAS_PROBLEMA = {
  'Jornada completa': 'COMPLETO',
  'Sin almuerzo registrado': 'ALMUERZO_INCOMPLETO',
  'Solo entrada': 'ENTRADA_SIN_SALIDA',
  'Solo salida': 'SALIDA_SIN_ENTRADA',
  'Falta salida final': 'FALTA_SALIDA',
  'Falta entrada inicial': 'FALTA_ENTRADA',
  'Solo almuerzo': 'SOLO_ALMUERZO',
  'Solo salida almuerzo': 'FALTA_ENTRADA_ALMUERZO',
  'Solo entrada almuerzo': 'FALTA_SALIDA_ALMUERZO',
  'ERROR - Misma hora': 'ERROR_DATOS',
  'Sin registros': 'SIN_MARCAS',
  'Solo Entrada': 'ENTRADA_SIN_SALIDA',
  'Solo Salida': 'SALIDA_SIN_ENTRADA',
  'Entrada y Salida': 'ALMUERZO_INCOMPLETO',
  'Entrada y Salida Almuerzo': 'COMPLETO',
  'Falta entrada almuerzo': 'FALTA_ENTRADA_ALMUERZO',
  'Falta salida almuerzo': 'FALTA_SALIDA_ALMUERZO'
};

const GRAVEDAD = {
  'COMPLETO': 'NINGUNA',
  'ERROR_DATOS': 'ALTA',
  'SIN_MARCAS': 'ALTA',
  'ENTRADA_SIN_SALIDA': 'ALTA',
  'SALIDA_SIN_ENTRADA': 'ALTA',
  'FALTA_SALIDA': 'ALTA',
  'FALTA_ENTRADA': 'ALTA',
  'ALMUERZO_INCOMPLETO': 'MEDIA',
  'SOLO_ALMUERZO': 'MEDIA',
  'FALTA_ENTRADA_ALMUERZO': 'MEDIA',
  'FALTA_SALIDA_ALMUERZO': 'MEDIA'
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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const fecha = searchParams.get('fecha') || new Date().toISOString().split('T')[0];
  const categoria = searchParams.get('categoria');
  const gravedad = searchParams.get('gravedad');
  const incluirCompletos = searchParams.get('incluirCompletos') === 'true';
  const limite = parseInt(searchParams.get('limite') || '100');
  
  const client = new Client(DB_CONFIG);
  
  try {
    await client.connect();
    
    let query = `
      SELECT 
        documento,
        nombre,
        subtipo_evento,
        hora_entrada,
        hora_salida,
        hora_salida_almuerzo,
        hora_entrada_almuerzo,
        dispositivo_ip,
        created_at,
        tipo_evento
      FROM eventos_procesados 
      WHERE fecha = $1
    `;
    
    const queryParams = [fecha];
    
    if (!incluirCompletos) {
      query += ` AND subtipo_evento != 'Jornada completa'`;
    }
    
    if (categoria) {
      const subtiposFiltro = Object.entries(CATEGORIAS_PROBLEMA)
        .filter(([subtipo, cat]) => cat === categoria)
        .map(([subtipo]) => subtipo);
      
      if (subtiposFiltro.length > 0) {
        query += ` AND subtipo_evento IN (${subtiposFiltro.map((_, i) => `$${queryParams.length + i + 1}`).join(', ')})`;
        queryParams.push(...subtiposFiltro);
      }
    }
    
    query += ` ORDER BY 
      CASE 
        WHEN subtipo_evento = 'ERROR - Misma hora' THEN 1
        WHEN subtipo_evento = 'Sin registros' THEN 2
        WHEN subtipo_evento = 'Solo entrada' THEN 3
        WHEN subtipo_evento = 'Solo Entrada' THEN 3
        WHEN subtipo_evento = 'Falta salida final' THEN 4
        WHEN subtipo_evento = 'Solo salida' THEN 5
        WHEN subtipo_evento = 'Solo Salida' THEN 5
        WHEN subtipo_evento = 'Falta entrada inicial' THEN 6
        WHEN subtipo_evento = 'Solo salida almuerzo' THEN 7
        WHEN subtipo_evento = 'Solo entrada almuerzo' THEN 8
        WHEN subtipo_evento = 'Sin almuerzo registrado' THEN 9
        WHEN subtipo_evento = 'Solo almuerzo' THEN 10
        ELSE 11
      END,
      nombre
      LIMIT $${queryParams.length + 1}`;
    
    queryParams.push(limite);
    
    const result = await client.query(query, queryParams);
    
    const faltasPorTipo = {};
    SUBTIPOS_FALTAS.forEach(subtipo => {
      faltasPorTipo[subtipo] = [];
    });
    
    const todosRegistros = [];
    
    result.rows.forEach(row => {
      const categoriaProblema = CATEGORIAS_PROBLEMA[row.subtipo_evento] || 'DESCONOCIDO';
      const nivelGravedad = GRAVEDAD[categoriaProblema] || 'BAJA';
      
      const analisisAlmuerzo = analizarAlmuerzo(
        row.hora_salida_almuerzo,
        row.hora_entrada_almuerzo
      );
      
      const registro = {
        documento: row.documento,
        nombre: row.nombre,
        subtipo: row.subtipo_evento,
        categoria: categoriaProblema,
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
        foto: row.imagen || '',
        ultimaActualizacion: row.created_at,
        tipo: row.tipo_evento || 'Asistencia'
      };
      
      todosRegistros.push(registro);
      
      if (faltasPorTipo[row.subtipo_evento]) {
        faltasPorTipo[row.subtipo_evento].push(registro);
      } else if (!incluirCompletos) {
        if (!faltasPorTipo['Otros']) {
          faltasPorTipo['Otros'] = [];
        }
        faltasPorTipo['Otros'].push(registro);
      }
    });
    
    const estadisticas = {
      totalRegistros: result.rows.length,
      porSubtipo: {},
      porCategoria: {},
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
    
    todosRegistros.forEach(registro => {
      estadisticas.porSubtipo[registro.subtipo] = (estadisticas.porSubtipo[registro.subtipo] || 0) + 1;
      estadisticas.porCategoria[registro.categoria] = (estadisticas.porCategoria[registro.categoria] || 0) + 1;
      estadisticas.porGravedad[registro.gravedad] = (estadisticas.porGravedad[registro.gravedad] || 0) + 1;
      
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
      
      if (registro.horas.salidaAlmuerzo && registro.horas.entradaAlmuerzo) {
        estadisticas.almuerzos.completos++;
      }
    });
    
    const resumenPorTipo = Object.entries(faltasPorTipo)
      .filter(([tipo, lista]) => lista.length > 0)
      .map(([tipo, lista]) => {
        return {
          tipo: tipo,
          cantidad: lista.length,
          categoria: CATEGORIAS_PROBLEMA[tipo] || 'DESCONOCIDO',
          gravedad: GRAVEDAD[CATEGORIAS_PROBLEMA[tipo]] || 'BAJA',
          porcentaje: Math.round((lista.length / result.rows.length) * 100),
          ejemplo: lista.length > 0 ? lista[0].nombre : '',
          empleados: lista.map(emp => ({
            nombre: emp.nombre,
            documento: emp.documento,
            horas: emp.horas,
            almuerzo: emp.almuerzo
          }))
        };
      })
      .sort((a, b) => {
        const ordenGravedad = { ALTA: 1, MEDIA: 2, BAJA: 3, NINGUNA: 4 };
        if (ordenGravedad[a.gravedad] !== ordenGravedad[b.gravedad]) {
          return ordenGravedad[a.gravedad] - ordenGravedad[b.gravedad];
        }
        return b.cantidad - a.cantidad;
      });
    
    const recomendaciones = [];
    
    if (estadisticas.porGravedad.ALTA > 0) {
      recomendaciones.push({
        tipo: 'URGENTE',
        mensaje: `${estadisticas.porGravedad.ALTA} empleados tienen faltas graves (entrada/salida incompleta)`,
        accion: 'Notificar inmediatamente a RRHH'
      });
    }
    
    if (estadisticas.almuerzos.incompletos > 0) {
      recomendaciones.push({
        tipo: 'ATENCIÓN',
        mensaje: `${estadisticas.almuerzos.incompletos} empleados no registraron almuerzo completo`,
        accion: 'Recordar política de registro de almuerzos'
      });
    }
    
    if (estadisticas.almuerzos.cortos > 0) {
      recomendaciones.push({
        tipo: 'REVISIÓN',
        mensaje: `${estadisticas.almuerzos.cortos} empleados tuvieron almuerzos muy cortos (<30 min)`,
        accion: 'Verificar cumplimiento de tiempo de almuerzo'
      });
    }
    
    if (estadisticas.almuerzos.largos > 0) {
      recomendaciones.push({
        tipo: 'REVISIÓN',
        mensaje: `${estadisticas.almuerzos.largos} empleados tuvieron almuerzos muy largos (>2h)`,
        accion: 'Revisar tiempos de almuerzo extendidos'
      });
    }
    
    if (estadisticas.porSubtipo['ERROR - Misma hora'] > 0) {
      recomendaciones.push({
        tipo: 'TÉCNICO',
        mensaje: `${estadisticas.porSubtipo['ERROR - Misma hora']} registros con error de hora`,
        accion: 'Revisar sincronización de dispositivos'
      });
    }
    
    if (result.rows.length === 0 && !incluirCompletos) {
      recomendaciones.push({
        tipo: 'EXCELENTE',
        mensaje: '¡Todos los empleados registraron jornada completa!',
        accion: 'Ninguna acción requerida'
      });
    }
    
    return NextResponse.json({
      success: true,
      fecha: fecha,
      metadata: {
        fechaConsulta: new Date().toISOString(),
        totalResultados: result.rows.length,
        limiteAplicado: limite,
        filtros: {
          categoria: categoria || 'ninguno',
          gravedad: gravedad || 'ninguno',
          incluirCompletos: incluirCompletos
        }
      },
      estadisticas: estadisticas,
      estadisticasAlmuerzos: estadisticas.almuerzos,
      resumen: resumenPorTipo,
      todosRegistros: gravedad ? 
        todosRegistros.filter(r => r.gravedad === gravedad) : 
        (categoria ? 
          todosRegistros.filter(r => r.categoria === categoria) : 
          todosRegistros),
      recomendaciones: recomendaciones,
      alertas: {
        requiereAccionInmediata: estadisticas.porGravedad.ALTA > 0,
        requiereSeguimiento: estadisticas.porGravedad.MEDIA > 0,
        todoCorrecto: result.rows.length === 0 && !incluirCompletos,
        problemasAlmuerzo: estadisticas.almuerzos.incompletos > 0 || 
                          estadisticas.almuerzos.cortos > 0 || 
                          estadisticas.almuerzos.largos > 0
      }
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      fecha: fecha,
      estadisticas: null,
      resumen: [],
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