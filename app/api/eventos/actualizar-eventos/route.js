// app/api/eventos/actualizar-eventos/route.js
import { NextResponse } from 'next/server';
import { Client } from 'pg';
import DigestFetch from 'digest-fetch';

// Configuración de PostgreSQL
const DB_CONFIG = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
};

// Configuración HIKVISION
const HIKVISION_CONFIG = {
  username: process.env.HIKUSER,
  password: process.env.HIKPASS,
  devices: [process.env.HIKVISION_IP1, process.env.HIKVISION_IP2].filter(Boolean),
  maxResults: 100,
  requestDelay: 300,
  deviceDelay: 1000,
  timeout: 30000
};

// Función de logging simplificada
const log = {
  info: (...args) => console.log(`[${new Date().toLocaleString('es-CO')}]`, ...args),
  error: (...args) => console.error(`[${new Date().toLocaleString('es-CO')}] ❌`, ...args),
  success: (...args) => console.log(`[${new Date().toLocaleString('es-CO')}] ✅`, ...args),
  warn: (...args) => console.warn(`[${new Date().toLocaleString('es-CO')}] ⚠️`, ...args)
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const formatHikvisionDate = (date) => date.toISOString().replace(/\.\d{3}Z$/, '');

// Cliente Hikvision
class HikvisionClient {
  constructor(deviceIp) {
    this.deviceIp = deviceIp;
    this.baseUrl = `https://${deviceIp}/ISAPI/AccessControl/AcsEvent?format=json`;
    this.client = new DigestFetch(HIKVISION_CONFIG.username, HIKVISION_CONFIG.password, {
      disableRetry: true,
      algorithm: 'MD5'
    });
  }

  async fetchEvents(startTime, endTime, position = 0) {
    const body = {
      AcsEventCond: {
        searchID: `search_${this.deviceIp}_${Date.now()}`,
        searchResultPosition: position,
        maxResults: HIKVISION_CONFIG.maxResults,
        major: 5,
        minor: 75,
        startTime,
        endTime
      }
    };

    const res = await this.client.fetch(this.baseUrl, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      timeout: HIKVISION_CONFIG.timeout
    });

    if (!res.ok) {
      const errorText = await res.text();
      if (res.status === 400 || res.status === 404) {
        return { AcsEvent: { InfoList: [], totalMatches: 0 } };
      }
      throw new Error(`HTTP ${res.status}: ${errorText.substring(0, 100)}`);
    }

    const responseText = await res.text();
    if (!responseText || responseText.trim() === '') {
      return { AcsEvent: { InfoList: [], totalMatches: 0 } };
    }

    return JSON.parse(responseText);
  }
}

// Consultar eventos de un dispositivo
async function consultarTodosEventosDispositivo(client, startTime, endTime) {
  let allEvents = [];
  let position = 0;
  let batchNumber = 1;
  let totalMatches = null;
  let maxBatches = 30;

  while (batchNumber <= maxBatches) {
    try {
      const data = await client.fetchEvents(startTime, endTime, position);
      
      if (!data?.AcsEvent) break;

      const eventosBatch = data.AcsEvent.InfoList || [];
      const batchSize = eventosBatch.length;

      if (batchNumber === 1) {
        totalMatches = data.AcsEvent.totalMatches || 0;
      }

      if (batchSize === 0) {
        if (totalMatches > 0 && allEvents.length >= totalMatches) break;
        if (batchNumber === 1 && totalMatches > 0) {
          position = 1;
          continue;
        }
        break;
      }

      const eventosConInfo = eventosBatch.map(evento => ({
        ...evento,
        dispositivo: client.deviceIp
      }));

      allEvents.push(...eventosConInfo);

      if (totalMatches > 0 && allEvents.length >= totalMatches) break;

      position += batchSize;
      batchNumber++;
      await delay(HIKVISION_CONFIG.requestDelay);

    } catch (error) {
      if (error.message.includes('position') || error.message.includes('range')) {
        position += 1;
        await delay(500);
        continue;
      }
      if (batchNumber <= 3) {
        await delay(2000);
        continue;
      }
      break;
    }
  }

  return { eventos: allEvents, dispositivo: client.deviceIp };
}

// Obtener eventos por día
async function obtenerEventosDeHikvisionPorDia(fecha) {
  const startTime = Date.now();
  
  try {
    log.info(`Consultando eventos para: ${fecha}`);
    
    const fechaLocal = new Date(`${fecha}T00:00:00`);
    const inicio = new Date(fechaLocal);
    inicio.setUTCHours(4, 0, 0, 0);
    const fin = new Date(fechaLocal);
    fin.setUTCHours(30, 59, 59, 999);

    const resultadosConsulta = [];

    for (const deviceIp of HIKVISION_CONFIG.devices) {
      let resultado;
      let intentos = 0;

      while (intentos < 2) {
        intentos++;
        try {
          const client = new HikvisionClient(deviceIp);
          resultado = await consultarTodosEventosDispositivo(
            client,
            formatHikvisionDate(inicio),
            formatHikvisionDate(fin)
          );
          if (resultado.eventos.length > 0) break;
        } catch (error) {
          if (intentos < 2) await delay(5000);
        }
      }

      if (resultado?.eventos.length > 0) {
        resultadosConsulta.push(resultado);
        log.success(`${deviceIp}: ${resultado.eventos.length} eventos`);
      }

      if (deviceIp !== HIKVISION_CONFIG.devices[HIKVISION_CONFIG.devices.length - 1]) {
        await delay(HIKVISION_CONFIG.deviceDelay);
      }
    }

    const eventosProcesados = procesarEventosCrudos(resultadosConsulta, fecha);
    const tiempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);
    
    log.success(`Consulta completada en ${tiempoTotal}s: ${eventosProcesados.length} eventos`);
    return eventosProcesados;

  } catch (error) {
    log.error(`Error obteniendo eventos para ${fecha}: ${error.message}`);
    return [];
  }
}

// Procesar eventos crudos
function procesarEventosCrudos(resultadosConsulta, fechaSolicitada) {
  const eventosProcesados = [];

  for (const resultado of resultadosConsulta) {
    const { dispositivo, eventos } = resultado;

    for (const evento of eventos) {
      try {
        if (!evento.time) continue;

        const fechaUTC = new Date(evento.time);
        if (isNaN(fechaUTC.getTime())) continue;
        
        const fechaColombia = new Date(fechaUTC.getTime());
        fechaColombia.setHours(fechaColombia.getHours() - 5);
        
        const fechaEventoColombia = fechaColombia.toISOString().split('T')[0];
        const horaColombia = fechaColombia.toISOString().split('T')[1]?.substring(0, 8) || '00:00:00';
        
        if (fechaEventoColombia !== fechaSolicitada) continue;

        let tipo = 'Evento';
        const label = evento.label || '';
        const attendanceStatus = evento.attendanceStatus || '';

        if (attendanceStatus === 'breakOut') tipo = 'Salida Almuerzo';
        else if (attendanceStatus === 'breakIn') tipo = 'Entrada Almuerzo';
        else if (label.toLowerCase().includes('entrada')) {
          tipo = label.toLowerCase().includes('almuerzo') || label.toLowerCase().includes('lunch') 
            ? 'Entrada Almuerzo' : 'Entrada';
        } else if (label.toLowerCase().includes('salida')) {
          tipo = label.toLowerCase().includes('almuerzo') || label.toLowerCase().includes('lunch') 
            ? 'Salida Almuerzo' : 'Salida';
        } else if (evento.minor === 75) {
          tipo = (evento.major === 5 || evento.major === 1) ? 'Entrada' : 'Salida';
        } else if (evento.major === 1 || evento.cardReaderNo === 1) tipo = 'Entrada';
        else if (evento.major === 2 || evento.cardReaderNo === 2) tipo = 'Salida';

        let documento = 'N/A';
        if (evento.employeeNoString && evento.employeeNoString.trim() !== '') {
          documento = evento.employeeNoString.trim();
        } else if (evento.cardNo && evento.cardNo.trim() !== '') {
          documento = evento.cardNo.trim();
        } else if (evento.employeeNo) {
          documento = evento.employeeNo.toString();
        }

        const nombre = evento.name ? evento.name.trim() : 'Sin nombre';

        eventosProcesados.push({
          dispositivo,
          nombre,
          documento,
          fecha: fechaEventoColombia,
          hora_simple: horaColombia,
          tipo,
          departamento: evento.department || 'Sin departamento',
          foto: evento.pictureURL || ''
        });

      } catch (error) {
        // Error silencioso para eventos individuales
      }
    }
  }

  return eventosProcesados;
}

// Obtener eventos por rango
async function obtenerEventosDeHikvisionPorRango(fechaInicio, fechaFin) {
  const todosEventos = [];
  const inicio = new Date(fechaInicio);
  const fin = new Date(fechaFin);
  const fechaActual = new Date(inicio);
  
  while (fechaActual <= fin) {
    const fechaStr = fechaActual.toISOString().split('T')[0];
    const eventosDelDia = await obtenerEventosDeHikvisionPorDia(fechaStr);
    
    if (eventosDelDia.length > 0) {
      todosEventos.push(...eventosDelDia);
    }
    
    fechaActual.setDate(fechaActual.getDate() + 1);
    if (fechaActual <= fin) await delay(1500);
  }
  
  return todosEventos;
}

// Obtener campaña por documento
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

// Procesar para BD
async function procesarParaBD(eventos, client) {
  const eventosPorFechaDocumento = {};

  eventos.forEach((evento) => {
    if (evento.documento === 'N/A') return;
    const key = `${evento.fecha}_${evento.documento}`;
    if (!eventosPorFechaDocumento[key]) {
      eventosPorFechaDocumento[key] = {
        documento: evento.documento,
        nombre: evento.nombre,
        fecha: evento.fecha,
        eventos: []
      };
    }
    eventosPorFechaDocumento[key].eventos.push(evento);
  });

  const registrosBD = [];

  for (const key of Object.keys(eventosPorFechaDocumento)) {
    const grupo = eventosPorFechaDocumento[key];
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

  log.success(`Registros generados: ${registrosBD.length}`);
  return registrosBD;
}

// Función principal de sincronización
async function sincronizarEventos(fechaInicio = null, fechaFin = null) {
  const startTime = Date.now();
  let client;

  try {
    const esHistorico = fechaInicio && fechaFin && fechaInicio !== fechaFin;
    log.info(`${esHistorico ? 'SINCRONIZACIÓN HISTÓRICA' : 'SINCRONIZACIÓN DE HOY'}: ${fechaInicio || 'hoy'}`);

    let eventosHikvision;
    
    if (esHistorico) {
      eventosHikvision = await obtenerEventosDeHikvisionPorRango(fechaInicio, fechaFin);
    } else {
      const hoy = fechaInicio || new Date().toISOString().split('T')[0];
      eventosHikvision = await obtenerEventosDeHikvisionPorDia(hoy);
    }

    if (eventosHikvision.length === 0) {
      const tiempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);
      return {
        eventos_obtenidos: 0,
        registros_procesados: 0,
        nuevos_registros: 0,
        registros_actualizados: 0,
        tiempo_segundos: parseFloat(tiempoTotal),
        mensaje: 'No hay eventos'
      };
    }

    log.success(`${eventosHikvision.length} eventos obtenidos`);

    client = new Client(DB_CONFIG);
    await client.connect();

    await client.query(`
      CREATE TABLE IF NOT EXISTS eventos_procesados (
        id SERIAL PRIMARY KEY,
        documento VARCHAR(50) NOT NULL,
        nombre VARCHAR(255) NOT NULL,
        fecha DATE NOT NULL,
        hora_entrada TIME,
        hora_salida TIME,
        hora_salida_almuerzo TIME,
        hora_entrada_almuerzo TIME,
        tipo_evento VARCHAR(50),
        subtipo_evento VARCHAR(50),
        dispositivo_ip VARCHAR(50),
        imagen TEXT,
        campaña VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(documento, fecha)
      )
    `);

    const registrosBD = await procesarParaBD(eventosHikvision, client);

    if (registrosBD.length === 0) {
      const tiempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);
      return {
        eventos_obtenidos: eventosHikvision.length,
        registros_procesados: 0,
        nuevos_registros: 0,
        registros_actualizados: 0,
        tiempo_segundos: parseFloat(tiempoTotal),
        mensaje: 'Eventos obtenidos pero no generaron registros válidos'
      };
    }

    let insertados = 0;
    let actualizados = 0;
    let errores = 0;

    for (const registro of registrosBD) {
      try {
        const existe = await client.query(
          'SELECT id FROM eventos_procesados WHERE documento = $1 AND fecha = $2',
          [registro.documento, registro.fecha]
        );

        if (existe.rows.length > 0) {
          await client.query(`
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
          await client.query(`
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
        errores++;
      }
    }

    const tiempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);

    log.success(`SINCRONIZACIÓN COMPLETADA`);
    log.info(`Eventos: ${eventosHikvision.length} | Registros: ${registrosBD.length}`);
    log.info(`Nuevos: ${insertados} | Actualizados: ${actualizados} | Errores: ${errores}`);
    log.info(`Tiempo: ${tiempoTotal}s`);

    return {
      eventos_obtenidos: eventosHikvision.length,
      registros_procesados: registrosBD.length,
      nuevos_registros: insertados,
      registros_actualizados: actualizados,
      errores: errores,
      tiempo_segundos: parseFloat(tiempoTotal),
      fecha_sincronizada: fechaInicio === fechaFin ? fechaInicio : `${fechaInicio} a ${fechaFin}`,
      hora_sincronizacion: new Date().toLocaleString('es-CO')
    };

  } catch (error) {
    log.error(`ERROR: ${error.message}`);
    throw error;
  } finally {
    if (client) await client.end();
  }
}

// Variables de control para sincronización automática
let sincronizacionActiva = false;
let ultimaEjecucion = null;
let intervaloId = null;

// Sincronización automática
async function ejecutarSincronizacionAutomatica() {
  try {
    log.info('Sincronización automática');
    const resultado = await sincronizarEventos();
    ultimaEjecucion = new Date().toISOString();
    
    if (resultado.eventos_obtenidos > 0) {
      log.success(`Sincronización completada: ${resultado.eventos_obtenidos} eventos`);
    }
  } catch (error) {
    log.error(`Error en sincronización automática: ${error.message}`);
  }
}

function iniciarSincronizacionAutomatica() {
  if (sincronizacionActiva) return;
  sincronizacionActiva = true;
  ejecutarSincronizacionAutomatica();
  intervaloId = setInterval(ejecutarSincronizacionAutomatica, 2 * 60 * 1000);
  log.info('Sincronización automática iniciada (cada 2 minutos)');
}

function detenerSincronizacionAutomatica() {
  if (!sincronizacionActiva) return;
  if (intervaloId) clearInterval(intervaloId);
  sincronizacionActiva = false;
  intervaloId = null;
  log.info('Sincronización automática detenida');
}

// Endpoint principal
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const accion = url.searchParams.get('accion');
    const fechaInicio = url.searchParams.get('fechaInicio');
    const fechaFin = url.searchParams.get('fechaFin');
    
    if (accion === 'ayer') {
      const hoy = new Date();
      const ayer = new Date(hoy);
      ayer.setDate(hoy.getDate() - 1);
      const fechaAyer = ayer.toISOString().split('T')[0];
      const resultado = await sincronizarEventos(fechaAyer, fechaAyer);
      
      return NextResponse.json({
        success: true,
        message: `Sincronización de ayer (${fechaAyer}) completada`,
        ...resultado
      });
    }
    
    if (accion === 'historico' && fechaInicio && fechaFin) {
      const resultado = await sincronizarEventos(fechaInicio, fechaFin);
      return NextResponse.json({
        success: true,
        message: `Sincronización histórica de ${fechaInicio} al ${fechaFin} completada`,
        ...resultado
      });
    }
    
    if (accion === 'estado') {
      return NextResponse.json({
        success: true,
        sincronizacion_automatica: {
          activa: sincronizacionActiva,
          ultima_ejecucion: ultimaEjecucion,
          intervalo_minutos: 2
        }
      });
    }
    
    if (accion === 'iniciar') {
      iniciarSincronizacionAutomatica();
      return NextResponse.json({
        success: true,
        message: 'Sincronización automática iniciada',
        intervalo: '2 minutos'
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
    log.error(`ERROR EN ENDPOINT: ${error.message}`);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

export async function POST(request) {
  return await GET(request);
}

// Iniciar automáticamente
function iniciarAutomaticamente() {
  if (typeof window !== 'undefined') return;
  if (sincronizacionActiva) return;

  setTimeout(() => {
    iniciarSincronizacionAutomatica();
  }, 3000);
}

log.info('Módulo de sincronización cargado');
iniciarAutomaticamente();