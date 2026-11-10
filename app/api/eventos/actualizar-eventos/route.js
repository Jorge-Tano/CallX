// app/api/eventos/actualizar-eventos/route.js
import { NextResponse } from 'next/server';
import { query } from '@/lib/db/usuarios/database';

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

// Escribir eventos aquí quedó desactivado: Call-X (Laravel) es ahora la única
// fuente que sincroniza eventos Hikvision, hacia SQL Server. Este endpoint
// solo lee. Se deja la función para no romper el contrato de la API (devuelve
// un error claro en vez de escribir datos duplicados o desactualizados).
async function actualizarEventosEspecificos() {
    return {
        success: false,
        error: 'Deshabilitado: la sincronización de eventos ahora la hace Call-X (Laravel). Este endpoint es solo de lectura.',
        timestamp: new Date().toISOString()
    };
}

// Función para obtener análisis detallado
async function obtenerAnalisisEventos(filtros = {}) {
    try {
        const { fechaInicio, fechaFin, campaña, ejecutivo } = filtros;

        let queryText = `
            SELECT
                documento,
                nombre,
                fecha,
                CONVERT(VARCHAR(8), hora_entrada, 108) AS hora_entrada,
                CONVERT(VARCHAR(8), hora_salida, 108) AS hora_salida,
                CONVERT(VARCHAR(8), hora_salida_almuerzo, 108) AS hora_salida_almuerzo,
                CONVERT(VARCHAR(8), hora_entrada_almuerzo, 108) AS hora_entrada_almuerzo,
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
            queryText += ` AND fecha >= $${paramIndex}`;
            params.push(fechaInicio);
            paramIndex++;
        }

        if (fechaFin) {
            queryText += ` AND fecha <= $${paramIndex}`;
            params.push(fechaFin);
            paramIndex++;
        }

        if (campaña && campaña !== 'Todos' && campaña !== 'todos') {
            queryText += ` AND campaña = $${paramIndex}`;
            params.push(campaña);
            paramIndex++;
        }

        if (ejecutivo) {
            queryText += ` AND nombre LIKE $${paramIndex}`;
            params.push(`%${ejecutivo}%`);
            paramIndex++;
        }

        queryText += `
            GROUP BY documento, nombre, fecha, campaña,
                     hora_entrada, hora_salida,
                     hora_salida_almuerzo, hora_entrada_almuerzo
            ORDER BY fecha DESC, documento;
        `;

        const result = await query(queryText, params);
        const registros = result.rows;

        // Obtener lista única de campañas disponibles
        const campañasQuery = `
            SELECT DISTINCT campaña
            FROM attendance_events
            WHERE campaña IS NOT NULL AND campaña != ''
            ORDER BY campaña
        `;
        const campañasResult = await query(campañasQuery);
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
                // Deshabilitado — ver actualizarEventosEspecificos()
                return NextResponse.json(await actualizarEventosEspecificos(), { status: 410 });

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
                        ROUND(AVG(CASE WHEN hora_entrada IS NOT NULL THEN 1.0 ELSE 0.0 END) * 100, 2) as porcentaje_entrada,
                        ROUND(AVG(CASE WHEN hora_salida IS NOT NULL THEN 1.0 ELSE 0.0 END) * 100, 2) as porcentaje_salida
                    FROM attendance_events
                    WHERE campaña IS NOT NULL AND campaña != ''
                    GROUP BY campaña
                    ORDER BY total_registros DESC;
                `;

                const result = await query(statsQuery);

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
                        ROUND(AVG(CASE WHEN hora_entrada IS NOT NULL THEN 1.0 ELSE 0.0 END) * 100, 2) as porcentaje_con_entrada,
                        ROUND(AVG(CASE WHEN hora_salida IS NOT NULL THEN 1.0 ELSE 0.0 END) * 100, 2) as porcentaje_con_salida
                    FROM attendance_events;
                `;

                const result = await query(statsQuery);

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

                const campañasResult = await query(campañasQuery);

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
            error: error.message
        }, { status: 500 });
    }
}

export async function PUT(request) {
    logger.info(`📥 Solicitud PUT recibida en /api/eventos/actualizar-eventos (deshabilitada)`);
    return NextResponse.json(await actualizarEventosEspecificos(), { status: 410 });
}

// Configuración de runtime
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 1 minuto máximo
