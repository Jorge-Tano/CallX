// import { NextResponse } from 'next/server';
// import { Client } from 'pg';
// import { getServerSession } from 'next-auth/next';
// import { authOptions } from '@/lib/auth';

// const DB_CONFIG = {
//   host: process.env.DB_HOST,
//   port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
//   database: process.env.DB_NAME,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD
// };

// const CAMPAIGNS_MAP: Record<string, string> = {
//   'campana_5757': 'Campana 5757',
//   'campana_sav': 'Campana SAV',
//   'campana_refi': 'Campana REFI',
//   'campana_pl': 'Campana PL',
//   'campana_parlo': 'Campana PARLO',
//   'ti': 'TI',
//   'teams_leaders': 'Teams Leaders',
//   'administrativo': 'Administrativo'
// };

// function normalizeCampaignCode(code: string | null | undefined): string | null {
//   if (!code) return null;
//   return code
//     .toLowerCase()
//     .normalize('NFD')
//     .replace(/[\u0300-\u036f]/g, '');
// }

// function getCampaignName(campanaCode: string | null | undefined): string {
//   if (!campanaCode) return 'Sin grupo';
//   const normalized = normalizeCampaignCode(campanaCode);
//   if (!normalized) return 'Sin grupo';

//   const key = Object.keys(CAMPAIGNS_MAP).find(k =>
//     normalizeCampaignCode(k) === normalized
//   );
//   return key ? CAMPAIGNS_MAP[key] : campanaCode;
// }

// function getCampaignVariantsForDB(campaign: string | undefined): string[] {
//   if (!campaign) return [];
//   const normalized = normalizeCampaignCode(campaign);
//   if (!normalized) return [];

//   const variants = Object.keys(CAMPAIGNS_MAP).filter(key =>
//     normalizeCampaignCode(key) === normalized
//   );

//   const visualName = getCampaignName(campaign);
//   if (visualName && !variants.includes(visualName)) {
//     variants.push(visualName);
//   }
//   return variants;
// }

// function normalizarCampana(campana: string | null): string | null {
//   if (!campana) return null;
//   return campana
//     .toLowerCase()
//     .normalize('NFD')
//     .replace(/[\u0300-\u036f]/g, '')
//     .replace(/\s+/g, '_')
//     .replace(/[^a-z0-9_]/g, '');
// }

// function esCampanaVentas(campana: string | null): boolean {
//   if (!campana) return false;
//   const normalizada = normalizarCampana(campana);
//   if (!normalizada) return false;

//   const ventasVariants = [
//     'campaña_ventas',
//     'campana_ventas',
//     'campaña_ventas_casa',
//     'campana_ventas_casa',
//     'ventas',
//     'sales',
//     'ventas_consolidado'
//   ];
//   return ventasVariants.includes(normalizada);
// }

// function obtenerDepartamentosTeamLeader(campana: string | null): string[] {
//   if (!campana) return [];
//   if (esCampanaVentas(campana)) {
//     return ['Campana SAV', 'Campana REFI', 'Campana PL'];
//   }
//   const normalizada = normalizarCampana(campana);
//   if (!normalizada) return [];

//   const campaignMap: Record<string, string> = {
//     'campaña_5757': 'Campana 5757',
//     'campana_5757': 'Campana 5757',
//     'campaña_parlo': 'Campana PARLO',
//     'campana_parlo': 'Campana PARLO',
//     'ti': 'TI',
//     'administrativo': 'Administrativo',
//     'teams_leaders': 'Teams Leaders'
//   };
//   const department = campaignMap[normalizada] || campana;
//   return [department];
// }

// const determinarEstado = (subtipo: string, fecha: string) => {
//   const hoy = new Date().toISOString().split('T')[0];
//   const esHoy = new Date(fecha).toISOString().split('T')[0] === hoy;

//   const estados: Record<string, any> = {
//     'Jornada completa': {
//       estado: 'COMPLETO',
//       color: '#28a745',
//       icono: '✅',
//       prioridad: 1
//     },
//     'Sin almuerzo registrado': {
//       estado: esHoy ? 'PENDIENTE' : 'INCOMPLETO',
//       color: esHoy ? '#ffc107' : '#dc3545',
//       icono: esHoy ? '⏳' : '⚠️',
//       prioridad: 2
//     },
//     'Solo entrada': {
//       estado: esHoy ? 'PENDIENTE' : 'INCOMPLETO',
//       color: esHoy ? '#ffc107' : '#dc3545',
//       icono: esHoy ? '⏳' : '⚠️',
//       prioridad: 3
//     },
//     'Solo salida': {
//       estado: esHoy ? 'PENDIENTE' : 'INCOMPLETO',
//       color: esHoy ? '#ffc107' : '#dc3545',
//       icono: esHoy ? '⏳' : '⚠️',
//       prioridad: 3
//     },
//     'Falta salida final': {
//       estado: esHoy ? 'PENDIENTE' : 'INCOMPLETO',
//       color: esHoy ? '#ffc107' : '#dc3545',
//       icono: esHoy ? '⏳' : '⚠️',
//       prioridad: 2
//     },
//     'Falta entrada inicial': {
//       estado: esHoy ? 'PENDIENTE' : 'INCOMPLETO',
//       color: esHoy ? '#ffc107' : '#dc3545',
//       icono: esHoy ? '⏳' : '⚠️',
//       prioridad: 3
//     },
//     'Solo almuerzo': {
//       estado: 'INCOMPLETO',
//       color: '#dc3545',
//       icono: '⚠️',
//       prioridad: 4
//     },
//     'Solo salida almuerzo': {
//       estado: 'INCOMPLETO',
//       color: '#dc3545',
//       icono: '⚠️',
//       prioridad: 5
//     },
//     'Solo entrada almuerzo': {
//       estado: 'INCOMPLETO',
//       color: '#dc3545',
//       icono: '⚠️',
//       prioridad: 5
//     },
//     'ERROR - Misma hora': {
//       estado: 'ERROR',
//       color: '#dc3545',
//       icono: '❌',
//       prioridad: 0
//     },
//     'Sin registros': {
//       estado: 'SIN REGISTRO',
//       color: '#6c757d',
//       icono: '📭',
//       prioridad: 6
//     }
//   };
//   return estados[subtipo] || {
//     estado: 'DESCONOCIDO',
//     color: '#6c757d',
//     icono: '❓',
//     prioridad: 7
//   };
// };

// const formatearHora = (hora: any): string => {
//   if (!hora) return '--:--';
//   if (typeof hora === 'string') {
//     return hora.substring(0, 8);
//   }
//   return hora;
// };

// const calcularDuracionAlmuerzo = (horaSalida: string | null, horaEntrada: string | null): string | null => {
//   if (!horaSalida || !horaEntrada) return null;
//   try {
//     const [h1, m1] = horaSalida.split(':').map(Number);
//     const [h2, m2] = horaEntrada.split(':').map(Number);
//     const minutosTotal1 = h1 * 60 + (m1 || 0);
//     const minutosTotal2 = h2 * 60 + (m2 || 0);
//     const diferencia = Math.abs(minutosTotal2 - minutosTotal1);

//     const horas = Math.floor(diferencia / 60);
//     const minutos = diferencia % 60;
//     return `${horas > 0 ? `${horas}h ` : ''}${minutos}m`;
//   } catch (error) {
//     return null;
//   }
// };

// const determinarFaltas = (evento: any): string[] => {
//   const faltas: string[] = [];
//   if (!evento.horaEntrada) faltas.push('Entrada');
//   if (!evento.horaSalida) faltas.push('Salida');
//   if (!evento.horaSalidaAlmuerzo) faltas.push('Salida Almuerzo');
//   if (!evento.horaEntradaAlmuerzo) faltas.push('Entrada Almuerzo');
//   return faltas;
// };

// export async function GET(request: Request) {
//   let client: Client | null = null;

//   try {
//     const session = await getServerSession(authOptions);
//     if (!session || !session.user) {
//       return NextResponse.json(
//         { success: false, error: 'No autorizado' },
//         { status: 401 }
//       );
//     }

//     const user = session.user as any;
//     const userRole = user.role;
//     const userCampaign = user.campaign || user.campana;

//     const { searchParams } = new URL(request.url);
//     const rango = searchParams.get('rango') || 'hoy';
//     const fechaInicio = searchParams.get('fechaInicio');
//     const fechaFin = searchParams.get('fechaFin');
//     const departamento = searchParams.get('departamento');
//     const ejecutivo = searchParams.get('ejecutivo');

//     console.log('🔍 Parámetros de búsqueda:', {
//       rango,
//       fechaInicio,
//       fechaFin,
//       departamento,
//       ejecutivo
//     });

//     // Conectar a la base de datos
//     client = new Client(DB_CONFIG);
//     await client.connect();

//     // Obtener fecha actual en Colombia (formato YYYY-MM-DD)
//     const fechaDBResult = await client.query(
//       `SELECT 
//         CURRENT_DATE as hoy_real,
//         TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') as hoy_formateado,
//         NOW() as ahora_completo`
//     );

//     const hoyReal = fechaDBResult.rows[0].hoy_formateado;
//     const hoyTimestamp = fechaDBResult.rows[0].hoy_real;

//     console.log('📅 Fecha obtenida de PostgreSQL:', {
//       hoy_formateado: hoyReal,
//       hoy_timestamp: hoyTimestamp
//     });

//     let inicio: string, fin: string;

//     if (rango === 'personalizado' && fechaInicio && fechaFin) {
//       inicio = fechaInicio;
//       fin = fechaFin;
//     } else {
//       const hoyDate = new Date(hoyReal);

//       switch (rango) {
//         case 'hoy':
//           inicio = fin = hoyReal;
//           break;
//         case '7dias':
//           const hace7Dias = new Date(hoyDate);
//           hace7Dias.setDate(hoyDate.getDate() - 6);
//           inicio = hace7Dias.toISOString().split('T')[0];
//           fin = hoyReal;
//           break;
//         case '30dias':
//           const hace30Dias = new Date(hoyDate);
//           hace30Dias.setDate(hoyDate.getDate() - 29);
//           inicio = hace30Dias.toISOString().split('T')[0];
//           fin = hoyReal;
//           break;
//         default:
//           inicio = fin = hoyReal;
//       }
//     }

//     console.log('📅 Fechas para consulta:', {
//       inicio,
//       fin,
//       rango
//     });

//     // VERIFICAR SI HAY DATOS EN LA TABLA
//     const verificarTabla = await client.query(
//       `SELECT 
//         COUNT(*) as total_registros,
//         MIN(fecha) as fecha_minima,
//         MAX(fecha) as fecha_maxima
//       FROM eventos_procesados`
//     );

//     console.log('📊 Verificación de tabla eventos_procesados:', {
//       total_registros: verificarTabla.rows[0].total_registros,
//       fecha_minima: verificarTabla.rows[0].fecha_minima,
//       fecha_maxima: verificarTabla.rows[0].fecha_maxima
//     });

//     let userCampaignNormalized = getCampaignName(userCampaign);
//     let filteredByUserCampaign = false;
//     let appliedFilterDescription = null;
//     let esTeamLeaderVentas = esCampanaVentas(userCampaign);

//     // IMPORTANTE: Como 'fecha' es timestamp with time zone, necesitamos usar DATE() para extraer solo la fecha
//     let query = `
//       SELECT 
//         ep.documento as "empleadoId",
//         COALESCE(uh.nombre, ep.nombre) as "nombre",
//         DATE(ep.fecha) as "fecha",  -- Extraer solo la fecha del timestamp
//         ep.hora_entrada as "horaEntrada",
//         ep.hora_salida as "horaSalida",
//         ep.hora_salida_almuerzo as "horaSalidaAlmuerzo",
//         ep.hora_entrada_almuerzo as "horaEntradaAlmuerzo",
//         ep.tipo_evento as "tipo",
//         ep.subtipo_evento as "subtipo",
//         ep.dispositivo_ip as "dispositivo",
//         COALESCE(uh.departamento, ep.campaña, 'Sin grupo') as "campañaRaw"
//       FROM eventos_procesados ep
//       LEFT JOIN usuarios_hikvision uh ON ep.documento = uh.employee_no
//       WHERE DATE(ep.fecha) >= $1::date AND DATE(ep.fecha) <= $2::date  -- Convertir a date para comparar
//     `;

//     const queryParams: any[] = [inicio, fin];
//     let paramCounter = 3;

//     // Aplicar filtro por departamento
//     if (departamento && departamento !== 'Todos' && departamento !== 'todos') {
//       query += ` AND (uh.departamento ILIKE $${paramCounter} OR ep.campaña ILIKE $${paramCounter})`;
//       queryParams.push(`%${departamento}%`);
//       paramCounter++;
//       console.log(`🏢 Aplicando filtro departamento: ${departamento}`);
//     }

//     // Aplicar filtro por ejecutivo
//     if (ejecutivo && ejecutivo.trim() !== '') {
//       query += ` AND COALESCE(uh.nombre, ep.nombre) ILIKE $${paramCounter}`;
//       queryParams.push(`%${ejecutivo}%`);
//       paramCounter++;
//       console.log(`👤 Aplicando filtro ejecutivo: ${ejecutivo}`);
//     }

//     // Si es Team Leader o Agente, aplicar restricciones
//     if (userRole === 'Team Leader' || userRole === 'Agente' || userRole === 'Supervisor') {
//       if (esTeamLeaderVentas) {
//         userCampaignNormalized = 'Ventas Consolidado';
//         appliedFilterDescription = 'Ventas (SAV, REFI, PL)';

//         const ventasDepartments = obtenerDepartamentosTeamLeader(userCampaign);
//         if (ventasDepartments.length > 0) {
//           const conditions: string[] = [];
//           ventasDepartments.forEach((dept, idx) => {
//             const paramIndex = paramCounter;
//             queryParams.push(`%${dept}%`);
//             conditions.push(`uh.departamento ILIKE $${paramIndex}`);
//             paramCounter++;
//           });
//           if (conditions.length > 0) {
//             query += ` AND (${conditions.join(' OR ')})`;
//           }
//         }
//       } else if (userCampaignNormalized && !departamento) {
//         const campaignVariants = getCampaignVariantsForDB(userCampaign);
//         if (campaignVariants.length > 0) {
//           const conditions: string[] = [];
//           campaignVariants.forEach((variant) => {
//             const paramIndex = paramCounter;
//             queryParams.push(`%${variant}%`);
//             conditions.push(`(ep.campaña ILIKE $${paramIndex} OR uh.departamento ILIKE $${paramIndex})`);
//             paramCounter++;
//           });
//           if (conditions.length > 0) {
//             query += ` AND (${conditions.join(' OR ')})`;
//           }
//         }
//       }
//       filteredByUserCampaign = true;
//     }

//     query += ` ORDER BY ep.fecha DESC, ep.hora_entrada DESC`;

//     console.log('📊 Consulta SQL:', query.substring(0, 200) + '...');
//     console.log('📋 Parámetros:', queryParams);

//     const result = await client.query(query, queryParams);
//     console.log(`✅ Eventos obtenidos: ${result.rows.length}`);

//     // Mostrar algunos registros para debug
//     if (result.rows.length > 0) {
//       console.log('📋 Primeros registros encontrados:');
//       result.rows.slice(0, 3).forEach((row, i) => {
//         console.log(`  ${i + 1}. ${row.nombre} - ${row.fecha} - ${row.horaEntrada || 'Sin hora'}`);
//       });
//     }

//     // Extraer lista de ejecutivos únicos
//     const ejecutivosUnicos = Array.from(
//       new Set(result.rows.map(row => row.nombre).filter(Boolean))
//     ).sort() as string[];

//     const eventosFormateados = result.rows.map(evento => {
//       const estadoInfo = determinarEstado(evento.subtipo, evento.fecha);
//       const faltas = determinarFaltas(evento);
//       const duracionAlmuerzo = calcularDuracionAlmuerzo(evento.horaSalidaAlmuerzo, evento.horaEntradaAlmuerzo);
//       const campañaNormalizada = getCampaignName(evento.campañaRaw) || evento.campañaRaw;

//       return {
//         empleadoId: evento.empleadoId || '',
//         nombre: evento.nombre || 'Sin nombre',
//         fecha: evento.fecha,
//         horaEntrada: formatearHora(evento.horaEntrada),
//         horaSalida: formatearHora(evento.horaSalida),
//         horaSalidaAlmuerzo: formatearHora(evento.horaSalidaAlmuerzo),
//         horaEntradaAlmuerzo: formatearHora(evento.horaEntradaAlmuerzo),
//         duracionAlmuerzo: duracionAlmuerzo,
//         tipo: evento.tipo || 'Asistencia',
//         subtipo: evento.subtipo || 'Sin clasificar',
//         estado: estadoInfo.estado,
//         estadoColor: estadoInfo.color,
//         estadoIcono: estadoInfo.icono,
//         estadoDescripcion: evento.subtipo,
//         faltas: faltas,
//         tieneProblemas: estadoInfo.estado !== 'COMPLETO',
//         necesitaRevision: estadoInfo.estado === 'ERROR' || estadoInfo.estado === 'INCOMPLETO',
//         tieneAlmuerzoCompleto: !!evento.horaSalidaAlmuerzo && !!evento.horaEntradaAlmuerzo,
//         dispositivo: evento.dispositivo || 'Desconocido',
//         campaña: campañaNormalizada,
//         campañaOriginal: evento.campañaRaw
//       };
//     });

//     // Calcular estadísticas
//     const porCampaña = eventosFormateados.reduce((acc, evento) => {
//       const camp = evento.campaña;
//       if (!acc[camp]) {
//         acc[camp] = { total: 0, usuarios: new Set() };
//       }
//       acc[camp].total++;
//       acc[camp].usuarios.add(evento.nombre);
//       return acc;
//     }, {} as Record<string, any>);

//     Object.keys(porCampaña).forEach(campana => {
//       porCampaña[campana] = {
//         total: porCampaña[campana].total,
//         usuariosUnicos: Array.from(porCampaña[campana].usuarios).length
//       };
//     });

//     const responseData: any = {
//       success: true,
//       eventos: eventosFormateados,
//       total: eventosFormateados.length,
//       estadisticas: {
//         porCampaña: porCampaña,
//         ejecutivos: ejecutivosUnicos
//       },
//       rango: {
//         tipo: rango,
//         inicio,
//         fin
//       },
//       metadata: {
//         userRole: userRole,
//         userCampaign: userCampaign,
//         userCampaignNormalized: userCampaignNormalized,
//         appliedFilter: appliedFilterDescription,
//         esTeamLeaderVentas,
//         filteredByUserCampaign: filteredByUserCampaign
//       }
//     };

//     return NextResponse.json(responseData, {
//       headers: {
//         'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30'
//       }
//     });

//   } catch (error: any) {
//     console.error('❌ Error en API eventos/bd:', error);
//     return NextResponse.json({
//       success: false,
//       error: process.env.NODE_ENV === 'production'
//         ? 'Error interno del servidor'
//         : error.message,
//       eventos: [],
//       total: 0,
//       estadisticas: {
//         porCampaña: {},
//         ejecutivos: []
//       }
//     }, {
//       status: 500,
//       headers: {
//         'Cache-Control': 'no-store'
//       }
//     });
//   } finally {
//     if (client) {
//       try {
//         await client.end();
//       } catch (error: any) {
//         console.error('Error cerrando conexión:', error);
//       }
//     }
//   }
// }

// export const dynamic = 'force-dynamic';