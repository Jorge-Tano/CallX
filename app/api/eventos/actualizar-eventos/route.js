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

// Logger mejorado
const logger = {
    info: (msg, ...args) => console.log(`[${new Date().toLocaleTimeString('es-CO')}] ℹ️ ${msg}`, ...args),
    success: (msg, ...args) => console.log(`[${new Date().toLocaleTimeString('es-CO')}] ✅ ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[${new Date().toLocaleTimeString('es-CO')}] ❌ ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[${new Date().toLocaleTimeString('es-CO')}] ⚠️ ${msg}`, ...args),
    debug: (msg, ...args) => {
        if (process.env.NODE_ENV === 'development' || process.env.DEBUG_MODE === 'true') {
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

// ==================== CLIENTE HIKVISION MEJORADO ====================

class HikvisionHistoricalClient {
    constructor(deviceIp) {
        this.deviceIp = deviceIp;
        this.baseUrl = `https://${deviceIp}/ISAPI/AccessControl/AcsEvent?format=json`;
        this.client = null;
        this.requestCount = 0;
        this.reauthenticate();
    }

    reauthenticate() {
        // Crear nuevo cliente con credenciales frescas
        this.client = new DigestFetch(CONFIG.username, CONFIG.password, {
            disableRetry: true,  // IMPORTANTE: Deshabilitar reintentos automáticos
            algorithm: 'MD5'
        });
        this.requestCount = 0;
        logger.debug(`${this.deviceIp}: Nueva autenticación creada`);
    }

    async fetchEventsRaw(startTime, endTime, position = 0) {
        // Controlar frecuencia de peticiones
        if (this.requestCount > 0) {
            await delay(CONFIG.batchDelay);
        }

        this.requestCount++;

        // Body EXACTO como en el ejemplo de Postman
        const body = {
            AcsEventCond: {
                searchID: `hist_${this.deviceIp}_${Date.now()}_${position}`,
                searchResultPosition: position,
                maxResults: CONFIG.batchSize, // Usar batchSize configurable
                major: 5,
                minor: 75,
                startTime: startTime,
                endTime: endTime,
                reportMode: 'customize', // Agregar para mejor compatibilidad
                eventType: 'attendance'  // Especificar que queremos eventos de asistencia
            }
        };

        try {
            logger.debug(`${this.deviceIp}: Petición #${this.requestCount}, posición ${position}`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);

            const res = await this.client.fetch(this.baseUrl, {
                method: "POST",
                body: JSON.stringify(body),
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Connection": "keep-alive"
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const responseText = await res.text();

            // DEBUG: Ver respuesta cruda (primeros 500 caracteres)
            if (process.env.DEBUG_MODE === 'true' && position === 0) {
                logger.debug(`${this.deviceIp}: Respuesta (${res.status}): ${responseText.substring(0, 500)}...`);
            }

            if (res.status === 401) {
                logger.warn(`${this.deviceIp}: Error 401 - Reautenticando...`);
                this.reauthenticate();
                
                // Reintentar después de reautenticar
                await delay(1000);
                return await this.fetchEventsRaw(startTime, endTime, position);
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

            let parsedData;
            try {
                parsedData = JSON.parse(responseText);
            } catch (parseError) {
                logger.error(`${this.deviceIp}: Error parseando JSON: ${parseError.message}`);
                return {
                    error: `JSON parse error: ${parseError.message}`,
                    deviceIp: this.deviceIp
                };
            }

            return {
                data: parsedData,
                deviceIp: this.deviceIp,
                httpStatus: res.status
            };

        } catch (error) {
            logger.error(`${this.deviceIp}: ${error.name}: ${error.message}`);
            
            if (error.name === 'AbortError') {
                return {
                    error: `Timeout después de ${CONFIG.timeout}ms`,
                    deviceIp: this.deviceIp
                };
            }
            
            return {
                error: error.message,
                deviceIp: this.deviceIp
            };
        }
    }
}

// ==================== FUNCIÓN MEJORADA PARA OBTENER EVENTOS ====================

async function getAllEventsForDateRange(deviceIp, startTime, endTime) {
    const client = new HikvisionHistoricalClient(deviceIp);
    const todosLosEventos = [];
    let position = 0;
    let batchNumber = 1;
    let totalReported = 0;
    let hasMoreEvents = true;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;

    logger.info(`${deviceIp}: 🔍 Consultando desde ${startTime} hasta ${endTime}`);

    // Estadísticas por tipo de evento
    const stats = {
        checkIn: 0,
        checkOut: 0,
        breakOut: 0,
        breakIn: 0,
        unknown: 0,
        totalProcessed: 0
    };

    while (batchNumber <= CONFIG.maxBatches && hasMoreEvents && consecutiveErrors < MAX_CONSECUTIVE_ERRORS) {
        try {
            const resultado = await client.fetchEventsRaw(startTime, endTime, position);

            if (resultado.error) {
                consecutiveErrors++;
                logger.error(`${deviceIp}: Error en lote ${batchNumber}: ${resultado.error}`);
                
                if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                    logger.error(`${deviceIp}: ❌ Demasiados errores consecutivos, deteniendo...`);
                    break;
                }
                
                await delay(2000);
                continue;
            }

            consecutiveErrors = 0; // Resetear contador de errores

            if (!resultado.data?.AcsEvent?.InfoList) {
                logger.info(`${deviceIp}: No hay InfoList en la respuesta`);
                hasMoreEvents = false;
                break;
            }

            const eventosBatch = resultado.data.AcsEvent.InfoList;
            
            if (eventosBatch.length === 0) {
                logger.info(`${deviceIp}: Lote ${batchNumber} vacío, terminando`);
                hasMoreEvents = false;
                break;
            }

            // Contar tipos de eventos en este lote
            const batchStats = {
                checkIn: 0,
                checkOut: 0,
                breakOut: 0,
                breakIn: 0,
                unknown: 0
            };

            eventosBatch.forEach(evento => {
                const status = (evento.attendanceStatus || '').toLowerCase();
                
                if (status.includes('checkin') || status === 'checkin') {
                    batchStats.checkIn++;
                } else if (status.includes('checkout') || status === 'checkout') {
                    batchStats.checkOut++;
                } else if (status.includes('breakout') || status === 'breakout') {
                    batchStats.breakOut++;
                } else if (status.includes('breakin') || status === 'breakin') {
                    batchStats.breakIn++;
                } else {
                    batchStats.unknown++;
                    // DEBUG: Mostrar eventos con status desconocido
                    if (process.env.DEBUG_MODE === 'true') {
                        logger.debug(`${deviceIp}: Evento con status desconocido:`, {
                            status: evento.attendanceStatus,
                            major: evento.major,
                            minor: evento.minor,
                            employeeNo: evento.employeeNoString,
                            name: evento.name
                        });
                    }
                }
            });

            // Sumar estadísticas del lote
            Object.keys(batchStats).forEach(key => {
                stats[key] += batchStats[key];
            });

            todosLosEventos.push(...eventosBatch);
            stats.totalProcessed += eventosBatch.length;

            // Actualizar total reportado
            if (resultado.data.AcsEvent.totalMatches !== undefined) {
                totalReported = resultado.data.AcsEvent.totalMatches;
            }

            logger.info(`${deviceIp}: Lote ${batchNumber} - ${eventosBatch.length} eventos`);
            logger.debug(`${deviceIp}: Estadísticas lote:`, batchStats);

            // Verificar si hemos obtenido todos los eventos
            if (totalReported > 0 && todosLosEventos.length >= totalReported) {
                logger.success(`${deviceIp}: ✅ Obtenidos todos los eventos reportados (${todosLosEventos.length}/${totalReported})`);
                hasMoreEvents = false;
                break;
            }

            // Mover posición para siguiente lote
            position = todosLosEventos.length;
            batchNumber++;

            // Pausa estratégica
            const pauseTime = batchNumber % 5 === 0 ? 1000 : CONFIG.batchDelay;
            await delay(pauseTime);

        } catch (error) {
            consecutiveErrors++;
            logger.error(`${deviceIp}: ❌ Error en lote ${batchNumber}: ${error.message}`);
            await delay(2000);
        }
    }

    // Reporte final detallado
    logger.info(`${deviceIp}: 📊 REPORTE FINAL:`);
    logger.info(`${deviceIp}:   Total eventos obtenidos: ${todosLosEventos.length}`);
    logger.info(`${deviceIp}:   Total reportado por API: ${totalReported}`);
    logger.info(`${deviceIp}:   Lotes procesados: ${batchNumber - 1}`);
    logger.info(`${deviceIp}:   Estadísticas por tipo:`);
    logger.info(`${deviceIp}:     ✅ checkIn: ${stats.checkIn}`);
    logger.info(`${deviceIp}:     🚪 checkOut: ${stats.checkOut}`);
    logger.info(`${deviceIp}:     🍽️  breakOut: ${stats.breakOut}`);
    logger.info(`${deviceIp}:     ↩️  breakIn: ${stats.breakIn}`);
    logger.info(`${deviceIp}:     ❓ unknown: ${stats.unknown}`);

    // DEBUG: Mostrar algunos eventos específicos del problema
    if (deviceIp === '172.31.0.131' && process.env.DEBUG_MODE === 'true') {
        logger.debug(`${deviceIp}: 🔍 EVENTOS ESPECÍFICOS DEL DISPOSITIVO PROBLEMÁTICO:`);
        
        const eventosProblematicos = todosLosEventos.filter(e => 
            e.employeeNoString && ['1001414927', '1007306404', '1007306599', '1007306658', '1035223535', '1035870870', '1035877647', '1214740552'].includes(e.employeeNoString)
        );
        
        eventosProblematicos.forEach((evento, idx) => {
            logger.debug(`${deviceIp}: Evento ${idx + 1}:`, {
                employeeNo: evento.employeeNoString,
                name: evento.name,
                time: evento.time,
                attendanceStatus: evento.attendanceStatus,
                major: evento.major,
                minor: evento.minor,
                cardNo: evento.cardNo
            });
        });
    }

    return {
        deviceIp,
        eventos: todosLosEventos,
        totalEventos: todosLosEventos.length,
        totalReported: totalReported,
        batchesProcessed: batchNumber - 1,
        stats: stats
    };
}

// ==================== FUNCIÓN MEJORADA PARA PROCESAR EVENTOS ====================

// Función para interpretar el tipo de evento según major/minor codes
function determinarTipoEvento(evento) {
    const status = (evento.attendanceStatus || '').toLowerCase();
    
    // Primero intentar con attendanceStatus
    if (status.includes('checkin') || status === 'checkin') {
        return 'checkIn';
    }
    if (status.includes('checkout') || status === 'checkout') {
        return 'checkOut';
    }
    if (status.includes('breakout') || status === 'breakout') {
        return 'breakOut';
    }
    if (status.includes('breakin') || status === 'breakin') {
        return 'breakIn';
    }
    
    // Si no hay attendanceStatus claro, usar major/minor codes
    const major = evento.major || 0;
    const minor = evento.minor || 0;
    
    // Códigos comunes de Hikvision (pueden variar según configuración)
    if (major === 5) {
        if (minor === 75) return 'checkIn';    // Entrada normal
        if (minor === 76) return 'checkOut';   // Salida normal
        if (minor === 77) return 'breakOut';   // Salida a almuerzo
        if (minor === 78) return 'breakIn';    // Entrada de almuerzo
    }
    
    // Por defecto, intentar deducir del cardReaderNo u otros campos
    if (evento.cardReaderNo === '1') return 'checkIn';
    if (evento.cardReaderNo === '2') return 'checkOut';
    
    return 'unknown';
}

async function procesarEventos(eventosPorDispositivo) {
    try {
        // 1. Combinar todos los eventos
        const todosLosEventos = [];
        Object.entries(eventosPorDispositivo).forEach(([deviceIp, eventos]) => {
            if (eventos && Array.isArray(eventos)) {
                eventos.forEach(evento => {
                    todosLosEventos.push({
                        ...evento,
                        dispositivo: deviceIp,
                        // Asegurar que tenemos los campos necesarios
                        employeeNoString: evento.employeeNoString || evento.cardNo || null,
                        attendanceStatus: evento.attendanceStatus || null,
                        name: evento.name || null,
                        time: evento.time || null,
                        pictureURL: evento.pictureURL || null
                    });
                });
            }
        });

        if (todosLosEventos.length === 0) {
            logger.warn('⚠️ No se encontraron eventos para procesar');
            return {
                saved: 0,
                errors: 0,
                message: 'No se encontraron eventos para procesar'
            };
        }

        logger.info(`📊 Procesando ${todosLosEventos.length} eventos...`);

        // 2. Obtener información de usuarios únicos (SIN FILTRO DE ESTADO)
        const documentosUnicos = [...new Set(todosLosEventos
            .map(evento => evento.employeeNoString)
            .filter(Boolean))];

        logger.info(`👥 Consultando información de ${documentosUnicos.length} usuarios únicos...`);
        
        let usuariosInfo = {};
        try {
            if (documentosUnicos.length > 0) {
                const placeholders = documentosUnicos.map((_, i) => `$${i + 1}`).join(',');
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
                const result = await pool.query(query, documentosUnicos);
                
                result.rows.forEach(row => {
                    usuariosInfo[row.documento] = {
                        nombre: row.nombre,
                        departamento: row.departamento || 'General',
                        tipo_usuario: row.tipo_usuario,
                        estado: row.estado,
                        genero: row.genero
                    };
                });
                logger.success(`✅ Obtenida información de ${Object.keys(usuariosInfo).length} usuarios`);
            }
        } catch (error) {
            logger.error(`❌ Error obteniendo usuarios: ${error.message}`);
        }

        // 3. Procesar y estructurar eventos por día
        const eventosPorDia = {};

        todosLosEventos.forEach(event => {
            try {
                const documento = event.employeeNoString;
                const eventTime = event.time;
                
                if (!documento || !eventTime) {
                    return;
                }

                const fecha = eventTime.split('T')[0];
                const hora = eventTime.split('T')[1]?.split('-')[0]?.substring(0, 8);

                if (!fecha || !hora) {
                    logger.debug(`Evento con fecha/hora inválida: ${documento} - ${eventTime}`);
                    return;
                }

                // Determinar tipo de evento (usar función mejorada)
                const tipoEvento = determinarTipoEvento(event);
                
                if (tipoEvento === 'unknown') {
                    logger.debug(`Evento con tipo desconocido: ${documento} - ${event.attendanceStatus} - major:${event.major}, minor:${event.minor}`);
                    return;
                }

                if (!eventosPorDia[fecha]) {
                    eventosPorDia[fecha] = {};
                }

                const key = `${documento}_${fecha}`;

                if (!eventosPorDia[fecha][key]) {
                    const infoUsuario = usuariosInfo[documento] || {};
                    eventosPorDia[fecha][key] = {
                        documento: documento,
                        nombre: event.name || infoUsuario.nombre || 'Sin nombre',
                        fecha: fecha,
                        departamento: infoUsuario.departamento || 'General',
                        imagen: null,
                        dispositivo_ip: event.dispositivo,
                        checkIns: [],
                        checkOuts: [],
                        breakOuts: [],
                        breakIns: []
                    };
                }

                // Agregar evento según el tipo
                switch (tipoEvento) {
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
                if (event.pictureURL && !eventosPorDia[fecha][key].imagen) {
                    eventosPorDia[fecha][key].imagen = event.pictureURL;
                }

            } catch (error) {
                logger.debug(`Error procesando evento individual: ${error.message}`);
            }
        });

        // 4. Guardar en base de datos
        let totalSaved = 0;
        let totalErrors = 0;
        const diasProcesados = Object.keys(eventosPorDia).length;

        logger.info(`📅 Procesando ${diasProcesados} días de eventos...`);

        // DEBUG: Mostrar información específica de los usuarios problemáticos
        if (process.env.DEBUG_MODE === 'true') {
            const usuariosProblema = ['1001414927', '1007306404', '1007306599'];
            usuariosProblema.forEach(doc => {
                if (eventosPorDia['2026-01-02'] && eventosPorDia['2026-01-02'][`${doc}_2026-01-02`]) {
                    const evento = eventosPorDia['2026-01-02'][`${doc}_2026-01-02`];
                    logger.debug(`🔍 DEBUG ${doc} - 2026-01-02:`, {
                        nombre: evento.nombre,
                        checkIns: evento.checkIns,
                        checkOuts: evento.checkOuts,
                        breakOuts: evento.breakOuts,
                        breakIns: evento.breakIns
                    });
                }
            });
        }

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

                    // Determinar valores finales (más flexible)
                    const valores = {
                        hora_entrada: evento.checkIns.length > 0 ? evento.checkIns[0] : null,
                        hora_salida: evento.checkOuts.length > 0 ? evento.checkOuts[evento.checkOuts.length - 1] : null,
                        hora_salida_almuerzo: evento.breakOuts.length > 0 ? evento.breakOuts[0] : null,
                        hora_entrada_almuerzo: evento.breakIns.length > 0 ? evento.breakIns[evento.breakIns.length - 1] : null
                    };

                    // DEBUG: Log específico para usuarios problemáticos
                    if (['1001414927', '1007306404', '1007306599'].includes(evento.documento) && fechaStr === '2026-01-02') {
                        logger.info(`🔍 PROCESANDO ${evento.documento} - ${fechaStr}:`, {
                            nombre: evento.nombre,
                            valores: valores,
                            checkIns: evento.checkIns,
                            checkOuts: evento.checkOuts
                        });
                    }

                    // Guardar incluso si solo tiene un dato (ej: solo hora de salida)
                    const tieneAlMenosUnDato = Object.values(valores).some(v => v !== null);
                    
                    if (!tieneAlMenosUnDato) {
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

                    // Log exitoso para usuarios problemáticos
                    if (['1001414927', '1007306404', '1007306599'].includes(evento.documento) && fechaStr === '2026-01-02') {
                        logger.success(`✅ GUARDADO ${evento.documento} (${evento.nombre}) - ${fechaStr}:`, {
                            entrada: valores.hora_entrada || 'NO',
                            salida: valores.hora_salida || 'NO',
                            salida_almuerzo: valores.hora_salida_almuerzo || 'NO',
                            entrada_almuerzo: valores.hora_entrada_almuerzo || 'NO'
                        });
                    }

                } catch (error) {
                    errorsPorDia++;
                    totalErrors++;
                    
                    // Log detallado del error
                    if (['1001414927', '1007306404', '1007306599'].includes(evento.documento) && fechaStr === '2026-01-02') {
                        logger.error(`❌ ERROR guardando ${evento.documento} - ${fechaStr}: ${error.message}`);
                        logger.error(`Query params:`, [
                            evento.documento,
                            evento.nombre?.substring(0, 20),
                            fechaStr,
                            valores.hora_entrada,
                            valores.hora_salida,
                            valores.hora_salida_almuerzo,
                            valores.hora_entrada_almuerzo,
                            evento.dispositivo_ip,
                            evento.departamento,
                            evento.imagen?.substring(0, 50)
                        ]);
                    }
                }
            }

            if (savedPorDia > 0 || errorsPorDia > 0) {
                logger.info(`📅 ${fechaStr}: ${savedPorDia} ✅, ${errorsPorDia} ❌`);
            }
        }

        logger.success(`🎉 PROCESO COMPLETADO: ${totalSaved} registros guardados, ${totalErrors} errores`);

        return {
            saved: totalSaved,
            errors: totalErrors,
            diasProcesados: diasProcesados,
            eventosTotales: todosLosEventos.length,
            message: `Procesados ${diasProcesados} días con ${totalSaved} registros`
        };

    } catch (error) {
        logger.error(`❌ ERROR CRÍTICO en procesarEventos: ${error.message}`);
        logger.error(`Stack: ${error.stack}`);
        return {
            saved: 0,
            errors: 1,
            message: `Error crítico: ${error.message}`
        };
    }
}

// ==================== FUNCIÓN PRINCIPAL MEJORADA ====================

async function sincronizarTodosEventos() {
    const startTime = Date.now();

    try {
        logger.info(`🚀 INICIANDO SINCRONIZACIÓN COMPLETA`);
        logger.info(`📱 Dispositivos configurados: ${CONFIG.devices.join(', ')}`);

        // Rango EXACTO como en el ejemplo de Postman
        const ahora = new Date();
        const inicioDate = new Date('2026-01-02T00:00:00'); // ESPECÍFICO para el problema (2 de enero 2026)

        // Asegurar horas exactas
        inicioDate.setHours(0, 0, 0, 0);
        ahora.setHours(23, 59, 59, 999);

        const inicioBusqueda = formatHikvisionDate(inicioDate);
        const finBusqueda = formatHikvisionDate(ahora);

        logger.info(`🔍 Rango de búsqueda ESPECÍFICO:`);
        logger.info(`   Inicio: ${inicioBusqueda} (2 de enero 2026)`);
        logger.info(`   Fin: ${finBusqueda} (ahora)`);

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
                    batches: data.batchesProcessed,
                    stats: data.stats
                };

                logger.success(`${deviceIp}: ${data.totalEventos} eventos obtenidos`);
                
                // Mostrar estadísticas detalladas
                if (data.stats) {
                    logger.info(`${deviceIp}: Estadísticas: checkIn=${data.stats.checkIn}, checkOut=${data.stats.checkOut}`);
                }
            } else {
                eventosPorDispositivo[deviceIp] = [];
                estadisticasDispositivos[deviceIp] = {
                    eventos: 0,
                    batches: 0,
                    error: resultado.reason?.message
                };
                logger.error(`${deviceIp}: ❌ Error: ${resultado.reason?.message}`);
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

        logger.success(`✅ SINCRONIZACIÓN COMPLETADA en ${elapsedSeconds} segundos`);

        return {
            success: true,
            timestamp: new Date().toISOString(),
            rango: {
                inicio: inicioBusqueda,
                fin: finBusqueda,
                descripcion: 'Desde 2 de enero 2026 hasta ahora'
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
        logger.error(`❌ ERROR CRÍTICO en sincronización: ${error.message}`);
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

// ==================== ENDPOINTS ====================

export async function POST(request) {
    try {
        logger.info(`📥 Solicitud de sincronización completa recibida`);
        
        // Habilitar debug mode si se solicita
        const body = await request.json().catch(() => ({}));
        if (body.debug === true) {
            process.env.DEBUG_MODE = 'true';
            logger.info('🔧 DEBUG MODE ACTIVADO');
        }

        const resultado = await sincronizarTodosEventos();

        return NextResponse.json({
            ...resultado,
            endpoint: '/api/eventos/actualizar-eventos',
            descripcion: 'Sincronización completa de eventos Hikvision'
        });

    } catch (error) {
        logger.error(`Error en endpoint POST: ${error.message}`);
        return NextResponse.json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}

export async function GET(request) {
    try {
        logger.info(`📥 Solicitud GET de sincronización recibida`);
        
        // Verificar parámetro de debug
        const url = new URL(request.url);
        if (url.searchParams.get('debug') === 'true') {
            process.env.DEBUG_MODE = 'true';
            logger.info('🔧 DEBUG MODE ACTIVADO vía GET');
        }

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