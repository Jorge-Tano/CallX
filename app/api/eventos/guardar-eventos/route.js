// // C:\Users\jorge.gomez\Documents\Proyectos\CallX\app\api\eventos\guardar-eventos\route.js

// import { NextResponse } from 'next/server';
// import { Pool } from 'pg';
// import { obtenerEventosDeHikvision, obtenerEventosDeHikvisionRango } from '@/lib/db/eventos/database';

// // Configuración del pool de conexiones
// const pool = new Pool({
//   host: process.env.DB_HOST,
//   port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
//   database: process.env.DB_NAME,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   max: 5,
//   idleTimeoutMillis: 10000,
//   connectionTimeoutMillis: 5000,
// });

// // ================================================
// // FUNCIONES AUXILIARES
// // ================================================

// // Función para extraer fecha y hora del formato Colombia (2025-12-04T07:40:07-05:00)
// function extraerFechaHoraColombia(timeString) {
//   if (!timeString) return { fecha: null, hora: null };

//   try {
//     console.log(`🕐 Procesando timeString: ${timeString}`);

//     // El formato ya es Colombia: 2025-12-04T07:40:07-05:00
//     const [fecha, resto] = timeString.split('T');
//     if (!fecha || !resto) {
//       console.log(`❌ No se pudo dividir: ${timeString}`);
//       return { fecha: null, hora: null };
//     }

//     // Extraer solo la hora (HH:MM:SS) - puede terminar en -05:00 o Z
//     const horaPart = resto.split('-')[0].split('+')[0];
//     const hora = horaPart.substring(0, 8);

//     console.log(`✅ Extraído: fecha=${fecha}, hora=${hora}`);
//     return { fecha, hora };
//   } catch (error) {
//     console.error(`❌ Error extrayendo fecha/hora de ${timeString}:`, error.message);
//     return { fecha: null, hora: null };
//   }
// }

// // Función para obtener eventos de las últimas 24 horas
// async function obtenerEventos24Horas() {
//   try {
//     // Crear rango de 24 horas desde ahora (Colombia)
//     const ahora = new Date();
//     const hace24Horas = new Date(ahora.getTime() - (24 * 60 * 60 * 1000));

//     console.log('🕐 Rango de 24 horas para sincronización (Colombia):', {
//       ahora: ahora.toLocaleString('es-CO'),
//       hace_24h: hace24Horas.toLocaleString('es-CO')
//     });

//     // Usar la función que acepta rango personalizado
//     const eventos = await obtenerEventosDeHikvisionRango(hace24Horas, ahora);

//     console.log(`📊 Eventos crudos obtenidos de Hikvision: ${eventos.length}`);

//     // Mostrar algunos eventos crudos para debug
//     if (eventos.length > 0) {
//       console.log('📋 Primeros 3 eventos crudos:');
//       eventos.slice(0, 3).forEach((evento, i) => {
//         console.log(`  ${i + 1}. Time: ${evento.time}`);
//         console.log(`     Documento: ${evento.employeeNoString || evento.cardNo || 'N/A'}`);
//         console.log(`     Nombre: ${evento.name || 'Sin nombre'}`);
//         console.log(`     Tipo: ${evento.tipo || 'No definido'}`);
//       });
//     }

//     // Procesar eventos manteniendo hora Colombia
//     const eventosProcesados = [];

//     for (const evento of eventos) {
//       try {
//         if (evento.time) {
//           const { fecha, hora } = extraerFechaHoraColombia(evento.time);

//           if (fecha && hora) {
//             // Documento del empleado
//             let documento = 'N/A';
//             if (evento.employeeNoString && evento.employeeNoString.trim() !== '') {
//               documento = evento.employeeNoString.trim();
//             } else if (evento.cardNo && evento.cardNo.trim() !== '') {
//               documento = evento.cardNo.trim();
//             }

//             // Nombre del empleado
//             const nombre = evento.name ? evento.name.trim() : 'Sin nombre';

//             // Tipo de evento
//             let tipo = evento.tipo || 'Evento';
//             const label = evento.label || '';
//             const attendanceStatus = evento.attendanceStatus || '';

//             if (attendanceStatus === 'breakOut') tipo = 'Salida Almuerzo';
//             else if (attendanceStatus === 'breakIn') tipo = 'Entrada Almuerzo';
//             else if (label.toLowerCase().includes('almuerzo')) {
//               if (label.toLowerCase().includes('salida') || label.toLowerCase().includes('a almuerzo')) {
//                 tipo = 'Salida Almuerzo';
//               } else if (label.toLowerCase().includes('entrada') || label.toLowerCase().includes('de almuerzo')) {
//                 tipo = 'Entrada Almuerzo';
//               }
//             } else if (label.toLowerCase().includes('salida')) tipo = 'Salida';
//             else if (label.toLowerCase().includes('entrada')) tipo = 'Entrada';
//             else if (evento.minor === 75) tipo = evento.major === 5 ? 'Salida' : 'Entrada';

//             eventosProcesados.push({
//               ...evento,
//               documento: documento,
//               nombre: nombre,
//               fecha: fecha,      // Fecha en Colombia (ej: 2025-12-04)
//               hora_simple: hora, // Hora en Colombia (ej: 07:40:07)
//               time_original: evento.time,
//               tipo: tipo,
//               attendanceStatus: attendanceStatus,
//               label: label
//             });
//           } else {
//             console.log(`⚠️ Evento sin fecha/hora válida: ${evento.time}`);
//           }
//         } else {
//           console.log(`⚠️ Evento sin propiedad 'time':`, evento);
//         }
//       } catch (error) {
//         console.error('❌ Error procesando evento individual:', error.message);
//         console.error('Evento que causó el error:', evento);
//       }
//     }

//     console.log(`✅ Eventos procesados (24h): ${eventosProcesados.length}`);

//     // Debug: mostrar primeros eventos procesados
//     if (eventosProcesados.length > 0) {
//       console.log('📋 Primeros 3 eventos procesados:');
//       eventosProcesados.slice(0, 3).forEach((evento, i) => {
//         console.log(`  ${i + 1}. ${evento.nombre} (${evento.documento})`);
//         console.log(`     Fecha: ${evento.fecha}, Hora: ${evento.hora_simple}`);
//         console.log(`     Tipo: ${evento.tipo}, Dispositivo: ${evento.dispositivo || 'N/A'}`);
//       });
//     }

//     return eventosProcesados;

//   } catch (error) {
//     console.error('❌ Error obteniendo eventos de 24h:', error);
//     return [];
//   }
// }

// // Función para agrupar eventos por documento y fecha Colombia
// async function procesarParaBD(eventos) {
//   console.log(`🔍 Procesando ${eventos.length} eventos para BD`);

//   // Debug: mostrar distribución de documentos
//   console.log('📊 Distribución de documentos en eventos:');
//   const documentosUnicos = [...new Set(eventos.map(e => e.documento))];
//   console.log(`  Documentos únicos: ${documentosUnicos.length}`);
//   console.log(`  Lista: ${documentosUnicos.slice(0, 10).join(', ')}${documentosUnicos.length > 10 ? '...' : ''}`);

//   // Agrupar por documento y fecha Colombia
//   const eventosPorDocumentoFecha = {};

//   eventos.forEach((evento, index) => {
//     // Debug: mostrar eventos sin documento válido
//     if (evento.documento === 'N/A' || !evento.documento || evento.documento.trim() === '') {
//       console.log(`⚠️ Evento ${index} sin documento válido:`, {
//         nombre: evento.nombre,
//         documento: evento.documento,
//         fecha: evento.fecha
//       });
//       return;
//     }

//     if (!evento.fecha || evento.fecha.trim() === '') {
//       console.log(`⚠️ Evento ${index} sin fecha válida:`, {
//         nombre: evento.nombre,
//         documento: evento.documento,
//         fecha: evento.fecha
//       });
//       return;
//     }

//     // Usar fecha en Colombia para agrupación
//     const key = `${evento.documento}_${evento.fecha}`;

//     if (!eventosPorDocumentoFecha[key]) {
//       eventosPorDocumentoFecha[key] = {
//         documento: evento.documento,
//         nombre: evento.nombre || 'Sin nombre',
//         fecha: evento.fecha, // Fecha en Colombia
//         eventos: []
//       };
//     }

//     eventosPorDocumentoFecha[key].eventos.push(evento);
//   });

//   console.log(`📊 Grupos creados: ${Object.keys(eventosPorDocumentoFecha).length}`);

//   // Mostrar primeros grupos
//   const primerosGrupos = Object.entries(eventosPorDocumentoFecha).slice(0, 5);
//   primerosGrupos.forEach(([key, grupo], i) => {
//     console.log(`  Grupo ${i + 1}: ${key} - ${grupo.eventos.length} eventos`);
//   });

//   if (Object.keys(eventosPorDocumentoFecha).length === 0) {
//     console.log('❌ No se crearon grupos. Posibles problemas:');
//     console.log('   1. Documentos todos son "N/A"');
//     console.log('   2. Fechas no se extrajeron correctamente');
//     console.log('   3. Campos requeridos faltan en los eventos');
//     return [];
//   }

//   const registrosBD = [];
//   const client = await pool.connect();

//   try {
//     for (const [key, grupo] of Object.entries(eventosPorDocumentoFecha)) {
//       console.log(`🔧 Procesando grupo: ${key} con ${grupo.eventos.length} eventos`);

//       // Ordenar eventos por hora
//       grupo.eventos.sort((a, b) => a.hora_simple.localeCompare(b.hora_simple));

//       // Identificar tipos de eventos con validación
//       const entradas = grupo.eventos.filter(e => {
//         const tipo = e.tipo || '';
//         return tipo === 'Entrada' || tipo.toLowerCase().includes('entrada');
//       });

//       const salidas = grupo.eventos.filter(e => {
//         const tipo = e.tipo || '';
//         return tipo === 'Salida' || tipo.toLowerCase().includes('salida');
//       });

//       const entradasAlmuerzo = grupo.eventos.filter(e => {
//         const tipo = e.tipo || '';
//         const attendanceStatus = e.attendanceStatus || '';
//         return tipo === 'Entrada Almuerzo' ||
//           (tipo.toLowerCase().includes('entrada') && tipo.toLowerCase().includes('almuerzo')) ||
//           attendanceStatus === 'breakIn';
//       });

//       const salidasAlmuerzo = grupo.eventos.filter(e => {
//         const tipo = e.tipo || '';
//         const attendanceStatus = e.attendanceStatus || '';
//         return tipo === 'Salida Almuerzo' ||
//           (tipo.toLowerCase().includes('salida') && tipo.toLowerCase().includes('almuerzo')) ||
//           attendanceStatus === 'breakOut';
//       });

//       console.log(`   Encontrados: ${entradas.length} entradas, ${salidas.length} salidas`);
//       console.log(`                ${entradasAlmuerzo.length} entradas almuerzo, ${salidasAlmuerzo.length} salidas almuerzo`);

//       // Tomar la primera entrada y última salida
//       const primeraEntrada = entradas[0];
//       const ultimaSalida = salidas[salidas.length - 1] || salidas[0];
//       const salidaAlmuerzo = salidasAlmuerzo[0];
//       const entradaAlmuerzo = entradasAlmuerzo[0];

//       // Determinar subtipo basado en los registros encontrados
//       let subtipo = 'Sin registros';

//       if (primeraEntrada && ultimaSalida && salidaAlmuerzo && entradaAlmuerzo) {
//         subtipo = 'Jornada completa';
//       } else if (primeraEntrada && ultimaSalida && !salidaAlmuerzo && !entradaAlmuerzo) {
//         subtipo = 'Sin almuerzo';
//       } else if (primeraEntrada && !ultimaSalida) {
//         subtipo = 'Solo entrada';
//       } else if (!primeraEntrada && ultimaSalida) {
//         subtipo = 'Solo salida';
//       } else if (primeraEntrada && ultimaSalida && (salidaAlmuerzo || entradaAlmuerzo)) {
//         subtipo = 'Almuerzo parcial';
//       }

//       console.log(`   Subtipo determinado: ${subtipo}`);

//       // Validar que entrada y salida no tengan la misma hora
//       let horaSalidaValida = ultimaSalida?.hora_simple || null;
//       if (primeraEntrada && ultimaSalida && primeraEntrada.hora_simple === ultimaSalida.hora_simple) {
//         horaSalidaValida = null;
//         subtipo = 'ERROR - Misma hora';
//       }

//       // Crear registro solo si hay al menos un evento
//       if (primeraEntrada || ultimaSalida || salidaAlmuerzo || entradaAlmuerzo) {
//         const dispositivo = primeraEntrada?.dispositivo ||
//           ultimaSalida?.dispositivo ||
//           salidaAlmuerzo?.dispositivo ||
//           entradaAlmuerzo?.dispositivo ||
//           'Desconocido';

//         const foto = primeraEntrada?.foto ||
//           ultimaSalida?.foto ||
//           salidaAlmuerzo?.foto ||
//           entradaAlmuerzo?.foto ||
//           '';

//         const campaña = await obtenerCampañaPorDocumento(grupo.documento, client);

//         registrosBD.push({
//           documento: grupo.documento,
//           nombre: grupo.nombre,
//           fecha: grupo.fecha, // Fecha en Colombia
//           hora_entrada: primeraEntrada?.hora_simple || null,
//           hora_salida: horaSalidaValida,
//           hora_salida_almuerzo: salidaAlmuerzo?.hora_simple || null,
//           hora_entrada_almuerzo: entradaAlmuerzo?.hora_simple || null,
//           tipo_evento: 'Asistencia',
//           subtipo_evento: subtipo,
//           dispositivo_ip: dispositivo,
//           imagen: foto,
//           campaña: campaña
//         });

//         console.log(`   ✅ Registro creado para ${grupo.nombre}`);
//       } else {
//         console.log(`   ⚠️ Grupo sin eventos válidos para registro`);
//       }
//     }
//   } catch (error) {
//     console.error('❌ Error en procesarParaBD:', error);
//     throw error;
//   } finally {
//     client.release();
//   }

//   console.log(`✅ Total registros procesados para BD: ${registrosBD.length}`);
//   return registrosBD;
// }

// async function obtenerCampañaPorDocumento(documento, client) {
//   if (!documento || documento === 'N/A') return 'Sin grupo';

//   try {
//     const result = await client.query(
//       'SELECT departamento FROM usuarios_hikvision WHERE employee_no = $1',
//       [documento]
//     );
//     return result.rows.length > 0 ? result.rows[0].departamento : 'Sin grupo';
//   } catch (error) {
//     return 'Sin grupo';
//   }
// }


// // ================================================
// // FUNCIÓN PRINCIPAL DE SINCRONIZACIÓN
// // ================================================

// async function sincronizarEventos(fechaEspecifica = null) {
//   const startTime = Date.now();

//   try {
//     console.log(`🔄 Iniciando sincronización${fechaEspecifica ? ' para fecha: ' + fechaEspecifica : ' de últimas 24 horas'}`);

//     let eventosHikvision;

//     if (fechaEspecifica) {
//       // Para fecha específica, crear rango de ese día completo (Colombia)
//       const fechaEspecificaDate = new Date(fechaEspecifica);
//       const inicioFecha = new Date(fechaEspecificaDate);
//       inicioFecha.setHours(0, 0, 0, 0);

//       const finFecha = new Date(fechaEspecificaDate);
//       finFecha.setHours(23, 59, 59, 999);

//       eventosHikvision = await obtenerEventosDeHikvisionRango(inicioFecha, finFecha);
//     } else {
//       // Para sincronización automática, usar últimas 24 horas
//       eventosHikvision = await obtenerEventos24Horas();
//     }

//     if (eventosHikvision.length === 0) {
//       const tiempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);
//       console.log(`⚠️ No se encontraron eventos para procesar`);

//       return {
//         eventos_obtenidos: 0,
//         registros_procesados: 0,
//         nuevos_registros: 0,
//         registros_actualizados: 0,
//         tiempo_segundos: parseFloat(tiempoTotal),
//         mensaje: 'No hay eventos para procesar',
//         fecha_procesada: fechaEspecifica || 'últimas 24 horas',
//         zona_horaria: 'Colombia (-05:00)'
//       };
//     }

//     console.log(`📊 Obtenidos ${eventosHikvision.length} eventos para procesar`);

//     // Procesar eventos para BD
//     const registrosBD = await procesarParaBD(eventosHikvision);

//     if (registrosBD.length === 0) {
//       const tiempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);

//       return {
//         eventos_obtenidos: eventosHikvision.length,
//         registros_procesados: 0,
//         nuevos_registros: 0,
//         registros_actualizados: 0,
//         tiempo_segundos: parseFloat(tiempoTotal),
//         mensaje: 'Eventos no generaron registros válidos',
//         fecha_procesada: fechaEspecifica || 'últimas 24 horas',
//         zona_horaria: 'Colombia (-05:00)'
//       };
//     }

//     let insertados = 0;
//     let actualizados = 0;
//     let errores = 0;

//     // Insertar o actualizar en BD
//     for (const registro of registrosBD) {
//       try {
//         const existe = await pool.query(
//           'SELECT id FROM eventos_procesados WHERE documento = $1 AND fecha = $2',
//           [registro.documento, registro.fecha]
//         );

//         if (existe.rows.length > 0) {
//           await pool.query(`
//             UPDATE eventos_procesados SET
//               nombre = $1, hora_entrada = $2, hora_salida = $3,
//               hora_salida_almuerzo = $4, hora_entrada_almuerzo = $5,
//               tipo_evento = $6, subtipo_evento = $7, dispositivo_ip = $8,
//               imagen = $9, campaña = $10
//             WHERE documento = $11 AND fecha = $12
//           `, [
//             registro.nombre, registro.hora_entrada, registro.hora_salida,
//             registro.hora_salida_almuerzo, registro.hora_entrada_almuerzo,
//             registro.tipo_evento, registro.subtipo_evento, registro.dispositivo_ip,
//             registro.imagen, registro.campaña, registro.documento, registro.fecha
//           ]);
//           actualizados++;
//         } else {
//           await pool.query(`
//             INSERT INTO eventos_procesados (
//               documento, nombre, fecha, hora_entrada, hora_salida,
//               hora_salida_almuerzo, hora_entrada_almuerzo,
//               tipo_evento, subtipo_evento, dispositivo_ip, imagen, campaña
//             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
//           `, [
//             registro.documento, registro.nombre, registro.fecha,
//             registro.hora_entrada, registro.hora_salida,
//             registro.hora_salida_almuerzo, registro.hora_entrada_almuerzo,
//             registro.tipo_evento, registro.subtipo_evento,
//             registro.dispositivo_ip, registro.imagen, registro.campaña
//           ]);
//           insertados++;
//         }
//       } catch (error) {
//         console.error(`Error procesando registro ${registro.documento} - ${registro.fecha}:`, error.message);
//         errores++;
//       }
//     }

//     const tiempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);

//     console.log(`✅ Sincronización completada en ${tiempoTotal}s`);
//     console.log(`Eventos: ${eventosHikvision.length} | Registros: ${registrosBD.length}`);
//     console.log(`Nuevos: ${insertados} | Actualizados: ${actualizados} | Errores: ${errores}`);

//     return {
//       eventos_obtenidos: eventosHikvision.length,
//       registros_procesados: registrosBD.length,
//       nuevos_registros: insertados,
//       registros_actualizados: actualizados,
//       errores: errores,
//       tiempo_segundos: parseFloat(tiempoTotal),
//       fecha_procesada: fechaEspecifica || 'últimas 24 horas',
//       hora_sincronizacion: new Date().toLocaleString('es-CO'),
//       zona_horaria: 'Colombia (-05:00)'
//     };

//   } catch (error) {
//     console.error('❌ Error en sincronización:', error.message);
//     throw error;
//   }
// }

// // ================================================
// // CONTROL DE SINCRONIZACIÓN AUTOMÁTICA
// // ================================================

// let sincronizacionActiva = false;
// let ultimaEjecucion = null;
// let intervaloId = null;

// async function ejecutarSincronizacionAutomatica() {
//   try {
//     console.log('🔄 Ejecutando sincronización automática (24h)...');
//     const resultado = await sincronizarEventos();
//     ultimaEjecucion = new Date().toISOString();

//     if (resultado.eventos_obtenidos > 0) {
//       console.log(`✅ Sincronización automática OK: ${resultado.registros_procesados} registros`);
//     }
//   } catch (error) {
//     console.error('❌ Error en sincronización automática:', error.message);
//   }
// }

// function iniciarSincronizacionAutomatica() {
//   if (sincronizacionActiva) return;

//   sincronizacionActiva = true;
//   console.log('🚀 Iniciando sincronización automática (24h)...');
//   ejecutarSincronizacionAutomatica();

//   // Ejecutar cada 2 minutos
//   intervaloId = setInterval(ejecutarSincronizacionAutomatica, 2 * 60 * 1000);
//   console.log('📅 Sincronización automática iniciada (cada 2 minutos)');
// }

// function detenerSincronizacionAutomatica() {
//   if (intervaloId) {
//     clearInterval(intervaloId);
//     intervaloId = null;
//   }
//   sincronizacionActiva = false;
//   console.log('⏹️ Sincronización automática detenida');
// }

// // ================================================
// // ENDPOINTS
// // ================================================

// export async function GET(request) {
//   try {
//     const url = new URL(request.url);
//     const accion = url.searchParams.get('accion');
//     const fecha = url.searchParams.get('fecha');

//     if (accion === 'estado') {
//       let proximaEjecucion = null;

//       if (ultimaEjecucion) {
//         const ultima = new Date(ultimaEjecucion);
//         proximaEjecucion = new Date(ultima.getTime() + 2 * 60 * 1000);
//       }

//       return NextResponse.json({
//         success: true,
//         sincronizacion_automatica: {
//           activa: sincronizacionActiva,
//           ultima_ejecucion: ultimaEjecucion,
//           proxima_ejecucion: proximaEjecucion?.toISOString(),
//           intervalo_minutos: 2,
//           rango: 'Últimas 24 horas',
//           zona_horaria: 'Colombia (-05:00)'
//         }
//       });
//     }

//     if (accion === 'iniciar') {
//       iniciarSincronizacionAutomatica();
//       return NextResponse.json({
//         success: true,
//         message: 'Sincronización automática iniciada',
//         intervalo: '2 minutos',
//         rango: 'Últimas 24 horas',
//         zona_horaria: 'Colombia (-05:00)'
//       });
//     }

//     if (accion === 'detener') {
//       detenerSincronizacionAutomatica();
//       return NextResponse.json({
//         success: true,
//         message: 'Sincronización automática detenida'
//       });
//     }

//     if (accion === 'forzar') {
//       const resultado = await sincronizarEventos();
//       return NextResponse.json({
//         success: true,
//         message: 'Sincronización forzada ejecutada',
//         ...resultado
//       });
//     }

//     if (accion === 'fecha' && fecha) {
//       // Validar formato de fecha
//       if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
//         return NextResponse.json({
//           success: false,
//           error: 'Formato de fecha inválido. Use YYYY-MM-DD'
//         }, { status: 400 });
//       }

//       const resultado = await sincronizarEventos(fecha);
//       return NextResponse.json({
//         success: true,
//         message: `Sincronización para fecha ${fecha} completada`,
//         ...resultado
//       });
//     }

//     if (accion === 'ayer') {
//       const ayer = new Date();
//       ayer.setDate(ayer.getDate() - 1);
//       const fechaAyer = ayer.toISOString().split('T')[0];

//       const resultado = await sincronizarEventos(fechaAyer);
//       return NextResponse.json({
//         success: true,
//         message: `Sincronización de ayer (${fechaAyer}) completada`,
//         ...resultado
//       });
//     }

//     // Sincronización normal (últimas 24 horas)
//     const resultado = await sincronizarEventos();
//     return NextResponse.json({
//       success: true,
//       message: 'Sincronización de últimas 24 horas completada',
//       ...resultado
//     });

//   } catch (error) {
//     console.error('❌ Error en endpoint:', error.message);
//     return NextResponse.json({
//       success: false,
//       error: error.message,
//       detalle: 'Verificar logs del servidor'
//     }, { status: 500 });
//   }
// }

// export async function POST(request) {
//   return await GET(request);
// }

// // ================================================
// // INICIAR AUTOMÁTICAMENTE
// // ================================================

// function iniciarAutomaticamente() {
//   if (typeof window !== 'undefined') return;
//   if (sincronizacionActiva) return;

//   setTimeout(() => {
//     iniciarSincronizacionAutomatica();
//   }, 10000); // Esperar 10 segundos al iniciar
// }

// console.log('✅ Módulo de sincronización cargado');
// iniciarAutomaticamente();