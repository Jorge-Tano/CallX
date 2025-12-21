// app/api/eventos/actualizar-eventos/route.js
import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { obtenerEventosDeHikvision } from '@/lib/db/eventos/database';

// Configuración del pool de conexiones
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

// ================================================
// FUNCIONES AUXILIARES
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

async function procesarParaBD(eventos) {
  const hoy = new Date().toISOString().split('T')[0];
  const eventosHoy = eventos.filter(evento => evento.fecha === hoy);

  if (eventosHoy.length === 0) return [];

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
  const client = await pool.connect();
  
  try {
    for (const grupo of Object.values(eventosPorDocumento)) {
      grupo.eventos.sort((a, b) => a.hora_simple.localeCompare(b.hora_simple));

      const entradas = grupo.eventos.filter(e => e.tipo === 'Entrada');
      const salidas = grupo.eventos.filter(e => e.tipo === 'Salida');
      const entradasAlmuerzo = grupo.eventos.filter(e => e.tipo === 'Entrada Almuerzo');
      const salidasAlmuerzo = grupo.eventos.filter(e => e.tipo === 'Salida Almuerzo');

      const primeraEntrada = entradas[0];
      const ultimaSalida = salidas[salidas.length - 1] || salidas[0];
      const salidaAlmuerzo = salidasAlmuerzo[0];
      const entradaAlmuerzo = entradasAlmuerzo[0];

      let subtipo = 'Sin registros';
      if (primeraEntrada && ultimaSalida && salidaAlmuerzo && entradaAlmuerzo) {
        subtipo = 'Jornada completa';
      } else if (primeraEntrada && ultimaSalida && !salidaAlmuerzo && !entradaAlmuerzo) {
        subtipo = 'Sin almuerzo';
      } else if (primeraEntrada && !ultimaSalida) {
        subtipo = 'Solo entrada';
      } else if (!primeraEntrada && ultimaSalida) {
        subtipo = 'Solo salida';
      } else if (primeraEntrada && ultimaSalida && (salidaAlmuerzo || entradaAlmuerzo)) {
        subtipo = 'Almuerzo parcial';
      }

      let horaSalidaValida = ultimaSalida?.hora_simple || null;
      if (primeraEntrada && ultimaSalida && primeraEntrada.hora_simple === ultimaSalida.hora_simple) {
        horaSalidaValida = null;
        subtipo = 'ERROR - Misma hora';
      }

      if (primeraEntrada || ultimaSalida || salidaAlmuerzo || entradaAlmuerzo) {
        const dispositivo = primeraEntrada?.dispositivo || ultimaSalida?.dispositivo || 'Desconocido';
        const foto = primeraEntrada?.foto || '';
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
    client.release();
  }

  return registrosBD;
}

// ================================================
// FUNCIÓN PRINCIPAL DE SINCRONIZACIÓN
// ================================================

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
        mensaje: 'No hay eventos de hoy'
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
        mensaje: 'Eventos no generaron registros'
      };
    }

    let insertados = 0;
    let actualizados = 0;

    for (const registro of registrosBD) {
      try {
        const existe = await pool.query(
          'SELECT id FROM eventos_procesados WHERE documento = $1 AND fecha = $2',
          [registro.documento, registro.fecha]
        );

        if (existe.rows.length > 0) {
          await pool.query(`
            UPDATE eventos_procesados SET
              nombre = $1, hora_entrada = $2, hora_salida = $3,
              hora_salida_almuerzo = $4, hora_entrada_almuerzo = $5,
              tipo_evento = $6, subtipo_evento = $7, dispositivo_ip = $8,
              imagen = $9, campaña = $10
            WHERE documento = $11 AND fecha = $12
          `, [
            registro.nombre, registro.hora_entrada, registro.hora_salida,
            registro.hora_salida_almuerzo, registro.hora_entrada_almuerzo,
            registro.tipo_evento, registro.subtipo_evento, registro.dispositivo_ip,
            registro.imagen, registro.campaña, registro.documento, registro.fecha
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
            registro.documento, registro.nombre, registro.fecha,
            registro.hora_entrada, registro.hora_salida,
            registro.hora_salida_almuerzo, registro.hora_entrada_almuerzo,
            registro.tipo_evento, registro.subtipo_evento,
            registro.dispositivo_ip, registro.imagen, registro.campaña
          ]);
          insertados++;
        }
      } catch (error) {
        // Error silencioso para registros individuales
      }
    }

    const tiempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`Sincronización: ${eventosHikvision.length} eventos, ${registrosBD.length} registros`);
    console.log(`Nuevos: ${insertados} | Actualizados: ${actualizados} | Tiempo: ${tiempoTotal}s`);

    return {
      eventos_obtenidos: eventosHikvision.length,
      registros_procesados: registrosBD.length,
      nuevos_registros: insertados,
      registros_actualizados: actualizados,
      tiempo_segundos: parseFloat(tiempoTotal),
      fecha_sincronizada: new Date().toISOString().split('T')[0],
      hora_sincronizacion: new Date().toLocaleString('es-CO')
    };

  } catch (error) {
    console.error('Error en sincronización:', error.message);
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
    
    if (resultado.eventos_obtenidos > 0) {
      console.log(`Sincronización automática OK: ${resultado.registros_procesados} registros`);
    }
  } catch (error) {
    console.error('Error en sincronización automática:', error.message);
  }
}

function iniciarSincronizacionAutomatica() {
  if (sincronizacionActiva) return;
  
  sincronizacionActiva = true;
  ejecutarSincronizacionAutomatica();
  intervaloId = setInterval(ejecutarSincronizacionAutomatica, 1 * 60 * 1000);
  console.log('Sincronización automática iniciada (1 minuto)');
}

function detenerSincronizacionAutomatica() {
  if (intervaloId) {
    clearInterval(intervaloId);
    intervaloId = null;
  }
  sincronizacionActiva = false;
  console.log('Sincronización automática detenida');
}

// ================================================
// ENDPOINTS
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
          proxima_ejecucion: proximaEjecucion?.toISOString(),
          intervalo_minutos: 1
        }
      });
    }
    
    if (accion === 'iniciar') {
      iniciarSincronizacionAutomatica();
      return NextResponse.json({
        success: true,
        message: 'Sincronización automática iniciada'
      });
    }
    
    if (accion === 'detener') {
      detenerSincronizacionAutomatica();
      return NextResponse.json({
        success: true,
        message: 'Sincronización automática detenida'
      });
    }
    
    if (accion === 'forzar') {
      const resultado = await sincronizarEventos();
      return NextResponse.json({
        success: true,
        message: 'Sincronización forzada ejecutada',
        ...resultado
      });
    }

    const resultado = await sincronizarEventos();
    return NextResponse.json({
      success: true,
      message: 'Sincronización completada',
      ...resultado
    });

  } catch (error) {
    console.error('Error en endpoint:', error.message);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
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

  setTimeout(() => {
    iniciarSincronizacionAutomatica();
  }, 5000);
}

iniciarAutomaticamente();