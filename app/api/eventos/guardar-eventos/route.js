import { NextResponse } from 'next/server';
import { Pool } from 'pg'; // Importa Pool en lugar de Client
import { obtenerEventosDeHikvision } from '@/lib/db/eventos/database';

// Configuración del pool (una sola instancia)
const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'hikvision_events',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'OnePiece00.',
  max: 5, // REDUCIDO: máximo 5 conexiones
  idleTimeoutMillis: 10000, // 10 segundos
  connectionTimeoutMillis: 5000,
});

// ================================================
// FUNCIONES DE UTILIDAD
// ================================================

const getCurrentDateTime = () => {
  return new Date().toLocaleString('es-CO');
};

// ================================================
// FUNCIONES DE SINCRONIZACIÓN
// ================================================

async function obtenerCampañaPorDocumento(documento, client) {
  if (!documento || documento === 'N/A') return 'Sin grupo';
  
  try {
    const result = await client.query(
      'SELECT departamento FROM usuarios_hikvision WHERE employee_no = $1',
      [documento]
    );
    return result.rows.length > 0 ? result.rows[0].departamento : 'Sin grupo';
  } catch (error) {
    return 'Sin grupo';
  }
}

// MODIFICAR: Incluir toda la lógica de procesamiento
async function procesarParaBD(eventos) {
  const hoy = new Date().toISOString().split('T')[0];
  const eventosHoy = eventos.filter(evento => evento.fecha === hoy);

  if (eventosHoy.length === 0) {
    return [];
  }

  const eventosPorDocumento = {};

  eventosHoy.forEach((evento) => {
    if (evento.documento === 'N/A') return;

    const key = evento.documento;
    if (!eventosPorDocumento[key]) {
      eventosPorDocumento[key] = {
        documento: evento.documento,
        nombre: evento.nombre,
        fecha: evento.fecha,
        eventos: []
      };
    }
    eventosPorDocumento[key].eventos.push(evento);
  });

  const registrosBD = [];

  // Obtener una conexión del pool una sola vez
  const client = await pool.connect();
  
  try {
    for (const grupo of Object.values(eventosPorDocumento)) {
      grupo.eventos.sort((a, b) => a.hora_simple.localeCompare(b.hora_simple));

      const entradas = grupo.eventos.filter(e => e.tipo === 'Entrada');
      const salidas = grupo.eventos.filter(e => e.tipo === 'Salida');
      const entradasAlmuerzo = grupo.eventos.filter(e => e.tipo === 'Entrada Almuerzo');
      const salidasAlmuerzo = grupo.eventos.filter(e => e.tipo === 'Salida Almuerzo');
      const otrosEventos = grupo.eventos.filter(e => 
        !['Entrada', 'Salida', 'Entrada Almuerzo', 'Salida Almuerzo'].includes(e.tipo)
      );

      const primeraEntrada = entradas[0];
      const ultimaSalida = salidas[salidas.length - 1] || salidas[0];
      const salidaAlmuerzo = salidasAlmuerzo[0];
      const entradaAlmuerzo = entradasAlmuerzo[0];

      let subtipo = '';

      if (primeraEntrada && ultimaSalida && salidaAlmuerzo && entradaAlmuerzo) {
        subtipo = 'Jornada completa';
      } else if (primeraEntrada && ultimaSalida && !salidaAlmuerzo && !entradaAlmuerzo) {
        subtipo = 'Sin almuerzo registrado';
      } else if (primeraEntrada && !ultimaSalida && !salidaAlmuerzo && !entradaAlmuerzo) {
        subtipo = 'Solo entrada';
      } else if (!primeraEntrada && ultimaSalida && !salidaAlmuerzo && !entradaAlmuerzo) {
        subtipo = 'Solo salida';
      } else if (primeraEntrada && !ultimaSalida && salidaAlmuerzo && entradaAlmuerzo) {
        subtipo = 'Falta salida final';
      } else if (!primeraEntrada && ultimaSalida && salidaAlmuerzo && entradaAlmuerzo) {
        subtipo = 'Falta entrada inicial';
      } else if (!primeraEntrada && !ultimaSalida && salidaAlmuerzo && entradaAlmuerzo) {
        subtipo = 'Solo almuerzo';
      } else if (primeraEntrada && ultimaSalida && salidaAlmuerzo && !entradaAlmuerzo) {
        subtipo = 'Falta entrada almuerzo';
      } else if (primeraEntrada && ultimaSalida && !salidaAlmuerzo && entradaAlmuerzo) {
        subtipo = 'Falta salida almuerzo';
      } else if (!primeraEntrada && !ultimaSalida && salidaAlmuerzo && !entradaAlmuerzo) {
        subtipo = 'Solo salida almuerzo';
      } else if (!primeraEntrada && !ultimaSalida && !salidaAlmuerzo && entradaAlmuerzo) {
        subtipo = 'Solo entrada almuerzo';
      } else if (otrosEventos.length > 0) {
        subtipo = `Otros eventos (${otrosEventos.map(e => e.tipo).join(', ')})`;
      } else {
        subtipo = 'Sin registros';
      }

      let horaSalidaValida = ultimaSalida?.hora_simple || null;
      if (primeraEntrada && ultimaSalida && 
          primeraEntrada.hora_simple === ultimaSalida.hora_simple) {
        horaSalidaValida = null;
        subtipo = 'ERROR - Misma hora entrada/salida';
      }

      if (primeraEntrada || ultimaSalida || salidaAlmuerzo || entradaAlmuerzo || otrosEventos.length > 0) {
        const dispositivo = primeraEntrada?.dispositivo || 
                           ultimaSalida?.dispositivo || 
                           salidaAlmuerzo?.dispositivo || 
                           entradaAlmuerzo?.dispositivo || 
                           'Desconocido';

        const foto = primeraEntrada?.foto || 
                     ultimaSalida?.foto || 
                     salidaAlmuerzo?.foto || 
                     entradaAlmuerzo?.foto || 
                     '';

        // Obtener la campaña/departamento del usuario
        const campaña = await obtenerCampañaPorDocumento(grupo.documento, client);

        registrosBD.push({
          documento: grupo.documento,
          nombre: grupo.nombre,
          fecha: grupo.fecha,
          hora_entrada: primeraEntrada?.hora_simple || null,
          hora_salida: horaSalidaValida,
          hora_salida_almuerzo: salidaAlmuerzo?.hora_simple || null,
          hora_entrada_almuerzo: entradaAlmuerzo?.hora_simple || null,
          tipo_evento: 'Asistencia',
          subtipo_evento: subtipo,
          dispositivo_ip: dispositivo,
          imagen: foto,
          campaña: campaña
        });
      }
    }
  } finally {
    client.release(); // IMPORTANTE: liberar la conexión
  }

  return registrosBD;
}

// Función principal MODIFICADA
async function sincronizarEventos() {
  const startTime = Date.now();

  try {
    const eventosHikvision = await obtenerEventosDeHikvision();

    if (eventosHikvision.length === 0) {
      return {
        eventos_obtenidos: 0,
        registros_procesados: 0,
        nuevos_registros: 0,
        registros_actualizados: 0,
        tiempo_segundos: ((Date.now() - startTime) / 1000).toFixed(2),
        mensaje: 'No hay eventos de hoy para sincronizar'
      };
    }

    const registrosBD = await procesarParaBD(eventosHikvision);

    if (registrosBD.length === 0) {
      return {
        eventos_obtenidos: eventosHikvision.length,
        registros_procesados: 0,
        nuevos_registros: 0,
        registros_actualizados: 0,
        tiempo_segundos: ((Date.now() - startTime) / 1000).toFixed(2),
        mensaje: 'Eventos obtenidos pero no generaron registros válidos'
      };
    }

    let insertados = 0;
    let actualizados = 0;

    // Usar el pool.query para queries simples (maneja conexión automáticamente)
    for (const registro of registrosBD) {
      try {
        const existe = await pool.query(
          'SELECT id FROM eventos_procesados WHERE documento = $1 AND fecha = $2',
          [registro.documento, registro.fecha]
        );

        if (existe.rows.length > 0) {
          await pool.query(`
            UPDATE eventos_procesados SET
              nombre = $1,
              hora_entrada = $2,
              hora_salida = $3,
              hora_salida_almuerzo = $4,
              hora_entrada_almuerzo = $5,
              tipo_evento = $6,
              subtipo_evento = $7,
              dispositivo_ip = $8,
              imagen = $9,
              campaña = $10,
              updated_at = CURRENT_TIMESTAMP
            WHERE documento = $11 AND fecha = $12
          `, [
            registro.nombre,
            registro.hora_entrada,
            registro.hora_salida,
            registro.hora_salida_almuerzo,
            registro.hora_entrada_almuerzo,
            registro.tipo_evento,
            registro.subtipo_evento,
            registro.dispositivo_ip,
            registro.imagen,
            registro.campaña,
            registro.documento,
            registro.fecha
          ]);
          actualizados++;
        } else {
          await pool.query(`
            INSERT INTO eventos_procesados (
              documento, nombre, fecha, hora_entrada, hora_salida,
              hora_salida_almuerzo, hora_entrada_almuerzo,
              tipo_evento, subtipo_evento, dispositivo_ip, imagen, campaña
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `, [
            registro.documento,
            registro.nombre,
            registro.fecha,
            registro.hora_entrada,
            registro.hora_salida,
            registro.hora_salida_almuerzo,
            registro.hora_entrada_almuerzo,
            registro.tipo_evento,
            registro.subtipo_evento,
            registro.dispositivo_ip,
            registro.imagen,
            registro.campaña
          ]);
          insertados++;
        }
      } catch (error) {
        console.error('Error procesando registro:', error.message);
      }
    }

    const tiempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);

    return {
      eventos_obtenidos: eventosHikvision.length,
      registros_procesados: registrosBD.length,
      nuevos_registros: insertados,
      registros_actualizados: actualizados,
      tiempo_segundos: parseFloat(tiempoTotal),
      fecha_sincronizada: new Date().toISOString().split('T')[0],
      hora_sincronizacion: getCurrentDateTime()
    };

  } catch (error) {
    console.error('Error en sincronizarEventos:', error);
    throw error;
  }
}

// ================================================
// CONTROL DE SINCRONIZACIÓN AUTOMÁTICA
// ================================================

let sincronizacionActiva = false;
let ultimaEjecucion = null;
let intervaloId = null;

async function ejecutarSincronizacionAutomatica() {
  try {
    const resultado = await sincronizarEventos();
    ultimaEjecucion = new Date().toISOString();
    
    console.log(`[${getCurrentDateTime()}] Sincronización completada:`, {
      registros: resultado.registros_procesados,
      nuevos: resultado.nuevos_registros,
      actualizados: resultado.registros_actualizados,
      tiempo: resultado.tiempo_segundos + 's'
    });
    
  } catch (error) {
    console.error(`[${getCurrentDateTime()}] Error en sincronización:`, error.message);
  }
}

function iniciarSincronizacionAutomatica() {
  if (sincronizacionActiva) return;
  
  sincronizacionActiva = true;
  
  // Ejecutar inmediatamente
  ejecutarSincronizacionAutomatica();
  
  // Configurar intervalo de 1 minuto
  intervaloId = setInterval(ejecutarSincronizacionAutomatica, 1 * 60 * 1000);
  
  console.log(`[${getCurrentDateTime()}] Sincronización automática iniciada (1 minuto)`);
}

function detenerSincronizacionAutomatica() {
  if (intervaloId) {
    clearInterval(intervaloId);
    intervaloId = null;
  }
  sincronizacionActiva = false;
  console.log(`[${getCurrentDateTime()}] Sincronización automática detenida`);
}

// ================================================
// ENDPOINTS (se mantienen igual)
// ================================================

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const accion = url.searchParams.get('accion');
    
    if (accion === 'estado') {
      let proximaEjecucion = null;
      
      if (ultimaEjecucion) {
        const ultima = new Date(ultimaEjecucion);
        proximaEjecucion = new Date(ultima.getTime() + 1 * 60 * 1000);
      }
      
      return NextResponse.json({
        success: true,
        sincronizacion_automatica: {
          activa: sincronizacionActiva,
          ultima_ejecucion: ultimaEjecucion,
          proxima_ejecucion: proximaEjecucion ? proximaEjecucion.toISOString() : null,
          intervalo_minutos: 1
        },
        timestamps: {
          servidor: new Date().toISOString(),
          hora_local: getCurrentDateTime()
        }
      });
    }
    
    if (accion === 'iniciar') {
      if (!sincronizacionActiva) {
        iniciarSincronizacionAutomatica();
        return NextResponse.json({
          success: true,
          message: 'Sincronización automática iniciada',
          intervalo: '1 minuto',
          hora: getCurrentDateTime()
        });
      } else {
        return NextResponse.json({
          success: true,
          message: 'La sincronización automática ya está activa',
          hora: getCurrentDateTime()
        });
      }
    }
    
    if (accion === 'detener') {
      if (sincronizacionActiva) {
        detenerSincronizacionAutomatica();
        return NextResponse.json({
          success: true,
          message: 'Sincronización automática detenida',
          hora: getCurrentDateTime()
        });
      } else {
        return NextResponse.json({
          success: true,
          message: 'La sincronización automática no está activa',
          hora: getCurrentDateTime()
        });
      }
    }
    
    if (accion === 'forzar') {
      const resultado = await sincronizarEventos();
      
      return NextResponse.json({
        success: true,
        message: 'Sincronización forzada ejecutada',
        hora: getCurrentDateTime(),
        ...resultado
      });
    }

    const resultado = await sincronizarEventos();

    return NextResponse.json({
      success: true,
      message: 'Sincronización de eventos de hoy completada',
      timestamp: new Date().toISOString(),
      hora: getCurrentDateTime(),
      ...resultado
    }, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store'
      }
    });

  } catch (error) {
    console.error('Error en endpoint GET:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      hora: getCurrentDateTime()
    }, {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function POST(request) {
  return await GET(request);
}

// ================================================
// INICIAR AUTOMÁTICAMENTE
// ================================================

function iniciarAutomaticamente() {
  if (typeof window !== 'undefined') return;
  if (sincronizacionActiva) return;

  console.log(`[${getCurrentDateTime()}] Iniciando sincronización automática en 5 segundos...`);
  
  setTimeout(() => {
    iniciarSincronizacionAutomatica();
  }, 5000);
}

iniciarAutomaticamente();