// import { NextResponse } from 'next/server';
// import { query } from '@/lib/db';

// export async function GET(request) {
//   const { searchParams } = new URL(request.url);
//   const rango = searchParams.get('rango') || 'hoy';
//   const fechaInicio = searchParams.get('fechaInicio');
//   const fechaFin = searchParams.get('fechaFin');
//   const departamento = searchParams.get('departamento');
//   const ejecutivo = searchParams.get('ejecutivo');
//   const startTime = Date.now();

//   try {
//     // Obtener fecha actual en formato YYYY-MM-DD
//     const fechaDBResult = await query(`
//       SELECT 
//         CURRENT_DATE as hoy_real,
//         TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') as hoy_formateado
//     `);

//     const hoyReal = fechaDBResult.rows[0].hoy_formateado; // "2025-12-28"

//     let fechaInicioStr, fechaFinStr;

//     if (rango === 'personalizado' && fechaInicio && fechaFin) {
//       fechaInicioStr = fechaInicio;
//       fechaFinStr = fechaFin;
//     } else {
//       const hoy = new Date(hoyReal);

//       switch (rango) {
//         case 'hoy':
//           fechaInicioStr = fechaFinStr = hoyReal;
//           break;
//         case '7dias':
//           const hace7Dias = new Date(hoy);
//           hace7Dias.setDate(hoy.getDate() - 6);
//           fechaInicioStr = hace7Dias.toISOString().split('T')[0];
//           fechaFinStr = hoyReal;
//           break;
//         case '30dias':
//           const hace30Dias = new Date(hoy);
//           hace30Dias.setDate(hoy.getDate() - 29);
//           fechaInicioStr = hace30Dias.toISOString().split('T')[0];
//           fechaFinStr = hoyReal;
//           break;
//         default:
//           fechaInicioStr = fechaFinStr = hoyReal;
//       }
//     }

//     console.log(`📅 Consultando eventos del ${fechaInicioStr} al ${fechaFinStr} (rango: ${rango})`);

//     if (departamento) {
//       console.log(`🔍 Filtro departamento: ${departamento}`);
//     }
//     if (ejecutivo) {
//       console.log(`🔍 Filtro ejecutivo: ${ejecutivo}`);
//     }

//     // Construir la consulta SQL base
//     let queryText = `
//       SELECT 
//         eb.id,
//         eb.user_id,
//         eb.fecha,
//         eb.hora_entrada,
//         eb.hora_salida,
//         eb.hora_salida_almuerzo,
//         eb.hora_entrada_almuerzo,
//         eb.duracion_almuerzo,
//         eb.tipo,
//         eb.subtipo,
//         eb.estado,
//         eb.estado_color,
//         eb.estado_icono,
//         eb.estado_descripcion,
//         eb.faltas,
//         eb.tiene_problemas,
//         eb.necesita_revision,
//         eb.tiene_almuerzo_completo,
//         eb.dispositivo,
//         u.nombre,
//         u.campaña,
//         u.foto,
//         u.empleado_id
//       FROM eventos_biometricos eb
//       LEFT JOIN usuarios u ON eb.user_id = u.user_id
//       WHERE eb.fecha BETWEEN $1 AND $2
//     `;

//     const params = [fechaInicioStr, fechaFinStr];
//     let paramIndex = 3;

//     // Aplicar filtro por departamento
//     if (departamento && departamento !== 'Todos' && departamento !== 'todos') {
//       queryText += ` AND u.campaña = $${paramIndex}`;
//       params.push(departamento);
//       paramIndex++;
//     }

//     // Aplicar filtro por ejecutivo
//     if (ejecutivo) {
//       queryText += ` AND (LOWER(u.nombre) LIKE LOWER($${paramIndex}) OR u.nombre LIKE $${paramIndex + 1})`;
//       const searchTerm = `%${ejecutivo}%`;
//       params.push(searchTerm, searchTerm);
//       paramIndex += 2;
//     }

//     // Ordenar resultados
//     queryText += ` ORDER BY eb.fecha DESC, eb.hora_entrada DESC`;

//     // Ejecutar consulta
//     const result = await query(queryText, params);
//     const rows = result.rows;
//     console.log(`✅ Eventos obtenidos: ${rows.length}`);

//     // Si no hay eventos, verificar si hay datos en la tabla
//     if (rows.length === 0) {
//       const checkQuery = await query(
//         'SELECT COUNT(*) as total FROM eventos_biometricos WHERE fecha = $1',
//         [fechaInicioStr]
//       );
//       console.log(`ℹ️ Verificación: ${checkQuery.rows[0].total} eventos en BD para ${fechaInicioStr}`);
//     }

//     // Procesar resultados
//     const eventos = rows.map(row => ({
//       empleadoId: row.empleado_id || row.user_id,
//       nombre: row.nombre || 'Sin nombre',
//       fecha: row.fecha,
//       horaEntrada: row.hora_entrada || '--:--',
//       horaSalida: row.hora_salida || '--:--',
//       horaSalidaAlmuerzo: row.hora_salida_almuerzo || '--:--',
//       horaEntradaAlmuerzo: row.hora_entrada_almuerzo || '--:--',
//       duracionAlmuerzo: row.duracion_almuerzo,
//       campaña: row.campaña || 'No asignado',
//       tipo: row.tipo || 'Acceso',
//       subtipo: row.subtipo || 'Registro',
//       estado: row.estado || 'Normal',
//       estadoColor: row.estado_color || 'green',
//       estadoIcono: row.estado_icono || 'check-circle',
//       estadoDescripcion: row.estado_descripcion || 'Registro normal',
//       faltas: row.faltas ? JSON.parse(row.faltas) : [],
//       tieneProblemas: Boolean(row.tiene_problemas),
//       necesitaRevision: Boolean(row.necesita_revision),
//       tieneAlmuerzoCompleto: Boolean(row.tiene_almuerzo_completo),
//       dispositivo: row.dispositivo,
//       foto: row.foto,
//       id: row.id
//     }));

//     // Calcular estadísticas por campaña
//     const estadisticasPorCampana = {};
//     rows.forEach(row => {
//       const campana = row.campaña || 'No asignado';
//       if (!estadisticasPorCampana[campana]) {
//         estadisticasPorCampana[campana] = {
//           total: 0,
//           usuarios: new Set()
//         };
//       }
//       estadisticasPorCampana[campana].total++;
//       estadisticasPorCampana[campana].usuarios.add(row.nombre);
//     });

//     // Convertir Sets a arrays
//     Object.keys(estadisticasPorCampana).forEach(campana => {
//       estadisticasPorCampana[campana] = {
//         total: estadisticasPorCampana[campana].total,
//         usuariosUnicos: Array.from(estadisticasPorCampana[campana].usuarios).length
//       };
//     });

//     // Obtener lista de ejecutivos únicos
//     const ejecutivosUnicos = Array.from(
//       new Set(rows.map(row => row.nombre).filter(Boolean))
//     ).sort();

//     const endTime = Date.now();
//     const duration = ((endTime - startTime) / 1000).toFixed(2);

//     return NextResponse.json({
//       success: true,
//       eventos,
//       estadisticas: {
//         porCampaña: estadisticasPorCampana,
//         ejecutivos: ejecutivosUnicos,
//         total: eventos.length,
//         tiempoSegundos: parseFloat(duration)
//       },
//       metadata: {
//         fechaInicio: fechaInicioStr,
//         fechaFin: fechaFinStr,
//         departamentoFiltro: departamento,
//         ejecutivoFiltro: ejecutivo,
//         timestamp: new Date().toISOString()
//       }
//     }, {
//       status: 200,
//       headers: {
//         'Content-Type': 'application/json',
//         'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60'
//       }
//     });

//   } catch (error) {
//     console.error('❌ Error en API eventos:', error);

//     return NextResponse.json({
//       success: false,
//       error: process.env.NODE_ENV === 'production'
//         ? 'Error interno del servidor'
//         : error.message,
//       timestamp: new Date().toISOString()
//     }, {
//       status: 500,
//       headers: {
//         'Content-Type': 'application/json',
//         'Cache-Control': 'no-store'
//       }
//     });
//   }
// }

// export const runtime = 'nodejs';
// export const dynamic = 'force-dynamic';