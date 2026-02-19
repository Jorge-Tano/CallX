// app/api/eventos/actualizar-eventos/route.js
import { NextResponse } from 'next/server';
import { Pool } from 'pg';

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

// Logger simplificado
const logger = {
    info: (msg, ...args) => console.log(`[${new Date().toLocaleTimeString('es-CO')}] ℹ️ ${msg}`, ...args),
    success: (msg, ...args) => console.log(`[${new Date().toLocaleTimeString('es-CO')}] ✅ ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[${new Date().toLocaleTimeString('es-CO')}] ❌ ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[${new Date().toLocaleTimeString('es-CO')}] ⚠️ ${msg}`, ...args)
};

// Función para calcular estadísticas de eventos
function calcularEstadisticasEventos(eventos) {
    const porCampaña = {};
    const ejecutivos = new Set();
    let totalCompletos = 0;
    let totalIncompletos = 0;
    let totalParciales = 0;

    eventos.forEach(evento => {
        // Usar el valor real de campaña de la base de datos
        const campaña = evento.campaña || 'Sin campaña';
        if (!porCampaña[campaña]) {
            porCampaña[campaña] = {
                total: 0,
                completos: 0,
                incompletos: 0,
                parciales: 0,
                checkIn: 0,
                checkOut: 0
            };
        }
        porCampaña[campaña].total++;

        // Calcular estado del registro
        const tieneEntrada = evento.hora_entrada !== null;
        const tieneSalida = evento.hora_salida !== null;
        const tieneAlmuerzoCompleto = evento.hora_salida_almuerzo !== null && evento.hora_entrada_almuerzo !== null;

        if (tieneEntrada && tieneSalida && (tieneAlmuerzoCompleto || (!evento.hora_salida_almuerzo && !evento.hora_entrada_almuerzo))) {
            porCampaña[campaña].completos++;
            totalCompletos++;
        } else if (tieneEntrada && tieneSalida) {
            porCampaña[campaña].parciales++;
            totalParciales++;
        } else {
            porCampaña[campaña].incompletos++;
            totalIncompletos++;
        }

        if (tieneEntrada) porCampaña[campaña].checkIn++;
        if (tieneSalida) porCampaña[campaña].checkOut++;

        if (evento.nombre) {
            ejecutivos.add(evento.nombre);
        }
    });

    return {
        porCampaña,
        ejecutivos: Array.from(ejecutivos),
        totals: {
            completos: totalCompletos,
            incompletos: totalIncompletos,
            parciales: totalParciales,
            total: eventos.length
        }
    };
}

// Función para formatear eventos para la respuesta
function formatearEventosParaRespuesta(registros) {
    return registros.map(registro => {
        const tieneEntrada = registro.hora_entrada !== null;
        const tieneSalida = registro.hora_salida !== null;
        const tieneSalidaAlmuerzo = registro.hora_salida_almuerzo !== null;
        const tieneEntradaAlmuerzo = registro.hora_entrada_almuerzo !== null;

        let estado = 'Incompleto';
        let estadoColor = 'bg-red-100 text-red-800';
        let estadoIcono = '❌';
        let estadoDescripcion = 'Registro incompleto';
        let tieneProblemas = true;
        let necesitaRevision = true;
        let tieneAlmuerzoCompleto = false;
        let faltas = [];
        let duracionAlmuerzo = '';

        if (tieneSalidaAlmuerzo && tieneEntradaAlmuerzo) {
            tieneAlmuerzoCompleto = true;
            const [horaSalida, minutoSalida] = registro.hora_salida_almuerzo.split(':').map(Number);
            const [horaEntrada, minutoEntrada] = registro.hora_entrada_almuerzo.split(':').map(Number);
            const minutosTotal = (horaEntrada * 60 + minutoEntrada) - (horaSalida * 60 + minutoSalida);
            const horas = Math.floor(minutosTotal / 60);
            const minutos = minutosTotal % 60;
            duracionAlmuerzo = `${horas}h ${minutos}m`;
        }

        if (!tieneEntrada) faltas.push('Entrada');
        if (!tieneSalida) faltas.push('Salida');
        if (tieneSalidaAlmuerzo && !tieneEntradaAlmuerzo) faltas.push('Regreso de almuerzo');
        if (!tieneSalidaAlmuerzo && tieneEntradaAlmuerzo) faltas.push('Salida a almuerzo');

        if (tieneEntrada && tieneSalida) {
            if (tieneAlmuerzoCompleto || (!tieneSalidaAlmuerzo && !tieneEntradaAlmuerzo)) {
                estado = 'Completo';
                estadoColor = 'bg-green-100 text-green-800';
                estadoIcono = '✅';
                estadoDescripcion = 'Registro completo';
                tieneProblemas = false;
                necesitaRevision = false;
            } else if (faltas.length > 0) {
                estado = 'Parcial';
                estadoColor = 'bg-yellow-100 text-yellow-800';
                estadoIcono = '⚠️';
                estadoDescripcion = faltas.join(', ');
                tieneProblemas = true;
                necesitaRevision = true;
            }
        } else if (tieneEntrada && !tieneSalida) {
            estado = 'Pendiente de salida';
            estadoColor = 'bg-blue-100 text-blue-800';
            estadoIcono = '⏳';
            estadoDescripcion = 'Esperando salida';
            tieneProblemas = true;
            necesitaRevision = true;
        }

        // Usar el valor real de campaña de la base de datos
        const campaña = registro.campaña || 'Sin campaña';

        return {
            id: registro.id,
            empleadoId: registro.documento || '',
            nombre: registro.nombre || 'Sin nombre',
            fecha: registro.fecha ? new Date(registro.fecha).toISOString().split('T')[0] : '',
            horaEntrada: registro.hora_entrada || '',
            horaSalida: registro.hora_salida || '',
            horaSalidaAlmuerzo: registro.hora_salida_almuerzo || '',
            horaEntradaAlmuerzo: registro.hora_entrada_almuerzo || '',
            duracionAlmuerzo: duracionAlmuerzo,
            campaña: campaña, // Usar el valor real de la base de datos
            tipo: 'Biométrico',
            subtipo: 'Asistencia',
            estado: estado,
            estadoColor: estadoColor,
            estadoIcono: estadoIcono,
            estadoDescripcion: estadoDescripcion,
            faltas: faltas,
            tieneProblemas: tieneProblemas,
            necesitaRevision: necesitaRevision,
            tieneAlmuerzoCompleto: tieneAlmuerzoCompleto,
            dispositivo: registro.dispositivo_ip || 'Desconocido',
            imagen: registro.imagen || null,
        };
    });
}

// Función para actualizar eventos específicos
async function actualizarEventosEspecificos(datos) {
    const startTime = Date.now();
    
    try {
        logger.info(`🔄 Iniciando actualización de eventos`);
        
        let resultados = {
            actualizados: 0,
            creados: 0,
            errores: 0,
            detalles: []
        };

        // Si se proporcionan datos específicos para actualizar
        if (datos && Array.isArray(datos)) {
            for (const evento of datos) {
                try {
                    // Validar datos mínimos requeridos
                    if (!evento.documento || !evento.fecha) {
                        resultados.errores++;
                        resultados.detalles.push({
                            documento: evento.documento,
                            fecha: evento.fecha,
                            error: 'Faltan datos requeridos (documento o fecha)'
                        });
                        continue;
                    }

                    const query = `
                        INSERT INTO attendance_events (
                            documento, nombre, fecha, 
                            hora_entrada, hora_salida, 
                            hora_salida_almuerzo, hora_entrada_almuerzo,
                            dispositivo_ip, campaña, "imagen"
                        ) VALUES ($1, $2, $3, $4::time, $5::time, $6::time, $7::time, $8, $9, $10)
                        ON CONFLICT (documento, fecha)
                        DO UPDATE SET
                            hora_entrada = COALESCE(EXCLUDED.hora_entrada::time, attendance_events.hora_entrada),
                            hora_salida = COALESCE(EXCLUDED.hora_salida::time, attendance_events.hora_salida),
                            hora_salida_almuerzo = COALESCE(EXCLUDED.hora_salida_almuerzo::time, attendance_events.hora_salida_almuerzo),
                            hora_entrada_almuerzo = COALESCE(EXCLUDED.hora_entrada_almuerzo::time, attendance_events.hora_entrada_almuerzo),
                            nombre = COALESCE(EXCLUDED.nombre, attendance_events.nombre),
                            dispositivo_ip = EXCLUDED.dispositivo_ip,
                            campaña = COALESCE(EXCLUDED.campaña, attendance_events.campaña),
                            "imagen" = COALESCE(EXCLUDED."imagen", attendance_events."imagen")
                        RETURNING id;
                    `;

                    const result = await pool.query(query, [
                        evento.documento,
                        evento.nombre || 'Sin nombre',
                        evento.fecha,
                        evento.hora_entrada || null,
                        evento.hora_salida || null,
                        evento.hora_salida_almuerzo || null,
                        evento.hora_entrada_almuerzo || null,
                        evento.dispositivo_ip || 'Sistema',
                        evento.campaña || null, // Usar el valor proporcionado o null
                        evento.imagen || null
                    ]);

                    if (result.rows[0]) {
                        const rowCount = result.rowCount;
                        if (rowCount > 0) {
                            resultados.actualizados++;
                            resultados.detalles.push({
                                documento: evento.documento,
                                fecha: evento.fecha,
                                accion: 'actualizado',
                                id: result.rows[0].id
                            });
                        }
                    }

                } catch (error) {
                    resultados.errores++;
                    resultados.detalles.push({
                        documento: evento.documento,
                        fecha: evento.fecha,
                        error: error.message
                    });
                    logger.error(`Error actualizando evento ${evento.documento} - ${evento.fecha}: ${error.message}`);
                }
            }
        } else {
            // Si no hay datos específicos, solo devolver estadísticas actuales
            logger.info('ℹ️ No se proporcionaron datos para actualizar, devolviendo estadísticas');
            
            const query = `
                SELECT 
                    COUNT(*) as total_registros,
                    COUNT(DISTINCT documento) as personas_unicas,
                    COUNT(DISTINCT fecha) as dias_registrados,
                    COUNT(DISTINCT campaña) as campañas_unicas,
                    MIN(fecha) as primer_registro,
                    MAX(fecha) as ultimo_registro
                FROM attendance_events;
            `;

            const result = await pool.query(query);
            resultados.estadisticas = result.rows[0];
        }

        const elapsed = Date.now() - startTime;
        
        return {
            success: true,
            timestamp: new Date().toISOString(),
            resultados: resultados,
            tiempo: {
                segundos: (elapsed / 1000).toFixed(2),
                milisegundos: elapsed
            }
        };

    } catch (error) {
        logger.error(`Error en actualización de eventos: ${error.message}`);
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

// Función para obtener análisis detallado
async function obtenerAnalisisEventos(filtros = {}) {
    try {
        const { fechaInicio, fechaFin, campaña, ejecutivo } = filtros;
        
        let query = `
            SELECT 
                documento, 
                nombre, 
                fecha,
                hora_entrada, 
                hora_salida, 
                hora_salida_almuerzo, 
                hora_entrada_almuerzo,
                campaña,
                COUNT(*) as total,
                SUM(CASE WHEN hora_entrada IS NOT NULL THEN 1 ELSE 0 END) as con_entrada,
                SUM(CASE WHEN hora_salida IS NOT NULL THEN 1 ELSE 0 END) as con_salida,
                SUM(CASE WHEN hora_salida_almuerzo IS NOT NULL THEN 1 ELSE 0 END) as con_salida_almuerzo,
                SUM(CASE WHEN hora_entrada_almuerzo IS NOT NULL THEN 1 ELSE 0 END) as con_entrada_almuerzo
            FROM attendance_events 
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (fechaInicio) {
            query += ` AND fecha >= $${paramIndex}`;
            params.push(fechaInicio);
            paramIndex++;
        }

        if (fechaFin) {
            query += ` AND fecha <= $${paramIndex}`;
            params.push(fechaFin);
            paramIndex++;
        }

        if (campaña && campaña !== 'Todos' && campaña !== 'todos') {
            query += ` AND campaña ILIKE $${paramIndex}`;
            params.push(`%${campaña}%`);
            paramIndex++;
        }

        if (ejecutivo) {
            query += ` AND nombre ILIKE $${paramIndex}`;
            params.push(`%${ejecutivo}%`);
            paramIndex++;
        }

        query += `
            GROUP BY documento, nombre, fecha, campaña,
                     hora_entrada, hora_salida, 
                     hora_salida_almuerzo, hora_entrada_almuerzo
            ORDER BY fecha DESC, documento;
        `;

        const result = await pool.query(query, params);
        const registros = result.rows;

        // Obtener lista única de campañas disponibles
        const campañasQuery = `
            SELECT DISTINCT campaña 
            FROM attendance_events 
            WHERE campaña IS NOT NULL AND campaña != ''
            ORDER BY campaña
        `;
        const campañasResult = await pool.query(campañasQuery);
        const campañasDisponibles = campañasResult.rows.map(row => row.campaña);

        // Calcular estadísticas
        const eventosFormateados = formatearEventosParaRespuesta(registros);
        const estadisticas = calcularEstadisticasEventos(eventosFormateados);

        return {
            success: true,
            totalRegistros: registros.length,
            registros: registros,
            eventosFormateados: eventosFormateados,
            estadisticas: estadisticas,
            campañasDisponibles: campañasDisponibles,
            analisis: {
                totalPersonas: new Set(registros.map(r => r.documento)).size,
                conEntrada: registros.filter(r => r.hora_entrada).length,
                conSalida: registros.filter(r => r.hora_salida).length,
                completos: eventosFormateados.filter(e => e.estado === 'Completo').length,
                parciales: eventosFormateados.filter(e => e.estado === 'Parcial').length,
                incompletos: eventosFormateados.filter(e => e.estado === 'Incompleto').length,
                campañasUnicas: [...new Set(registros.map(r => r.campaña).filter(Boolean))]
            }
        };

    } catch (error) {
        logger.error(`Error obteniendo análisis: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

// ==================== ENDPOINTS ====================

export async function POST(request) {
    try {
        logger.info(`📥 Solicitud POST recibida en /api/eventos/actualizar-eventos`);
        
        const body = await request.json().catch(() => ({}));
        
        // Determinar el tipo de operación
        const operacion = body.operacion || 'actualizar';
        
        switch (operacion) {
            case 'actualizar':
                // Actualizar eventos específicos
                return NextResponse.json(await actualizarEventosEspecificos(body.datos));
                
            case 'analizar':
                // Obtener análisis de eventos
                return NextResponse.json(await obtenerAnalisisEventos(body.filtros));
                
            case 'estadisticas':
                // Obtener estadísticas generales
                const statsQuery = `
                    SELECT 
                        campaña,
                        COUNT(*) as total_registros,
                        COUNT(DISTINCT documento) as empleados_unicos,
                        MIN(fecha) as primera_fecha,
                        MAX(fecha) as ultima_fecha,
                        ROUND(AVG(CASE WHEN hora_entrada IS NOT NULL THEN 1 ELSE 0 END) * 100, 2) as porcentaje_entrada,
                        ROUND(AVG(CASE WHEN hora_salida IS NOT NULL THEN 1 ELSE 0 END) * 100, 2) as porcentaje_salida
                    FROM attendance_events 
                    WHERE campaña IS NOT NULL AND campaña != ''
                    GROUP BY campaña
                    ORDER BY total_registros DESC;
                `;
                
                const result = await pool.query(statsQuery);
                
                return NextResponse.json({
                    success: true,
                    estadisticas: result.rows,
                    totalCampañas: result.rowCount,
                    timestamp: new Date().toISOString()
                });
                
            default:
                return NextResponse.json({
                    success: false,
                    error: 'Operación no válida',
                    operacionesDisponibles: ['actualizar', 'analizar', 'estadisticas']
                }, { status: 400 });
        }

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
        logger.info(`📥 Solicitud GET recibida en /api/eventos/actualizar-eventos`);
        
        const url = new URL(request.url);
        const operacion = url.searchParams.get('operacion') || 'analizar';
        
        // Preparar filtros desde query parameters
        const filtros = {
            fechaInicio: url.searchParams.get('fechaInicio'),
            fechaFin: url.searchParams.get('fechaFin'),
            campaña: url.searchParams.get('campaña'),
            ejecutivo: url.searchParams.get('ejecutivo')
        };
        
        switch (operacion) {
            case 'analizar':
                return NextResponse.json(await obtenerAnalisisEventos(filtros));
                
            case 'estadisticas':
                // Obtener estadísticas generales
                const statsQuery = `
                    SELECT 
                        COUNT(*) as total_registros,
                        COUNT(DISTINCT documento) as personas_unicas,
                        COUNT(DISTINCT fecha) as dias_registrados,
                        COUNT(DISTINCT campaña) as campañas_unicas,
                        MIN(fecha) as primer_registro,
                        MAX(fecha) as ultimo_registro,
                        ROUND(AVG(CASE WHEN hora_entrada IS NOT NULL THEN 1 ELSE 0 END) * 100, 2) as porcentaje_con_entrada,
                        ROUND(AVG(CASE WHEN hora_salida IS NOT NULL THEN 1 ELSE 0 END) * 100, 2) as porcentaje_con_salida
                    FROM attendance_events;
                `;
                
                const result = await pool.query(statsQuery);
                
                return NextResponse.json({
                    success: true,
                    estadisticas: result.rows[0],
                    timestamp: new Date().toISOString()
                });
                
            case 'campañas':
                // Obtener lista de campañas disponibles
                const campañasQuery = `
                    SELECT DISTINCT campaña, COUNT(*) as total_registros
                    FROM attendance_events 
                    WHERE campaña IS NOT NULL AND campaña != ''
                    GROUP BY campaña
                    ORDER BY campaña;
                `;
                
                const campañasResult = await pool.query(campañasQuery);
                
                return NextResponse.json({
                    success: true,
                    campañas: campañasResult.rows,
                    total: campañasResult.rowCount,
                    timestamp: new Date().toISOString()
                });
                
            default:
                return NextResponse.json({
                    success: false,
                    error: 'Operación no válida',
                    operacionesDisponibles: ['analizar', 'estadisticas', 'campañas']
                }, { status: 400 });
        }

    } catch (error) {
        logger.error(`Error en endpoint GET: ${error.message}`);
        return NextResponse.json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}

export async function PUT(request) {
    try {
        logger.info(`📥 Solicitud PUT recibida en /api/eventos/actualizar-eventos`);
        
        const body = await request.json();
        
        if (!body.datos || !Array.isArray(body.datos)) {
            return NextResponse.json({
                success: false,
                error: 'Se requiere un array "datos" con los eventos a actualizar',
                timestamp: new Date().toISOString()
            }, { status: 400 });
        }
        
        return NextResponse.json(await actualizarEventosEspecificos(body.datos));

    } catch (error) {
        logger.error(`Error en endpoint PUT: ${error.message}`);
        return NextResponse.json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}

// Configuración de runtime
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 1 minuto máximo