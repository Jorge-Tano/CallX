// C:\Users\jorge.gomez\Documents\Proyectos\CallX\app\api\debug-biometrico\route.js

import { NextResponse } from 'next/server';
import DigestFetch from 'digest-fetch';
import { Pool } from 'pg';

// Configuración
const CONFIG = {
    username: process.env.HIKUSER,
    password: process.env.HIKPASS,
    devices: [process.env.HIKVISION_IP1, process.env.HIKVISION_IP2].filter(Boolean),
    timeout: 30000,
    updateInterval: 5 * 60 * 1000 // 5 minutos en milisegundos
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

// Variables globales para el scheduler
let isRunning = false;
let lastRun = null;
let nextRun = null;

// Utilidades optimizadas
const formatHikvisionDate = (date) => date.toISOString().replace(/\.\d{3}Z$/, '');
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Logger optimizado para producción
const logger = {
    info: (msg, ...args) => console.log(`[${new Date().toLocaleTimeString('es-CO')}] ℹ️ ${msg}`, ...args),
    success: (msg, ...args) => console.log(`[${new Date().toLocaleTimeString('es-CO')}] ✅ ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[${new Date().toLocaleTimeString('es-CO')}] ❌ ${msg}`, ...args),
    debug: (msg, ...args) => {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[${new Date().toLocaleTimeString('es-CO')}] 🐛 ${msg}`, ...args);
        }
    },
    autoUpdate: () => {
        const now = new Date();
        const next = new Date(now.getTime() + CONFIG.updateInterval);
        console.log(`\n⏰ ========================================`);
        console.log(`⏰ ACTUALIZACIÓN AUTOMÁTICA BIOMÉTRICA`);
        console.log(`⏰ Última ejecución: ${lastRun ? lastRun.toLocaleTimeString('es-CO') : 'Nunca'}`);
        console.log(`⏰ Próxima ejecución: ${next.toLocaleTimeString('es-CO')}`);
        console.log(`⏰ ========================================\n`);
    }
};

// Cliente Hikvision optimizado
class HikvisionDebugClient {
    constructor(deviceIp) {
        this.deviceIp = deviceIp;
        this.baseUrl = `https://${deviceIp}/ISAPI/AccessControl/AcsEvent?format=json`;
        this.client = new DigestFetch(CONFIG.username, CONFIG.password, {
            disableRetry: true,
            algorithm: 'MD5'
        });
    }

    async fetchEventsRaw(startTime, endTime, position = 0) {
        const body = {
            AcsEventCond: {
                searchID: `prod_${this.deviceIp}_${Date.now()}`,
                searchResultPosition: position,
                maxResults: 100,
                major: 5,
                minor: 75,
                startTime,
                endTime
            }
        };

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

            if (!res.ok) {
                logger.error(`${this.deviceIp}: HTTP ${res.status}`);
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

// Función para obtener eventos de un dispositivo (optimizada)
async function getAllEventsFromDevice(deviceIp, startTime, endTime, maxBatches = 10) {
    const client = new HikvisionDebugClient(deviceIp);
    const todosLosEventos = [];

    logger.info(`${deviceIp}: Consultando eventos...`);

    let position = 0;
    let batchNumber = 1;

    while (batchNumber <= maxBatches) {
        const resultado = await client.fetchEventsRaw(startTime, endTime, position);

        if (resultado.error) {
            break;
        }

        if (!resultado.data?.AcsEvent?.InfoList || resultado.data.AcsEvent.InfoList.length === 0) {
            break;
        }

        const eventosBatch = resultado.data.AcsEvent.InfoList;
        todosLosEventos.push(...eventosBatch);

        const totalReportado = resultado.data.AcsEvent.totalMatches || 0;
        if (todosLosEventos.length >= totalReportado) {
            break;
        }

        position += eventosBatch.length;
        batchNumber++;

        await delay(200);
    }

    return {
        deviceIp,
        eventos: todosLosEventos,
        totalEventos: todosLosEventos.length,
        status: todosLosEventos.length > 0 ? 'success' : 'empty'
    };
}

// Función para obtener rango del día actual
function getTodayRange() {
    const ahora = new Date();
    const inicio = new Date(ahora);
    inicio.setHours(0, 0, 0, 0);
    
    const fin = new Date(ahora);
    fin.setHours(23, 59, 59, 999);
    
    return { inicio, fin };
}

// Función para obtener rango de fecha específica
function getDateRange(fechaStr) {
    const inicio = new Date(fechaStr + 'T00:00:00-05:00');
    const fin = new Date(fechaStr + 'T23:59:59-05:00');
    
    return { inicio, fin };
}

// Función principal para actualizar datos
async function updateBiometricData(fechaEspecifica = null) {
    if (isRunning) {
        logger.info("Actualización ya en progreso, omitiendo...");
        return { success: false, message: "Ya se está ejecutando" };
    }

    isRunning = true;
    const startTime = Date.now();

    try {
        logger.autoUpdate();
        
        // Determinar rango de tiempo
        let rango;
        if (fechaEspecifica) {
            rango = getDateRange(fechaEspecifica);
            logger.info(`Fecha específica: ${fechaEspecifica}`);
        } else {
            rango = getTodayRange();
            logger.info(`Día actual: ${rango.inicio.toLocaleDateString('es-CO')}`);
        }

        const startTimeFormatted = formatHikvisionDate(rango.inicio);
        const endTimeFormatted = formatHikvisionDate(rango.fin);

        // Consultar todos los dispositivos
        logger.info(`Consultando ${CONFIG.devices.length} dispositivos...`);
        
        const resultados = await Promise.allSettled(
            CONFIG.devices.map(deviceIp =>
                getAllEventsFromDevice(deviceIp, startTimeFormatted, endTimeFormatted, 15)
            )
        );

        // Procesar resultados
        const eventosPorDispositivo = {};
        let totalEventosRaw = 0;

        for (let i = 0; i < resultados.length; i++) {
            const resultado = resultados[i];
            const deviceIp = CONFIG.devices[i];

            if (resultado.status === 'fulfilled') {
                const data = resultado.value;
                eventosPorDispositivo[deviceIp] = data.eventos;
                totalEventosRaw += data.totalEventos;
                
                if (data.totalEventos > 0) {
                    logger.success(`${deviceIp}: ${data.totalEventos} eventos`);
                }
            } else {
                eventosPorDispositivo[deviceIp] = [];
                logger.error(`${deviceIp}: Error en consulta`);
            }
        }

        // Guardar en base de datos
        if (totalEventosRaw > 0) {
            const dbResult = await saveEventsToPostgreSQL(eventosPorDispositivo);
            logger.success(`BD: ${dbResult.saved} registros actualizados`);
            
            lastRun = new Date();
            nextRun = new Date(lastRun.getTime() + CONFIG.updateInterval);
            
            const elapsed = Date.now() - startTime;
            logger.success(`Actualización completada en ${elapsed}ms`);
            
            return {
                success: true,
                timestamp: new Date().toISOString(),
                eventosProcesados: totalEventosRaw,
                registrosActualizados: dbResult.saved,
                errores: dbResult.errors,
                tiempoMs: elapsed
            };
        } else {
            logger.info("No se encontraron eventos nuevos");
            return {
                success: true,
                message: "No hay eventos nuevos",
                eventosProcesados: 0
            };
        }

    } catch (error) {
        logger.error(`Error en actualización: ${error.message}`);
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    } finally {
        isRunning = false;
    }
}

// Función optimizada para guardar en PostgreSQL (logs reducidos)
async function saveEventsToPostgreSQL(eventsByDevice) {
    // 1. Combinar todos los eventos
    const todosLosEventos = [];
    Object.entries(eventsByDevice).forEach(([deviceIp, eventos]) => {
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
        return { saved: 0, errors: 0 };
    }

    logger.info(`Procesando ${todosLosEventos.length} eventos...`);

    // 2. Procesar eventos básicos
    const eventosProcesados = [];
    
    for (const event of todosLosEventos) {
        try {
            const documento = event.employeeNoString || event.cardNo || null;
            const nombre = event.name || null;
            const eventTime = event.time;
            const attendanceStatus = event.attendanceStatus || null;
            const dispositivo = event.dispositivo;

            if (!documento || !eventTime || !attendanceStatus) continue;

            const fecha = eventTime.split('T')[0];
            const hora = eventTime.split('T')[1]?.split('-')[0]?.substring(0, 8);

            if (!fecha || !hora) continue;

            eventosProcesados.push({
                documento,
                nombre,
                fecha,
                hora,
                status: attendanceStatus,
                dispositivo
            });
        } catch (error) {
            // Silenciar errores individuales
        }
    }

    // 3. Agrupar por documento y fecha
    const gruposPorFecha = {};

    eventosProcesados.forEach(evento => {
        const key = `${evento.documento}_${evento.fecha}`;

        if (!gruposPorFecha[key]) {
            gruposPorFecha[key] = {
                documento: evento.documento,
                nombre: evento.nombre,
                fecha: evento.fecha,
                dispositivos_ip: new Set(),
                checkIns: [],
                checkOuts: [],
                breakOuts: [],
                breakIns: []
            };
        }

        gruposPorFecha[key].dispositivos_ip.add(evento.dispositivo);

        switch (evento.status) {
            case 'checkIn':
                gruposPorFecha[key].checkIns.push(evento.hora);
                break;
            case 'checkOut':
                gruposPorFecha[key].checkOuts.push(evento.hora);
                break;
            case 'breakOut':
                gruposPorFecha[key].breakOuts.push(evento.hora);
                break;
            case 'breakIn':
                gruposPorFecha[key].breakIns.push(evento.hora);
                break;
        }
    });

    // 4. Guardar en base de datos
    let saved = 0;
    let errors = 0;

    for (const grupo of Object.values(gruposPorFecha)) {
        try {
            // Ordenar horas
            grupo.checkIns.sort();
            grupo.checkOuts.sort();
            grupo.breakOuts.sort();
            grupo.breakIns.sort();

            // Determinar valores finales
            const valores = {
                hora_entrada: grupo.checkIns[0] || null,
                hora_salida: grupo.checkOuts[grupo.checkOuts.length - 1] || null,
                hora_salida_almuerzo: grupo.breakOuts[0] || null,
                hora_entrada_almuerzo: grupo.breakIns[grupo.breakIns.length - 1] || null
            };

            // Solo guardar si hay datos
            if (!valores.hora_entrada && !valores.hora_salida &&
                !valores.hora_salida_almuerzo && !valores.hora_entrada_almuerzo) {
                continue;
            }

            const fechaDate = new Date(grupo.fecha + 'T00:00:00-05:00');
            const dispositivoFinal = grupo.dispositivos_ip.size === 1 
                ? Array.from(grupo.dispositivos_ip)[0] 
                : 'multiple';

            const query = `
                INSERT INTO eventos_procesados (
                    documento, nombre, fecha, 
                    hora_entrada, hora_salida, 
                    hora_salida_almuerzo, hora_entrada_almuerzo,
                    dispositivo_ip
                ) VALUES ($1, $2, $3, $4::time, $5::time, $6::time, $7::time, $8)
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
                    END
                RETURNING id;
            `;

            await pool.query(query, [
                grupo.documento,
                grupo.nombre,
                fechaDate,
                valores.hora_entrada,
                valores.hora_salida,
                valores.hora_salida_almuerzo,
                valores.hora_entrada_almuerzo,
                dispositivoFinal
            ]);

            saved++;

        } catch (error) {
            errors++;
            logger.debug(`Error guardando ${grupo.documento}-${grupo.fecha}: ${error.message}`);
        }
    }

    return { saved, errors };
}

// Iniciar scheduler automático
if (typeof global.schedulerStarted === 'undefined') {
    global.schedulerStarted = true;
    
    // Esperar a que la app inicie
    setTimeout(() => {
        logger.autoUpdate();
        
        // Ejecutar inmediatamente
        updateBiometricData().catch(console.error);
        
        // Programar ejecuciones periódicas
        setInterval(() => {
            updateBiometricData().catch(console.error);
        }, CONFIG.updateInterval);
        
        logger.success(`Scheduler iniciado: Actualización cada ${CONFIG.updateInterval / 60000} minutos`);
    }, 10000); // Esperar 10 segundos al inicio
}

// ==================== ENDPOINTS ====================

// GET - Para consultas manuales y estado
export async function GET(request) {
    try {
        const url = new URL(request.url);
        const action = url.searchParams.get('action');
        const fecha = url.searchParams.get('fecha');
        const force = url.searchParams.get('force') === 'true';

        // Acción especial: forzar actualización
        if (action === 'force-update') {
            const result = await updateBiometricData(fecha);
            return NextResponse.json({
                success: result.success,
                message: force ? "Actualización forzada completada" : "Actualización programada completada",
                data: result,
                scheduler: {
                    isRunning,
                    lastRun: lastRun?.toISOString(),
                    nextRun: nextRun?.toISOString()
                }
            });
        }

        // Acción especial: estado del scheduler
        if (action === 'status') {
            return NextResponse.json({
                success: true,
                scheduler: {
                    isRunning,
                    lastRun: lastRun?.toISOString(),
                    nextRun: nextRun?.toISOString(),
                    updateInterval: CONFIG.updateInterval,
                    nextRunIn: nextRun ? Math.max(0, nextRun.getTime() - Date.now()) : null
                },
                config: {
                    devices: CONFIG.devices,
                    totalDevices: CONFIG.devices.length
                }
            });
        }

        // Consulta normal (compatibilidad con código anterior)
        const dispositivoEspecifico = url.searchParams.get('device');
        const saveToDB = url.searchParams.get('save') === 'true';
        const consultarTodos = url.searchParams.get('todos') === 'true' || !dispositivoEspecifico;

        let dispositivosAConsultar = [];

        if (dispositivoEspecifico) {
            dispositivosAConsultar = [dispositivoEspecifico];
            logger.info(`Consulta manual dispositivo: ${dispositivoEspecifico}`);
        } else if (consultarTodos) {
            dispositivosAConsultar = CONFIG.devices;
            logger.info(`Consulta manual todos los dispositivos`);
        } else {
            dispositivosAConsultar = [CONFIG.devices[0]];
        }

        // Usar fecha específica o día actual
        const rango = fecha ? getDateRange(fecha) : getTodayRange();
        const startTime = formatHikvisionDate(rango.inicio);
        const endTime = formatHikvisionDate(rango.fin);

        logger.info(`Consulta manual: ${startTime} a ${endTime}`);

        // Consultar dispositivos
        const resultados = await Promise.allSettled(
            dispositivosAConsultar.map(deviceIp =>
                getAllEventsFromDevice(deviceIp, startTime, endTime, 5)
            )
        );

        const eventosPorDispositivo = {};
        const estadisticas = {};

        for (let i = 0; i < resultados.length; i++) {
            const resultado = resultados[i];
            const deviceIp = dispositivosAConsultar[i];

            if (resultado.status === 'fulfilled') {
                const data = resultado.value;
                eventosPorDispositivo[deviceIp] = data.eventos;
                estadisticas[deviceIp] = {
                    eventos: data.totalEventos,
                    status: data.status
                };
            }
        }

        // Guardar si se solicita
        let dbResult = null;
        if (saveToDB) {
            const totalEventos = Object.values(eventosPorDispositivo)
                .reduce((sum, eventos) => sum + eventos.length, 0);
            
            if (totalEventos > 0) {
                dbResult = await saveEventsToPostgreSQL(eventosPorDispositivo);
                logger.info(`Guardados ${dbResult.saved} registros`);
            }
        }

        const totalEventos = Object.values(eventosPorDispositivo)
            .reduce((sum, eventos) => sum + eventos.length, 0);

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            rango: {
                inicio: rango.inicio.toISOString(),
                fin: rango.fin.toISOString()
            },
            resumen: {
                dispositivos: dispositivosAConsultar.length,
                eventosTotales: totalEventos,
                eventosPorDispositivo: estadisticas
            },
            database: dbResult,
            scheduler: {
                isRunning,
                lastRun: lastRun?.toISOString(),
                nextRun: nextRun?.toISOString()
            }
        });

    } catch (error) {
        logger.error(`Error GET: ${error.message}`);
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}

// POST - Para consultas personalizadas
export async function POST(request) {
    try {
        const body = await request.json();
        const { fecha, forceUpdate = false } = body;

        if (forceUpdate) {
            const result = await updateBiometricData(fecha);
            return NextResponse.json({
                success: result.success,
                message: "Actualización forzada vía POST",
                data: result
            });
        }

        // Por defecto, consultar día actual
        const result = await updateBiometricData(fecha);
        
        return NextResponse.json({
            success: result.success,
            message: "Consulta completada",
            data: result
        });

    } catch (error) {
        logger.error(`Error POST: ${error.message}`);
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}

// PUT - Para estadísticas y verificación
export async function PUT(request) {
    try {
        const url = new URL(request.url);
        const action = url.searchParams.get('action') || 'stats';
        const limit = parseInt(url.searchParams.get('limit') || '10');
        const documento = url.searchParams.get('documento');

        let query = '';
        let params = [];

        switch (action) {
            case 'stats':
                query = `
                    SELECT 
                        COUNT(*) as total_registros,
                        COUNT(DISTINCT documento) as personas_unicas,
                        MIN(fecha) as primer_registro,
                        MAX(fecha) as ultimo_registro,
                        COUNT(CASE WHEN dispositivo_ip = 'multiple' THEN 1 END) as registros_multidispositivo
                    FROM eventos_procesados
                    WHERE fecha >= CURRENT_DATE - INTERVAL '7 days';
                `;
                break;

            case 'today':
                query = `
                    SELECT 
                        documento, nombre,
                        hora_entrada, hora_salida,
                        hora_salida_almuerzo, hora_entrada_almuerzo,
                        dispositivo_ip
                    FROM eventos_procesados 
                    WHERE fecha = CURRENT_DATE
                    ORDER BY documento;
                `;
                break;

            case 'recent':
                query = `
                    SELECT documento, nombre, fecha, 
                           hora_entrada, hora_salida, dispositivo_ip
                    FROM eventos_procesados 
                    ORDER BY fecha DESC, documento
                    LIMIT $1;
                `;
                params = [limit];
                break;

            default:
                query = 'SELECT 1 as test;';
        }

        const result = await pool.query(query, params);

        return NextResponse.json({
            success: true,
            action: action,
            data: result.rows,
            count: result.rowCount
        });

    } catch (error) {
        logger.error(`Error PUT: ${error.message}`);
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';