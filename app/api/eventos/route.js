// C:\Users\jorge.gomez\Documents\Proyectos\CallX\app\api\eventos\route.js

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

// Función para calcular estado del empleado
function calcularEstadoEmpleado(evento) {
    const tieneEntrada = evento.hora_entrada !== null;
    const tieneSalida = evento.hora_salida !== null;
    const tieneSalidaAlmuerzo = evento.hora_salida_almuerzo !== null;
    const tieneEntradaAlmuerzo = evento.hora_entrada_almuerzo !== null;

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
        const [horaSalida, minutoSalida] = evento.hora_salida_almuerzo.split(':').map(Number);
        const [horaEntrada, minutoEntrada] = evento.hora_entrada_almuerzo.split(':').map(Number);
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

    return {
        estado,
        estadoColor,
        estadoIcono,
        estadoDescripcion,
        tieneProblemas,
        necesitaRevision,
        tieneAlmuerzoCompleto,
        faltas,
        duracionAlmuerzo
    };
}

// Función para calcular estadísticas de eventos
function calcularEstadisticasEventos(eventos) {
    const porCampaña = {};
    const ejecutivos = new Set();

    eventos.forEach(evento => {
        const campaña = evento.campaña || 'Sin campaña';
        if (!porCampaña[campaña]) {
            porCampaña[campaña] = {
                total: 0,
                checkIn: 0,
                checkOut: 0
            };
        }
        porCampaña[campaña].total++;

        if (evento.nombre) {
            ejecutivos.add(evento.nombre);
        }
    });

    return {
        porCampaña,
        ejecutivos: Array.from(ejecutivos)
    };
}

// Función para formatear eventos desde la BD para la página
function formatearEventosParaFrontend(registros) {
    return registros.map(registro => {
        const estadoInfo = calcularEstadoEmpleado(registro);
        // Usar el valor real de campaña de la base de datos, sin hardcodear
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
            duracionAlmuerzo: estadoInfo.duracionAlmuerzo,
            campaña: campaña, // Usar el valor real de la base de datos
            tipo: 'Biométrico',
            subtipo: 'Asistencia',
            estado: estadoInfo.estado,
            estadoColor: estadoInfo.estadoColor,
            estadoIcono: estadoInfo.estadoIcono,
            estadoDescripcion: estadoInfo.estadoDescripcion,
            faltas: estadoInfo.faltas,
            tieneProblemas: estadoInfo.tieneProblemas,
            necesitaRevision: estadoInfo.necesitaRevision,
            tieneAlmuerzoCompleto: estadoInfo.tieneAlmuerzoCompleto,
            dispositivo: registro.dispositivo_ip || 'Desconocido',
            imagen: registro.imagen || null,
        };
    });
}

// Handler para peticiones de la página de eventos
async function handleEventosPageRequest(request) {
    try {
        const url = new URL(request.url);
        const rango = url.searchParams.get('rango') || 'hoy';
        const fechaInicio = url.searchParams.get('fechaInicio');
        const fechaFin = url.searchParams.get('fechaFin');
        const departamento = url.searchParams.get('departamento');
        const ejecutivo = url.searchParams.get('ejecutivo');
        const maxSearchDays = parseInt(process.env.MAX_SEARCH_DAYS || '90');
        const minSearchDate = process.env.MIN_SEARCH_DATE || null;

        let query = `
            SELECT id, documento, nombre, fecha, 
                   hora_entrada, hora_salida, 
                   hora_salida_almuerzo, hora_entrada_almuerzo,
                   dispositivo_ip, campaña, imagen
            FROM attendance_events 
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (rango === 'hoy') {
            query += ` AND fecha = CURRENT_DATE`;
        } else if (rango === '7dias') {
            query += ` AND fecha >= CURRENT_DATE - INTERVAL '6 days'`;
        } else if (rango === '30dias') {
            query += ` AND fecha >= CURRENT_DATE - INTERVAL '29 days'`;
        } else if (rango === 'personalizado' && fechaInicio && fechaFin) {
            // Validar rango de fechas
            const fechaInicioDate = new Date(fechaInicio);
            const fechaFinDate = new Date(fechaFin);
            
            if (isNaN(fechaInicioDate.getTime()) || isNaN(fechaFinDate.getTime())) {
                return NextResponse.json({
                    success: false,
                    error: 'Fechas inválidas',
                    eventos: [],
                    estadisticas: { porCampaña: {}, ejecutivos: [] }
                }, { status: 400 });
            }
            
            if (fechaInicioDate > fechaFinDate) {
                return NextResponse.json({
                    success: false,
                    error: 'La fecha de inicio no puede ser posterior a la fecha fin',
                    eventos: [],
                    estadisticas: { porCampaña: {}, ejecutivos: [] }
                }, { status: 400 });
            }
            
            // Validar máximo de días permitidos
            const diffTime = Math.abs(fechaFinDate - fechaInicioDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays > maxSearchDays) {
                return NextResponse.json({
                    success: false,
                    error: `El rango máximo permitido es ${maxSearchDays} días`,
                    eventos: [],
                    estadisticas: { porCampaña: {}, ejecutivos: [] }
                }, { status: 400 });
            }

            query += ` AND fecha BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
            params.push(fechaInicio, fechaFin);
            paramIndex += 2;
        }

        if (departamento) {
            // Filtrar por el valor real de campaña de la base de datos
            if (departamento === 'Todos' || departamento === 'todos') {
                // No aplicar filtro de departamento
            } else {
                query += ` AND campaña ILIKE $${paramIndex}`;
                params.push(`%${departamento}%`);
                paramIndex++;
            }
        }

        if (ejecutivo) {
            query += ` AND nombre ILIKE $${paramIndex}`;
            params.push(`%${ejecutivo}%`);
            paramIndex++;
        }

        query += ` ORDER BY fecha DESC, documento`;
        const result = await pool.query(query, params);
        const registros = result.rows;
        const eventosFormateados = formatearEventosParaFrontend(registros);
        const estadisticas = calcularEstadisticasEventos(eventosFormateados);

        // Obtener lista única de campañas disponibles para filtros
        const campañasQuery = `
            SELECT DISTINCT campaña 
            FROM attendance_events 
            WHERE campaña IS NOT NULL AND campaña != ''
            ORDER BY campaña
        `;
        const campañasResult = await pool.query(campañasQuery);
        const campañasDisponibles = campañasResult.rows.map(row => row.campaña);

        return NextResponse.json({
            success: true,
            eventos: eventosFormateados,
            estadisticas: estadisticas,
            total: registros.length,
            campañasDisponibles: campañasDisponibles,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error.message,
            eventos: [],
            estadisticas: { porCampaña: {}, ejecutivos: [] }
        }, { status: 500 });
    }
}

// Handler para debug
async function handleDebugRequest(request) {
    try {
        const url = new URL(request.url);
        const fecha = url.searchParams.get('fecha');
        
        const query = `
            SELECT 
                documento, 
                nombre, 
                fecha,
                hora_entrada, 
                hora_salida, 
                hora_salida_almuerzo, 
                hora_entrada_almuerzo,
                campaña,  -- Incluir campaña en el resultado
                COUNT(*) as total,
                SUM(CASE WHEN hora_entrada IS NOT NULL THEN 1 ELSE 0 END) as con_entrada,
                SUM(CASE WHEN hora_salida IS NOT NULL THEN 1 ELSE 0 END) as con_salida,
                SUM(CASE WHEN hora_salida_almuerzo IS NOT NULL THEN 1 ELSE 0 END) as con_salida_almuerzo,
                SUM(CASE WHEN hora_entrada_almuerzo IS NOT NULL THEN 1 ELSE 0 END) as con_entrada_almuerzo
            FROM attendance_events 
            WHERE fecha = $1
            GROUP BY documento, nombre, fecha, campaña,
                     hora_entrada, hora_salida, 
                     hora_salida_almuerzo, hora_entrada_almuerzo
            ORDER BY documento;
        `;
        
        const result = await pool.query(query, [fecha]);
        
        return NextResponse.json({
            success: true,
            fecha: fecha,
            totalRegistros: result.rows.length,
            registros: result.rows,
            analisis: {
                totalPersonas: new Set(result.rows.map(r => r.documento)).size,
                conEntrada: result.rows.filter(r => r.hora_entrada).length,
                conSalida: result.rows.filter(r => r.hora_salida).length,
                completos: result.rows.filter(r => r.hora_entrada && r.hora_salida).length,
                incompletos: result.rows.filter(r => !r.hora_entrada || !r.hora_salida).length,
                campañasUnicas: [...new Set(result.rows.map(r => r.campaña).filter(Boolean))]
            }
        });
        
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}

// Handler para estadísticas
async function handleStatsRequest(request) {
    try {
        const url = new URL(request.url);
        const action = url.searchParams.get('action') || 'stats';
        const limit = parseInt(url.searchParams.get('limit') || '10');

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
                        COUNT(CASE WHEN dispositivo_ip = 'multiple' THEN 1 END) as registros_multidispositivo,
                        COUNT(DISTINCT campaña) as campañas_unicas
                    FROM attendance_events
                    WHERE fecha >= CURRENT_DATE - INTERVAL '7 days';
                `;
                break;

            case 'today':
                query = `
                    SELECT 
                        documento, nombre,
                        hora_entrada, hora_salida,
                        hora_salida_almuerzo, hora_entrada_almuerzo,
                        dispositivo_ip,
                        campaña  -- Incluir campaña
                    FROM attendance_events 
                    WHERE fecha = CURRENT_DATE
                    ORDER BY documento;
                `;
                break;

            case 'recent':
                query = `
                    SELECT documento, nombre, fecha, 
                           hora_entrada, hora_salida, 
                           dispositivo_ip, campaña  -- Incluir campaña
                    FROM attendance_events 
                    ORDER BY fecha DESC, documento
                    LIMIT $1;
                `;
                params = [limit];
                break;

            case 'campañas':
                // Obtener estadísticas por campaña
                query = `
                    SELECT 
                        campaña,
                        COUNT(*) as total_registros,
                        COUNT(DISTINCT documento) as empleados_unicos,
                        MIN(fecha) as primera_fecha,
                        MAX(fecha) as ultima_fecha
                    FROM attendance_events 
                    WHERE campaña IS NOT NULL AND campaña != ''
                    GROUP BY campaña
                    ORDER BY total_registros DESC;
                `;
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
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}

// Endpoint GET principal
export async function GET(request) {
    try {
        const url = new URL(request.url);
        
        // Endpoint para la página principal de eventos
        if (url.searchParams.get('rango')) {
            return await handleEventosPageRequest(request);
        }
        
        // Endpoint para debug
        if (url.searchParams.get('debug') === 'true') {
            return await handleDebugRequest(request);
        }

        // Endpoint para estadísticas
        return await handleStatsRequest(request);

    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}

// POST - Mantenido para compatibilidad
export async function POST(request) {
    try {
        const body = await request.json();
        
        // Si necesitas algún procesamiento específico POST, lo puedes agregar aquí
        return NextResponse.json({
            success: true,
            message: "POST endpoint disponible",
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}

// PUT - Para estadísticas
export async function PUT(request) {
    return await handleStatsRequest(request);
}

export const dynamic = 'force-dynamic';