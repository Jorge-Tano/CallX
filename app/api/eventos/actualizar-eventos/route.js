

import { NextResponse } from 'next/server';
import { Client } from 'pg';
import { obtenerEventosDeHikvision } from '@/lib/db/eventos/database';

// Configuración de PostgreSQL
const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'hikvision_events',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'OnePiece00.'
};

// ================================================
// FUNCIONES DE UTILIDAD
// ================================================

const formatHoraColombia = (fecha = new Date()) => {
  const fechaColombia = new Date(fecha);
  fechaColombia.setHours(fechaColombia.getHours() - 5);
  return fechaColombia.toLocaleString('es-CO');
};

const convertirUTCaColombia = (fechaUTC) => {
  if (!fechaUTC) return null;
  const fecha = new Date(fechaUTC);
  fecha.setHours(fecha.getHours() - 5);
  return fecha.toISOString();
};

const log = {
  info: (...args) => {
    console.log(`[${formatHoraColombia()}]`, ...args);
  },
  error: (...args) => {
    console.error(`[${formatHoraColombia()}] ❌`, ...args);
  },
  success: (...args) => {
    console.log(`[${formatHoraColombia()}] ✅`, ...args);
  },
  warn: (...args) => {
    console.warn(`[${formatHoraColombia()}] ⚠️`, ...args);
  }
};

// ================================================
// NUEVA FUNCIÓN PARA OBTENER EVENTOS POR DÍA
// ================================================

async function obtenerEventosDeHikvisionPorDia(fecha) {
  const startTime = Date.now();
  const logger = {
    debug: (...args) => console.log(...args),
    error: (...args) => console.error(...args)
  };

  try {
    const formatHikvisionDate = (date) => date.toISOString().replace(/\.\d{3}Z$/, '');
    
    // Importar DigestFetch dinámicamente
    const DigestFetchModule = await import('digest-fetch');
    const DigestFetch = DigestFetchModule.default;
    
    const createDigestClient = () => new DigestFetch("admin", "Tattered3483", {
      disableRetry: true,
      algorithm: 'MD5'
    });

    const resultadosConsulta = [];
    const dispositivos = ["172.31.0.165", "172.31.0.164"];

    // Consultar cada dispositivo
    for (const deviceIp of dispositivos) {
      const baseUrl = `https://${deviceIp}/ISAPI/AccessControl/AcsEvent?format=json`;
      const client = createDigestClient();
      
      logger.debug(`Consultando dispositivo: ${deviceIp} para fecha: ${fecha}`);

      const inicio = new Date(`${fecha}T00:00:00Z`);
      const fin = new Date(`${fecha}T23:59:59Z`);

      let allEvents = [];
      let position = 0;
      let batchNumber = 1;
      let totalMatches = null;
      let maxBatches = 20; // Límite de batches para evitar bucles infinitos

      while (batchNumber <= maxBatches) {
        try {
          const body = {
            AcsEventCond: {
              searchID: `search_${deviceIp}_${Date.now()}`,
              searchResultPosition: position,
              maxResults: 100, // Máximo por batch
              major: 5,
              minor: 75,
              startTime: formatHikvisionDate(inicio),
              endTime: formatHikvisionDate(fin)
            }
          };

          const res = await client.fetch(baseUrl, {
            method: "POST",
            body: JSON.stringify(body),
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json"
            },
            timeout: 30000
          });

          if (!res.ok) {
            const errorText = await res.text();
            if (res.status === 400 || res.status === 404) {
              logger.debug(`Dispositivo ${deviceIp} sin eventos para ${fecha}`);
              break;
            }
            logger.error(`Error HTTP ${res.status}: ${errorText.substring(0, 100)}`);
            break;
          }

          const responseText = await res.text();
          if (!responseText || responseText.trim() === '') {
            break;
          }

          const data = JSON.parse(responseText);
          const eventosBatch = data?.AcsEvent?.InfoList || [];
          const batchSize = eventosBatch.length;

          if (batchNumber === 1) {
            totalMatches = data?.AcsEvent?.totalMatches || 0;
            logger.debug(`Total reportado por ${deviceIp}: ${totalMatches}`);
          }

          if (batchSize === 0) {
            // Si es el primer batch y hay totalMatches, intentar desde posición 1
            if (batchNumber === 1 && totalMatches > 0) {
              position = 1;
              continue;
            }
            break;
          }

          allEvents.push(...eventosBatch.map(evento => ({
            ...evento,
            dispositivo: deviceIp,
            batchNumber
          })));

          logger.debug(`Lote ${batchNumber}: ${batchSize} eventos, acumulados: ${allEvents.length}`);

          if (totalMatches > 0 && allEvents.length >= totalMatches) {
            logger.debug(`Obtenidos todos los ${totalMatches} eventos`);
            break;
          }

          position += batchSize;
          batchNumber++;
          await new Promise(resolve => setTimeout(resolve, 200));

        } catch (error) {
          logger.error(`Error en lote ${batchNumber}: ${error.message}`);
          
          // Si es error de posición, intentar desde la siguiente
          if (error.message.includes('position') || error.message.includes('range')) {
            position += 1;
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }

          if (batchNumber <= 3) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          break;
        }
      }

      if (allEvents.length > 0) {
        resultadosConsulta.push({
          dispositivo: deviceIp,
          eventos: allEvents,
          totalReportado: totalMatches,
          fecha: fecha
        });
      }

      logger.debug(`${deviceIp}: ${allEvents.length} eventos obtenidos para ${fecha}`);
      
      // Delay entre dispositivos
      if (deviceIp !== dispositivos[dispositivos.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Procesar eventos
    const eventosProcesados = [];
    
    for (const resultado of resultadosConsulta) {
      const { dispositivo } = resultado;

      for (const evento of resultado.eventos) {
        try {
          if (!evento.time) continue;

          const partes = evento.time.split('T');
          if (partes.length !== 2) continue;

          let fechaEvento = partes[0];
          const tiempoParte = partes[1];

          // Verificar que la fecha coincida con la solicitada
          if (fechaEvento !== fecha) {
            // A veces los dispositivos devuelven eventos de días cercanos
            const fechaEventoObj = new Date(fechaEvento);
            const fechaSolicitadaObj = new Date(fecha);
            const diffDias = Math.abs((fechaEventoObj - fechaSolicitadaObj) / (1000 * 60 * 60 * 24));
            
            if (diffDias > 1) {
              // Descartar eventos que no son del día solicitado
              continue;
            }
          }

          let horaLocal;
          if (tiempoParte.includes('-') || tiempoParte.includes('+')) {
            const match = tiempoParte.match(/^(\d{2}:\d{2}:\d{2})/);
            if (match) horaLocal = match[1];
          } else if (tiempoParte.includes('Z')) {
            horaLocal = tiempoParte.substring(0, 8);
          } else {
            horaLocal = tiempoParte.substring(0, 8);
          }

          if (!horaLocal) continue;

          // Determinar tipo de evento
          let tipo = 'Evento';
          const label = evento.label || '';
          const attendanceStatus = evento.attendanceStatus || '';

          if (attendanceStatus === 'breakOut') tipo = 'Salida Almuerzo';
          else if (attendanceStatus === 'breakIn') tipo = 'Entrada Almuerzo';
          else if (label.toLowerCase().includes('almuerzo')) {
            if (label.toLowerCase().includes('salida') || label.toLowerCase().includes('a almuerzo')) {
              tipo = 'Salida Almuerzo';
            } else if (label.toLowerCase().includes('entrada') || label.toLowerCase().includes('de almuerzo')) {
              tipo = 'Entrada Almuerzo';
            }
          } else if (label.toLowerCase().includes('salida')) tipo = 'Salida';
          else if (label.toLowerCase().includes('entrada')) tipo = 'Entrada';
          else if (evento.minor === 75) tipo = evento.major === 5 ? 'Salida' : 'Entrada';

          // Documento del empleado
          let documento = 'N/A';
          if (evento.employeeNoString && evento.employeeNoString.trim() !== '') {
            documento = evento.employeeNoString.trim();
          } else if (evento.cardNo && evento.cardNo.trim() !== '') {
            documento = evento.cardNo.trim();
          }

          const nombre = evento.name ? evento.name.trim() : 'Sin nombre';

          eventosProcesados.push({
            dispositivo,
            nombre,
            documento,
            fecha: fechaEvento, // Usar la fecha real del evento
            hora: `${fechaEvento}T${horaLocal}Z`,
            hora_simple: horaLocal,
            tipo,
            departamento: evento.department || 'Sin departamento',
            foto: evento.pictureURL || '',
            label_original: label,
            attendance_status_original: attendanceStatus,
            time_original: evento.time
          });

        } catch (error) {
          logger.error(`Error procesando evento: ${error.message}`);
        }
      }
    }

    const tiempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.debug(`Consulta para ${fecha} completada en ${tiempoTotal}s`);
    logger.debug(`Eventos obtenidos para ${fecha}: ${eventosProcesados.length}`);

    return eventosProcesados;

  } catch (error) {
    logger.error(`Error en obtenerEventosDeHikvisionPorDia para ${fecha}: ${error.message}`);
    return [];
  }
}

// ================================================
// FUNCIÓN PARA OBTENER EVENTOS POR RANGO (DÍA POR DÍA)
// ================================================

async function obtenerEventosDeHikvisionPorRango(fechaInicio, fechaFin) {
  log.info(`🔍 Iniciando consulta desde ${fechaInicio} hasta ${fechaFin}`);
  
  const inicio = new Date(fechaInicio);
  const fin = new Date(fechaFin);
  
  const todosEventos = [];
  
  // Procesar día por día
  const fechaActual = new Date(inicio);
  
  while (fechaActual <= fin) {
    const fechaStr = fechaActual.toISOString().split('T')[0];
    
    log.info(`📅 Consultando fecha: ${fechaStr}`);
    
    const eventosDelDia = await obtenerEventosDeHikvisionPorDia(fechaStr);
    
    if (eventosDelDia.length > 0) {
      log.success(`✅ ${fechaStr}: ${eventosDelDia.length} eventos obtenidos`);
      todosEventos.push(...eventosDelDia);
    } else {
      log.warn(`⚠️  ${fechaStr}: Sin eventos`);
    }
    
    // Pasar al siguiente día
    fechaActual.setDate(fechaActual.getDate() + 1);
    
    // Delay entre días para no sobrecargar los dispositivos
    if (fechaActual <= fin) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  log.info(`📊 Total eventos obtenidos: ${todosEventos.length}`);
  
  return todosEventos;
}

// ================================================
// VARIABLES DE CONTROL PARA SINCRONIZACIÓN AUTOMÁTICA
// ================================================

let sincronizacionActiva = false;
let ultimaEjecucion = null;
let intervaloId = null;

// ================================================
// FUNCIONES DE SINCRONIZACIÓN
// ================================================

// Función para obtener campaña/departamento desde usuarios_hikvision
async function obtenerCampañaPorDocumento(documento, client) {
  if (!documento || documento === 'N/A') return 'Sin grupo';
  
  try {
    const result = await client.query(
      'SELECT departamento FROM usuarios_hikvision WHERE employee_no = $1',
      [documento]
    );
    return result.rows.length > 0 ? result.rows[0].departamento : 'Sin grupo';
  } catch (error) {
    log.error(`Error obteniendo campaña para ${documento}:`, error.message);
    return 'Sin grupo';
  }
}

// Función para procesar eventos para la BD
async function procesarParaBD(eventos, client) {
  log.info('🔄 Procesando eventos para BD...');

  // Agrupar eventos por fecha y documento
  const eventosPorFechaDocumento = {};

  // Clasificar eventos por fecha y documento
  eventos.forEach((evento, index) => {
    if (evento.documento === 'N/A') {
      return;
    }

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

  // Procesar cada documento por fecha
  for (const key of Object.keys(eventosPorFechaDocumento)) {
    const grupo = eventosPorFechaDocumento[key];
    
    // Ordenar eventos por hora
    grupo.eventos.sort((a, b) => a.hora_simple.localeCompare(b.hora_simple));

    const entradas = grupo.eventos.filter(e => e.tipo === 'Entrada');
    const salidas = grupo.eventos.filter(e => e.tipo === 'Salida');
    const entradasAlmuerzo = grupo.eventos.filter(e => e.tipo === 'Entrada Almuerzo');
    const salidasAlmuerzo = grupo.eventos.filter(e => e.tipo === 'Salida Almuerzo');
    const otrosEventos = grupo.eventos.filter(e => 
      !['Entrada', 'Salida', 'Entrada Almuerzo', 'Salida Almuerzo'].includes(e.tipo)
    );

    // Solo mostrar logs para grupos con eventos
    if (entradas.length > 0 || salidas.length > 0 || entradasAlmuerzo.length > 0 || salidasAlmuerzo.length > 0) {
      log.info(`📋 ${grupo.fecha} - ${grupo.documento} - ${grupo.nombre}:`);
      if (entradas.length > 0) log.info(`   • Entradas: ${entradas.length} - ${entradas.map(e => e.hora_simple).join(', ')}`);
      if (salidas.length > 0) log.info(`   • Salidas: ${salidas.length} - ${salidas.map(e => e.hora_simple).join(', ')}`);
      if (salidasAlmuerzo.length > 0) log.info(`   • Salidas Almuerzo: ${salidasAlmuerzo.length} - ${salidasAlmuerzo.map(e => e.hora_simple).join(', ')}`);
      if (entradasAlmuerzo.length > 0) log.info(`   • Entradas Almuerzo: ${entradasAlmuerzo.length} - ${entradasAlmuerzo.map(e => e.hora_simple).join(', ')}`);
    }

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

      log.info(`📝 Registro: ${grupo.fecha} - ${grupo.documento} - ${subtipo}`);
    }
  }

  log.info(`\n📊 TOTAL REGISTROS GENERADOS: ${registrosBD.length}`);
  return registrosBD;
}

// ================================================
// FUNCIÓN PRINCIPAL DE SINCRONIZACIÓN
// ================================================

async function sincronizarEventos(fechaInicio = null, fechaFin = null) {
  const startTime = Date.now();
  let client;

  try {
    log.info('='.repeat(60));
    
    if (fechaInicio && fechaFin) {
      log.info('💾 SINCRONIZACIÓN EVENTOS HISTÓRICOS → POSTGRESQL');
      log.info(`📅 Rango: ${fechaInicio} al ${fechaFin}`);
    } else {
      log.info('💾 SINCRONIZACIÓN EVENTOS DE HOY → POSTGRESQL');
      const hoy = new Date().toISOString().split('T')[0];
      fechaInicio = hoy;
      fechaFin = hoy;
      log.info(`📅 Eventos del día: ${hoy}`);
    }
    
    log.info('='.repeat(60));

    let eventosHikvision;
    
    if (fechaInicio && fechaFin && fechaInicio !== fechaFin) {
      // Usar la nueva función para rango de fechas (día por día)
      eventosHikvision = await obtenerEventosDeHikvisionPorRango(fechaInicio, fechaFin);
    } else {
      // Usar la función original para un solo día
      eventosHikvision = await obtenerEventosDeHikvision();
    }

    if (eventosHikvision.length === 0) {
      const mensaje = fechaInicio === fechaFin 
        ? 'No hay eventos para hoy' 
        : `No hay eventos en el rango ${fechaInicio} - ${fechaFin}`;
      
      return {
        eventos_obtenidos: 0,
        registros_procesados: 0,
        nuevos_registros: 0,
        registros_actualizados: 0,
        tiempo_segundos: ((Date.now() - startTime) / 1000).toFixed(2),
        mensaje: mensaje
      };
    }

    log.success(`✅ ${eventosHikvision.length} eventos obtenidos`);

    client = new Client(DB_CONFIG);
    await client.connect();
    log.success('Conectado a PostgreSQL');

    // Verificar/crear tabla
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
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(documento, fecha)
      )
    `);

    log.success('Tabla verificada/creada');

    const registrosBD = await procesarParaBD(eventosHikvision, client);

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

    log.info(`📝 Guardando ${registrosBD.length} registros...`);

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
              created_at = CURRENT_TIMESTAMP
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
          if (actualizados % 10 === 0) {
            log.info(`   🔄 Actualizados: ${actualizados}/${registrosBD.length}`);
          }
        } else {
          await client.query(`
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
          if (insertados % 10 === 0) {
            log.info(`   ➕ Insertados: ${insertados}/${registrosBD.length}`);
          }
        }

      } catch (error) {
        errores++;
        log.error(`Error con ${registro.documento} - ${registro.fecha}: ${error.message}`);
      }
    }

    const tiempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);

    log.info('\n' + '='.repeat(60));
    log.success('SINCRONIZACIÓN COMPLETADA');
    log.info('='.repeat(60));
    log.info(`📊 RESULTADOS:`);
    log.info(`   • Eventos obtenidos: ${eventosHikvision.length}`);
    log.info(`   • Registros procesados: ${registrosBD.length}`);
    log.info(`   • Nuevos registros: ${insertados}`);
    log.info(`   • Registros actualizados: ${actualizados}`);
    log.info(`   • Errores: ${errores}`);
    log.info(`   • Tiempo total: ${tiempoTotal} segundos`);
    log.info(`   • Rango: ${fechaInicio} a ${fechaFin}`);

    return {
      eventos_obtenidos: eventosHikvision.length,
      registros_procesados: registrosBD.length,
      nuevos_registros: insertados,
      registros_actualizados: actualizados,
      errores: errores,
      tiempo_segundos: parseFloat(tiempoTotal),
      fecha_sincronizada: fechaInicio === fechaFin ? fechaInicio : `${fechaInicio} a ${fechaFin}`,
      hora_sincronizacion_colombia: formatHoraColombia()
    };

  } catch (error) {
    log.error('ERROR EN SINCRONIZACIÓN:', error.message);
    throw error;

  } finally {
    if (client) {
      await client.end();
      log.info('🔌 Conexión PostgreSQL cerrada');
    }
  }
}

// ================================================
// FUNCIONES DE CONTROL AUTOMÁTICO
// ================================================

async function ejecutarSincronizacionAutomatica() {
  try {
    log.info('\n' + '-'.repeat(50));
    log.info('🔄 EJECUTANDO SINCRONIZACIÓN AUTOMÁTICA');
    log.info(`🕐 Hora Colombia: ${formatHoraColombia()}`);
    log.info('-'.repeat(50));

    const resultado = await sincronizarEventos();
    
    ultimaEjecucion = new Date().toISOString();

    if (resultado.eventos_obtenidos > 0) {
      log.success(`Sincronización completada: ${resultado.eventos_obtenidos} eventos`);
      log.info(`📊 Guardados: ${resultado.registros_procesados} registros`);
      log.info(`⏱️  Tiempo: ${resultado.tiempo_segundos}s`);
    } else {
      log.info('No hay eventos nuevos para sincronizar');
    }

  } catch (error) {
    log.error('Error en sincronización automática:', error.message);
  }
}

function iniciarSincronizacionAutomatica() {
  if (sincronizacionActiva) {
    log.info('Sincronización automática ya está activa');
    return;
  }

  log.info('\n' + '='.repeat(70));
  log.info('⏰ INICIANDO SINCRONIZACIÓN AUTOMÁTICA (Cada 1 minuto)');
  log.info('='.repeat(70));
  log.info(`🕐 Hora Colombia: ${formatHoraColombia()}`);
  log.info('='.repeat(70));

  sincronizacionActiva = true;

  ejecutarSincronizacionAutomatica();

  intervaloId = setInterval(ejecutarSincronizacionAutomatica, 1 * 60 * 1000);

  if (typeof process !== 'undefined') {
    process.on('SIGINT', limpiarSincronizacion);
    process.on('SIGTERM', limpiarSincronizacion);
  }
}

function detenerSincronizacionAutomatica() {
  if (!sincronizacionActiva) {
    log.info('Sincronización automática no está activa');
    return;
  }

  if (intervaloId) {
    clearInterval(intervaloId);
    log.info('🛑 Intervalo de sincronización detenido');
  }
  sincronizacionActiva = false;
  intervaloId = null;
}

function limpiarSincronizacion() {
  detenerSincronizacionAutomatica();
}

// ================================================
// ENDPOINT PRINCIPAL (GET)
// ================================================

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const accion = url.searchParams.get('accion');
    const fechaInicio = url.searchParams.get('fechaInicio');
    const fechaFin = url.searchParams.get('fechaFin');
    
    // Nuevo caso para sincronización histórica
    if (accion === 'historico' && fechaInicio && fechaFin) {
      log.info(`🔍 Sincronización histórica solicitada: ${fechaInicio} al ${fechaFin}`);
      
      const resultado = await sincronizarEventos(fechaInicio, fechaFin);
      
      return NextResponse.json({
        success: true,
        message: `Sincronización histórica de ${fechaInicio} al ${fechaFin} completada`,
        hora_colombia: formatHoraColombia(),
        ...resultado
      });
    }
    
    // Caso para sincronizar diciembre 1-13 específicamente
    if (accion === 'diciembre') {
      const inicioDiciembre = '2024-12-01';
      const finDiciembre = '2024-12-13';
      
      log.info(`🎄 SINCRONIZACIÓN DICIEMBRE 1-13 SOLICITADA`);
      log.info(`📅 Fechas: ${inicioDiciembre} al ${finDiciembre}`);
      
      const resultado = await sincronizarEventos(inicioDiciembre, finDiciembre);
      
      return NextResponse.json({
        success: true,
        message: `Sincronización DICIEMBRE (1-13) completada`,
        hora_colombia: formatHoraColombia(),
        ...resultado
      });
    }
    
    // Caso para sincronizar día por día específico
    if (accion === 'dia' && fechaInicio) {
      log.info(`📅 Sincronización para día específico: ${fechaInicio}`);
      
      const resultado = await sincronizarEventos(fechaInicio, fechaInicio);
      
      return NextResponse.json({
        success: true,
        message: `Sincronización para ${fechaInicio} completada`,
        hora_colombia: formatHoraColombia(),
        ...resultado
      });
    }
    
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
          ultima_ejecucion_colombia: convertirUTCaColombia(ultimaEjecucion),
          proxima_ejecucion: proximaEjecucion ? proximaEjecucion.toISOString() : null,
          proxima_ejecucion_colombia: proximaEjecucion ? convertirUTCaColombia(proximaEjecucion.toISOString()) : null,
          intervalo_minutos: 1
        },
        timestamps: {
          servidor_utc: new Date().toISOString(),
          servidor_local: formatHoraColombia(),
          colombia: convertirUTCaColombia(new Date().toISOString()),
          diferencia_horas: 'Colombia = UTC - 5 horas'
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
          hora_colombia: formatHoraColombia()
        });
      } else {
        return NextResponse.json({
          success: true,
          message: 'La sincronización automática ya está activa',
          hora_colombia: formatHoraColombia()
        });
      }
    }
    
    if (accion === 'detener') {
      if (sincronizacionActiva) {
        detenerSincronizacionAutomatica();
        return NextResponse.json({
          success: true,
          message: 'Sincronización automática detenida',
          hora_colombia: formatHoraColombia()
        });
      } else {
        return NextResponse.json({
          success: true,
          message: 'La sincronización automática no está activa',
          hora_colombia: formatHoraColombia()
        });
      }
    }
    
    if (accion === 'forzar') {
      log.info('🔧 Ejecución forzada solicitada');
      const resultado = await sincronizarEventos();
      
      return NextResponse.json({
        success: true,
        message: 'Sincronización forzada ejecutada',
        hora_colombia: formatHoraColombia(),
        ...resultado
      });
    }

    // Ejecutar sincronización normal (hoy por defecto)
    const resultado = await sincronizarEventos();

    return NextResponse.json({
      success: true,
      message: 'Sincronización de eventos de hoy completada',
      timestamp: new Date().toISOString(),
      hora_colombia: formatHoraColombia(),
      ...resultado
    }, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store'
      }
    });

  } catch (error) {
    log.error('ERROR EN ENDPOINT:', error.message);

    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      hora_colombia: formatHoraColombia()
    }, {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ================================================
// ENDPOINT POST
// ================================================

export async function POST(request) {
  return await GET(request);
}

// ================================================
// INICIAR AUTOMÁTICAMENTE AL CARGAR EL MÓDULO
// ================================================

function iniciarAutomaticamente() {
  if (typeof window !== 'undefined') {
    return;
  }

  if (sincronizacionActiva) {
    log.info('Sincronización automática ya está activa');
    return;
  }

  log.info('\n🔍 INICIANDO SINCRONIZACIÓN AUTOMÁTICA...');
  log.info(`🕐 Hora Colombia: ${formatHoraColombia()}`);
  log.info(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);

  setTimeout(() => {
    log.info('🚀 SINCRONIZACIÓN AUTOMÁTICA INICIADA');
    iniciarSincronizacionAutomatica();
  }, 1000);
}

log.info('📦 Módulo de sincronización cargado');
iniciarAutomaticamente();
