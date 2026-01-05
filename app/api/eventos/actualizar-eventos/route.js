// app/api/eventos/actualizar-eventos/route.js
import { NextResponse } from 'next/server';
import DigestFetch from 'digest-fetch';
import { Pool } from 'pg';

// Configuración - Ajustar para el dispositivo problemático
const CONFIG = {
    username: process.env.HIKUSER,
    password: process.env.HIKPASS,
    devices: [process.env.HIKVISION_IP1, process.env.HIKVISION_IP2].filter(Boolean),
    timeout: 30000,
    maxBatches: 100,           // Aumentar significativamente
    batchSize: 30,             // ¡IMPORTANTE! Usar 30 (lo que realmente devuelve el dispositivo)
    batchDelay: 500,           // Aumentar delay entre peticiones
    maxRetries: 3              // Agregar reintentos
};

// Configuración PostgreSQL
const pgConfig = {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || '127.0.0.1',
    database: process.env.DB_NAME || 'hikvision_events',
    password: process.env.DB_PASSWORD || 'OnePiece00.',
    port: parseInt(process.env.DB_PORT || '5432'),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
};

const pool = new Pool(pgConfig);

// Logger
const logger = {
    info: (msg, ...args) => console.log(`[${new Date().toLocaleTimeString('es-CO')}] ℹ️ ${msg}`, ...args),
    success: (msg, ...args) => console.log(`[${new Date().toLocaleTimeString('es-CO')}] ✅ ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[${new Date().toLocaleTimeString('es-CO')}] ❌ ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[${new Date().toLocaleTimeString('es-CO')}] ⚠️ ${msg}`, ...args), // <-- AÑADIR ESTA LÍNEA
    debug: (msg, ...args) => {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[${new Date().toLocaleTimeString('es-CO')}] 🐛 ${msg}`, ...args);
        }
    }
};

// Utilidades - Formato EXACTO como en el ejemplo
const formatHikvisionDate = (date) => {
    // Formato: YYYY-MM-DDThh:mm:ss (EXACTAMENTE como en el ejemplo)
    const año = date.getFullYear();
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    const horas = String(date.getHours()).padStart(2, '0');
    const minutos = String(date.getMinutes()).padStart(2, '0');
    const segundos = String(date.getSeconds()).padStart(2, '0');

    return `${año}-${mes}-${dia}T${horas}:${minutos}:${segundos}`;
};
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Cliente Hikvision CON manejo de sesión mejorado
class HikvisionHistoricalClient {
    constructor(deviceIp) {
        this.deviceIp = deviceIp;
        this.baseUrl = `https://${deviceIp}/ISAPI/AccessControl/AcsEvent?format=json`;
        this.client = null;
        this.lastRequestTime = 0;
        this.requestCount = 0;
        this.reauthenticate();
    }

    reauthenticate() {
        // Crear nuevo cliente con credenciales frescas
        this.client = new DigestFetch(CONFIG.username, CONFIG.password, {
            disableRetry: false,  // Habilitar reintentos
            algorithm: 'MD5'
        });
        this.requestCount = 0;
        this.lastRequestTime = Date.now();
        logger.debug(`${this.deviceIp}: Nueva autenticación creada`);
    }

    async fetchEventsRaw(startTime, endTime, position = 0) {
        // Reiniciar autenticación después de cierto número de peticiones
        if (this.requestCount >= 5) {  // Reiniciar cada 5 peticiones
            logger.debug(`${this.deviceIp}: Reiniciando autenticación (${this.requestCount} peticiones)`);
            this.reauthenticate();
        }

        // Body EXACTO como en el ejemplo de Postman
        const body = {
            AcsEventCond: {
                searchID: `hist_${this.deviceIp}_${Date.now()}_${position}`,
                searchResultPosition: position,
                maxResults: 30, // ¡IMPORTANTE! Usar 30 en lugar de 100
                major: 5,
                minor: 75,
                startTime: startTime,
                endTime: endTime
            }
        };

        this.requestCount++;

        try {
            const res = await this.client.fetch(this.baseUrl, {
                method: "POST",
                body: JSON.stringify(body),
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                timeout: CONFIG.timeout
            });

            const responseText = await res.text();

            if (res.status === 401) {
                logger.warn(`${this.deviceIp}: Error 401 - Reautenticando...`);
                this.reauthenticate();

                // Reintentar una vez después de reautenticar
                const retryRes = await this.client.fetch(this.baseUrl, {
                    method: "POST",
                    body: JSON.stringify(body),
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    timeout: CONFIG.timeout
                });

                const retryText = await retryRes.text();

                if (!retryRes.ok) {
                    logger.error(`${this.deviceIp}: HTTP ${retryRes.status} después de reautenticar`);
                    return {
                        error: `HTTP ${retryRes.status} después de reautenticar`,
                        deviceIp: this.deviceIp
                    };
                }

                return {
                    data: JSON.parse(retryText),
                    deviceIp: this.deviceIp
                };
            }

            if (!res.ok) {
                logger.error(`${this.deviceIp}: HTTP ${res.status} - ${responseText.substring(0, 200)}`);
                return {
                    error: `HTTP ${res.status}`,
                    deviceIp: this.deviceIp
                };
            }

            if (!responseText || responseText.trim() === '') {
                return { data: null, deviceIp: this.deviceIp };
            }

            return {
                data: JSON.parse(responseText),
                deviceIp: this.deviceIp
            };

        } catch (error) {
            logger.error(`${this.deviceIp}: ${error.message}`);
            return {
                error: error.message,
                deviceIp: this.deviceIp
            };
        }
    }
}

// Función mejorada con manejo de errores robusto
async function getAllEventsForDateRange(deviceIp, startTime, endTime) {
    const client = new HikvisionHistoricalClient(deviceIp);
    const todosLosEventos = [];
    let position = 0;
    let batchNumber = 1;
    let totalReported = 0;
    let hasMoreEvents = true;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;

    logger.info(`${deviceIp}: Consultando desde ${startTime} hasta ${endTime}`);

    while (batchNumber <= CONFIG.maxBatches && hasMoreEvents && consecutiveErrors < MAX_CONSECUTIVE_ERRORS) {
        try {
            const resultado = await client.fetchEventsRaw(startTime, endTime, position);

            if (resultado.error) {
                consecutiveErrors++;
                logger.error(`${deviceIp}: Error en lote ${batchNumber}: ${resultado.error} (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`);
                
                if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                    logger.error(`${deviceIp}: Demasiados errores consecutivos, deteniendo...`);
                    break;
                }
                
                // Pequeña pausa después de un error
                await delay(2000);
                continue;
            }

            // Resetear contador de errores después de éxito
            consecutiveErrors = 0;

            if (!resultado.data?.AcsEvent?.InfoList || resultado.data.AcsEvent.InfoList.length === 0) {
                logger.info(`${deviceIp}: No hay más eventos (lote ${batchNumber})`);
                hasMoreEvents = false;
                break;
            }

            const eventosBatch = resultado.data.AcsEvent.InfoList;
            todosLosEventos.push(...eventosBatch);

            // Actualizar total reportado
            if (resultado.data.AcsEvent.totalMatches !== undefined) {
                totalReported = resultado.data.AcsEvent.totalMatches;
            }

            logger.info(`${deviceIp}: Lote ${batchNumber} - ${eventosBatch.length} eventos (Total: ${todosLosEventos.length}/${totalReported})`);

            // Lógica de finalización mejorada
            if (totalReported > 0 && todosLosEventos.length >= totalReported) {
                logger.success(`${deviceIp}: ✅ Obtenidos todos los eventos (${todosLosEventos.length}/${totalReported})`);
                hasMoreEvents = false;
                break;
            }

            // Si el dispositivo devuelve menos de batchSize pero no sabemos el total
            // continuamos con cautela
            position = todosLosEventos.length;
            batchNumber++;

            // Pausa más larga después de varios lotes
            const delayTime = batchNumber % 10 === 0 ? 1000 : CONFIG.batchDelay;
            await delay(delayTime);

        } catch (error) {
            consecutiveErrors++;
            logger.error(`${deviceIp}: Error en lote ${batchNumber}: ${error.message}`);
            await delay(2000); // Pausa más larga después de error
        }
    }

    // Estadísticas finales
    if (todosLosEventos.length > 0) {
        logger.success(`${deviceIp}: ✅ ${todosLosEventos.length} eventos obtenidos`);
        if (totalReported > 0 && todosLosEventos.length < totalReported) {
            logger.warn(`${deviceIp}: ⚠️ Solo se obtuvieron ${todosLosEventos.length} de ${totalReported} eventos`);
        }
    } else {
        logger.error(`${deviceIp}: ❌ No se obtuvieron eventos`);
    }

    return {
        deviceIp,
        eventos: todosLosEventos,
        totalEventos: todosLosEventos.length,
        totalReported: totalReported,
        batchesProcessed: batchNumber - 1
    };
}

// Función para obtener información de usuarios - SIN FILTRO DE ESTADO
async function obtenerInfoUsuarios(documentos) {
    if (!documentos || documentos.length === 0) {
        return {};
    }

    try {
        const placeholders = documentos.map((_, index) => `$${index + 1}`).join(',');

        const query = `
            SELECT 
                employee_no as documento,
                nombre,
                departamento,
                tipo_usuario,
                estado,
                genero
            FROM usuarios_hikvision 
            WHERE employee_no IN (${placeholders})
        `;

        const result = await pool.query(query, documentos);

        logger.info(`✅ Obtenida información de ${result.rowCount} usuarios`);

        const infoPorDocumento = {};
        result.rows.forEach(row => {
            infoPorDocumento[row.documento] = {
                nombre: row.nombre,
                departamento: row.departamento || 'General',
                tipo_usuario: row.tipo_usuario,
                estado: row.estado,
                genero: row.genero
            };
        });

        return infoPorDocumento;
    } catch (error) {
        logger.error(`Error obteniendo información de usuarios: ${error.message}`);
        return {};
    }
}

// Función principal para procesar y guardar eventos
async function procesarEventos(eventosPorDispositivo) {
    try {
        // 1. Combinar todos los eventos
        const todosLosEventos = [];
        Object.entries(eventosPorDispositivo).forEach(([deviceIp, eventos]) => {
            if (eventos && Array.isArray(eventos)) {
                eventos.forEach(evento => {
                    todosLosEventos.push({
                        ...evento,
                        dispositivo: deviceIp
                    });
                });
            }
        });

        if (todosLosEventos.length === 0) {
            return {
                saved: 0,
                errors: 0,
                message: 'No se encontraron eventos para procesar'
            };
        }

        logger.info(`📊 Procesando ${todosLosEventos.length} eventos...`);

        // 2. Obtener información de usuarios únicos
        const documentosUnicos = [...new Set(todosLosEventos
            .map(evento => evento.employeeNoString || evento.cardNo)
            .filter(Boolean))];

        logger.info(`👥 Consultando información de ${documentosUnicos.length} usuarios únicos...`);
        const usuariosInfo = await obtenerInfoUsuarios(documentosUnicos);

        // 3. Procesar y estructurar eventos por día
        const eventosPorDia = {};

        todosLosEventos.forEach(event => {
            try {
                const documento = event.employeeNoString || event.cardNo || null;
                const nombre = event.name || null;
                const eventTime = event.time;
                const attendanceStatus = event.attendanceStatus || null;
                const dispositivo = event.dispositivo;
                const pictureURL = event.pictureURL || null;

                if (!documento || !eventTime || !attendanceStatus) {
                    return;
                }

                const fecha = eventTime.split('T')[0];
                const hora = eventTime.split('T')[1]?.split('-')[0]?.substring(0, 8);

                if (!fecha || !hora) {
                    return;
                }

                // Obtener información del usuario (puede no existir en la BD)
                const infoUsuario = usuariosInfo[documento] || {};

                if (!eventosPorDia[fecha]) {
                    eventosPorDia[fecha] = {};
                }

                const key = `${documento}_${fecha}`;

                if (!eventosPorDia[fecha][key]) {
                    eventosPorDia[fecha][key] = {
                        documento: documento,
                        nombre: nombre || infoUsuario.nombre || 'Sin nombre',
                        fecha: fecha,
                        departamento: infoUsuario.departamento || 'General',
                        imagen: null,
                        dispositivo_ip: dispositivo,
                        checkIns: [],
                        checkOuts: [],
                        breakOuts: [],
                        breakIns: []
                    };
                }

                // Agregar evento según el tipo
                switch (attendanceStatus) {
                    case 'checkIn':
                        eventosPorDia[fecha][key].checkIns.push(hora);
                        break;
                    case 'checkOut':
                        eventosPorDia[fecha][key].checkOuts.push(hora);
                        break;
                    case 'breakOut':
                        eventosPorDia[fecha][key].breakOuts.push(hora);
                        break;
                    case 'breakIn':
                        eventosPorDia[fecha][key].breakIns.push(hora);
                        break;
                }

                // Guardar la imagen del primer evento con imagen
                if (pictureURL && !eventosPorDia[fecha][key].imagen) {
                    eventosPorDia[fecha][key].imagen = pictureURL;
                }

            } catch (error) {
                logger.debug(`Error procesando evento: ${error.message}`);
            }
        });

        // 4. Guardar en base de datos
        let totalSaved = 0;
        let totalErrors = 0;
        const diasProcesados = Object.keys(eventosPorDia).length;

        logger.info(`📅 Procesando ${diasProcesados} días de eventos...`);

        for (const [fechaStr, eventosDelDia] of Object.entries(eventosPorDia)) {
            let savedPorDia = 0;
            let errorsPorDia = 0;

            for (const evento of Object.values(eventosDelDia)) {
                try {
                    // Ordenar horas
                    evento.checkIns.sort();
                    evento.checkOuts.sort();
                    evento.breakOuts.sort();
                    evento.breakIns.sort();

                    // Determinar valores finales
                    const valores = {
                        hora_entrada: evento.checkIns[0] || null,
                        hora_salida: evento.checkOuts[evento.checkOuts.length - 1] || null,
                        hora_salida_almuerzo: evento.breakOuts[0] || null,
                        hora_entrada_almuerzo: evento.breakIns[evento.breakIns.length - 1] || null
                    };

                    // DEBUG: Mostrar lo que se va a guardar
                    if (evento.documento === '1001414927' && fechaStr === '2026-01-02') {
                        logger.info(`🔍 DEBUG 1001414927 - ${fechaStr}:`, {
                            checkIns: evento.checkIns,
                            checkOuts: evento.checkOuts,
                            valores: valores,
                            nombre: evento.nombre,
                            departamento: evento.departamento
                        });
                    }

                    // Solo guardar si hay AL MENOS UN dato
                    const tieneDatos = valores.hora_entrada || valores.hora_salida ||
                        valores.hora_salida_almuerzo || valores.hora_entrada_almuerzo;

                    if (!tieneDatos) {
                        continue;
                    }

                    const fechaDate = new Date(fechaStr + 'T00:00:00');

                    const query = `
                        INSERT INTO eventos_procesados (
                            documento, nombre, fecha, 
                            hora_entrada, hora_salida, 
                            hora_salida_almuerzo, hora_entrada_almuerzo,
                            dispositivo_ip, campaña, "imagen"
                        ) VALUES ($1, $2, $3, $4::time, $5::time, $6::time, $7::time, $8, $9, $10)
                        ON CONFLICT (documento, fecha)
                        DO UPDATE SET
                            hora_entrada = COALESCE(EXCLUDED.hora_entrada::time, eventos_procesados.hora_entrada),
                            hora_salida = COALESCE(EXCLUDED.hora_salida::time, eventos_procesados.hora_salida),
                            hora_salida_almuerzo = COALESCE(EXCLUDED.hora_salida_almuerzo::time, eventos_procesados.hora_salida_almuerzo),
                            hora_entrada_almuerzo = COALESCE(EXCLUDED.hora_entrada_almuerzo::time, eventos_procesados.hora_entrada_almuerzo),
                            nombre = COALESCE(EXCLUDED.nombre, eventos_procesados.nombre),
                            dispositivo_ip = CASE 
                                WHEN eventos_procesados.dispositivo_ip = 'multiple' THEN 'multiple'
                                WHEN EXCLUDED.dispositivo_ip = 'multiple' THEN 'multiple'
                                WHEN eventos_procesados.dispositivo_ip != EXCLUDED.dispositivo_ip THEN 'multiple'
                                ELSE COALESCE(EXCLUDED.dispositivo_ip, eventos_procesados.dispositivo_ip)
                            END,
                            campaña = COALESCE(EXCLUDED.campaña, eventos_procesados.campaña),
                            "imagen" = COALESCE(EXCLUDED."imagen", eventos_procesados."imagen")
                        RETURNING id;
                    `;

                    await pool.query(query, [
                        evento.documento,
                        evento.nombre,
                        fechaDate,
                        valores.hora_entrada,
                        valores.hora_salida,
                        valores.hora_salida_almuerzo,
                        valores.hora_entrada_almuerzo,
                        evento.dispositivo_ip,
                        evento.departamento,
                        evento.imagen
                    ]);

                    savedPorDia++;
                    totalSaved++;

                    // Log específico para el usuario 1001414927
                    if (evento.documento === '1001414927' && fechaStr === '2026-01-02') {
                        logger.success(`✅ Guardado 1001414927 - ${fechaStr}: entrada=${valores.hora_entrada}, salida=${valores.hora_salida}`);
                    }

                } catch (error) {
                    errorsPorDia++;
                    totalErrors++;
                    logger.error(`❌ Error guardando ${evento.documento}-${fechaStr}: ${error.message}`);
                }
            }

            logger.info(`📅 Día ${fechaStr}: ${savedPorDia} registros guardados, ${errorsPorDia} errores`);
        }

        logger.success(`✅ Proceso completado: ${totalSaved} registros guardados, ${totalErrors} errores`);

        return {
            saved: totalSaved,
            errors: totalErrors,
            diasProcesados: diasProcesados,
            eventosTotales: todosLosEventos.length,
            message: `Procesados ${diasProcesados} días con ${totalSaved} registros`
        };

    } catch (error) {
        logger.error(`Error en procesarEventos: ${error.message}`);
        logger.error(`Stack: ${error.stack}`);
        return {
            saved: 0,
            errors: 1,
            message: `Error: ${error.message}`
        };
    }
}

// Función principal - Buscar TODOS los eventos (EXACTO como en Postman)
async function sincronizarTodosEventos() {
    const startTime = Date.now();

    try {
        logger.info(`🚀 INICIANDO SINCRONIZACIÓN DE TODOS LOS EVENTOS`);
        logger.info(`📱 Dispositivos: ${CONFIG.devices.length}`);

        // Rango EXACTO como en el ejemplo de Postman
        const ahora = new Date();
        const inicioDate = new Date('2025-01-01T00:00:00'); // Fijo: 1 de enero de 2025

        // Asegurar horas exactas
        inicioDate.setHours(0, 0, 0, 0);
        ahora.setHours(23, 59, 59, 999);

        const inicioBusqueda = formatHikvisionDate(inicioDate);
        const finBusqueda = formatHikvisionDate(ahora);

        logger.info(`🔍 Rango EXACTO como Postman:`);
        logger.info(`   Inicio: ${inicioBusqueda} (1 de enero 2025)`);
        logger.info(`   Fin: ${finBusqueda} (hoy)`);
        logger.info(`   Duración: ${Math.ceil((ahora - inicioDate) / (1000 * 60 * 60 * 24))} días`);

        // Consultar todos los dispositivos
        logger.info(`📡 Consultando ${CONFIG.devices.length} dispositivos...`);

        const resultados = await Promise.allSettled(
            CONFIG.devices.map(deviceIp =>
                getAllEventsForDateRange(deviceIp, inicioBusqueda, finBusqueda)
            )
        );

        // Procesar resultados
        const eventosPorDispositivo = {};
        let totalEventosObtenidos = 0;
        const estadisticasDispositivos = {};

        for (let i = 0; i < resultados.length; i++) {
            const resultado = resultados[i];
            const deviceIp = CONFIG.devices[i];

            if (resultado.status === 'fulfilled') {
                const data = resultado.value;
                eventosPorDispositivo[deviceIp] = data.eventos;
                totalEventosObtenidos += data.totalEventos;

                estadisticasDispositivos[deviceIp] = {
                    eventos: data.totalEventos,
                    batches: data.batchesProcessed
                };

                logger.success(`${deviceIp}: ${data.totalEventos} eventos obtenidos`);
            } else {
                eventosPorDispositivo[deviceIp] = [];
                estadisticasDispositivos[deviceIp] = {
                    eventos: 0,
                    batches: 0,
                    error: resultado.reason?.message
                };
                logger.error(`${deviceIp}: Error: ${resultado.reason?.message}`);
            }
        }

        logger.info(`📊 Total eventos obtenidos de todos los dispositivos: ${totalEventosObtenidos}`);

        // Procesar y guardar eventos
        let dbResult = null;
        if (totalEventosObtenidos > 0) {
            logger.info(`💾 Guardando ${totalEventosObtenidos} eventos en base de datos...`);
            dbResult = await procesarEventos(eventosPorDispositivo);
        } else {
            logger.warn('⚠️ NO se encontraron eventos en ningún dispositivo');
            dbResult = {
                saved: 0,
                errors: 0,
                message: 'No se encontraron eventos en los dispositivos'
            };
        }

        const elapsed = Date.now() - startTime;
        const elapsedSeconds = (elapsed / 1000).toFixed(2);

        logger.success(`✅ Sincronización completada en ${elapsedSeconds} segundos`);

        return {
            success: true,
            timestamp: new Date().toISOString(),
            rango: {
                inicio: inicioBusqueda,
                fin: finBusqueda,
                descripcion: 'Desde 1 de enero 2025 hasta hoy'
            },
            estadisticas: {
                dispositivos: CONFIG.devices.length,
                eventosObtenidos: totalEventosObtenidos,
                porDispositivo: estadisticasDispositivos
            },
            procesamiento: dbResult,
            tiempo: {
                segundos: elapsedSeconds,
                milisegundos: elapsed
            }
        };

    } catch (error) {
        const elapsed = Date.now() - startTime;
        logger.error(`❌ Error en sincronización: ${error.message}`);
        logger.error(`Stack: ${error.stack}`);

        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
            tiempo: {
                segundos: (elapsed / 1000).toFixed(2),
                milisegundos: elapsed
            }
        };
    }
}

// Endpoint único - Siempre sincroniza todos los eventos
export async function POST(request) {
    try {
        logger.info(`📥 Solicitud de sincronización completa recibida`);

        const resultado = await sincronizarTodosEventos();

        return NextResponse.json({
            ...resultado,
            endpoint: '/api/eventos/actualizar-eventos',
            descripcion: 'Sincroniza eventos desde 1 de enero 2025 hasta hoy'
        });

    } catch (error) {
        logger.error(`Error en endpoint: ${error.message}`);
        return NextResponse.json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}

// También acepta GET para compatibilidad
export async function GET(request) {
    try {
        logger.info(`📥 Solicitud GET de sincronización recibida`);

        const resultado = await sincronizarTodosEventos();

        return NextResponse.json({
            ...resultado,
            metodo: 'GET',
            nota: 'Recomendado usar POST para operaciones largas'
        });

    } catch (error) {
        logger.error(`Error en endpoint GET: ${error.message}`);
        return NextResponse.json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}

// Configuración de runtime
export const dynamic = 'force-dynamic';
export const maxDuration = 600; // 10 minutos máximo