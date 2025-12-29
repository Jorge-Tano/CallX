// // C:\Users\jorge.gomez\Documents\Proyectos\CallX\lib\db\eventos\database.js

// import DigestFetch from 'digest-fetch';

// // Configuración
// const CONFIG = {
//   username: process.env.HIKUSER,
//   password: process.env.HIKPASS,
//   devices: [process.env.HIKVISION_IP1, process.env.HIKVISION_IP2].filter(Boolean),
//   hikvisionMaxResults: 50,
//   requestDelay: 200,
//   deviceDelay: 1000,
//   timeout: 30000
// };

// if (!CONFIG.username || !CONFIG.password) {
//   throw new Error('Faltan credenciales Hikvision en variables de entorno');
// }
// if (CONFIG.devices.length === 0) {
//   throw new Error('No hay dispositivos Hikvision configurados');
// }

// // Utilidades
// const formatHikvisionDate = (date) => date.toISOString().replace(/\.\d{3}Z$/, '');
// const createDigestClient = () => new DigestFetch(CONFIG.username, CONFIG.password, {
//   disableRetry: true,
//   algorithm: 'MD5'
// });
// const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// // Cliente Hikvision
// class HikvisionClient {
//   constructor(deviceIp) {
//     this.deviceIp = deviceIp;
//     this.baseUrl = `https://${deviceIp}/ISAPI/AccessControl/AcsEvent?format=json`;
//     this.client = createDigestClient();
//   }

//   async fetchEvents(startTime, endTime, position = 0) {
//     const body = {
//       AcsEventCond: {
//         searchID: `search_${this.deviceIp}_${Date.now()}`,
//         searchResultPosition: position,
//         maxResults: CONFIG.hikvisionMaxResults,
//         major: 5,
//         minor: 75,
//         startTime,
//         endTime
//       }
//     };

//     try {
//       const res = await this.client.fetch(this.baseUrl, {
//         method: "POST",
//         body: JSON.stringify(body),
//         headers: {
//           "Content-Type": "application/json",
//           "Accept": "application/json"
//         },
//         timeout: 30000
//       });

//       if (!res.ok) {
//         const errorText = await res.text();
//         if (res.status === 400 || res.status === 404) {
//           return { AcsEvent: { InfoList: [], totalMatches: 0 } };
//         }
//         throw new Error(`HTTP ${res.status}: ${errorText.substring(0, 100)}`);
//       }

//       const responseText = await res.text();
//       if (!responseText || responseText.trim() === '') {
//         return { AcsEvent: { InfoList: [], totalMatches: 0 } };
//       }

//       return JSON.parse(responseText);
//     } catch (error) {
//       throw error;
//     }
//   }
// }

// // Función para consultar todos los eventos de un dispositivo
// async function consultarTodosEventosDispositivo(deviceIp, startTime, endTime) {
//   const client = new HikvisionClient(deviceIp);
//   let allEvents = [];
//   let position = 0;
//   let batchNumber = 1;
//   let totalMatches = null;
//   let maxBatches = 50;

//   while (batchNumber <= maxBatches) {
//     try {
//       const data = await client.fetchEvents(startTime, endTime, position);
//       if (!data?.AcsEvent) {
//         break;
//       }

//       const eventosBatch = data.AcsEvent.InfoList || [];
//       const batchSize = eventosBatch.length;

//       if (batchNumber === 1) {
//         totalMatches = data.AcsEvent.totalMatches || 0;
//       }

//       if (batchSize === 0) {
//         if (totalMatches > 0 && allEvents.length >= totalMatches) {
//           break;
//         }
//         if (batchNumber === 1 && totalMatches > 0) {
//           position = 1;
//           continue;
//         }
//         break;
//       }

//       const eventosConInfo = eventosBatch.map(evento => ({
//         ...evento,
//         dispositivo: deviceIp,
//         batch: batchNumber,
//         position
//       }));

//       allEvents.push(...eventosConInfo);

//       if (totalMatches > 0 && allEvents.length >= totalMatches) {
//         break;
//       }

//       position += batchSize;
//       batchNumber++;
//       await delay(CONFIG.requestDelay);

//     } catch (error) {
//       if (error.message.includes('position') || error.message.includes('range')) {
//         position += 1;
//         await delay(500);
//         continue;
//       }

//       if (batchNumber <= 3) {
//         await delay(2000);
//         continue;
//       }
//       break;
//     }
//   }

//   return {
//     eventos: allEvents,
//     totalReportado: totalMatches,
//     dispositivo: deviceIp
//   };
// }

// // En database.js, función procesarEventos24Horas
// function procesarEventos24Horas(resultadosConsulta) {
//   const eventosProcesados = [];

//   for (const resultado of resultadosConsulta) {
//     const { dispositivo } = resultado;

//     for (const evento of resultado.eventos) {
//       try {
//         if (!evento.time) continue;

//         // La hora ya viene en formato Colombia (2025-12-04T07:40:07-05:00)
//         const fechaColombiaStr = evento.time.split('T')[0];
//         const horaCompleta = evento.time.split('T')[1];
//         const horaColombiaStr = horaCompleta ? horaCompleta.substring(0, 8) : '00:00:00';

//         // Determinar tipo de evento
//         let tipo = 'Evento';
//         const label = evento.label || '';
//         const attendanceStatus = evento.attendanceStatus || '';

//         // Documento del empleado - IMPORTANTE
//         let documento = 'N/A';
//         if (evento.employeeNoString && evento.employeeNoString.trim() !== '') {
//           documento = evento.employeeNoString.trim();
//           console.log(`✅ Documento encontrado: ${documento} de employeeNoString`);
//         } else if (evento.cardNo && evento.cardNo.trim() !== '') {
//           documento = evento.cardNo.trim();
//           console.log(`✅ Documento encontrado: ${documento} de cardNo`);
//         } else {
//           console.log(`⚠️ Evento sin documento:`, {
//             name: evento.name,
//             time: evento.time,
//             employeeNoString: evento.employeeNoString,
//             cardNo: evento.cardNo
//           });
//         }

//         const nombre = evento.name ? evento.name.trim() : 'Sin nombre';

//         eventosProcesados.push({
//           dispositivo,
//           nombre,
//           documento, // <-- Esto debe venir correctamente
//           fecha: fechaColombiaStr,
//           hora: evento.time,
//           hora_simple: horaColombiaStr,
//           tipo,
//           departamento: evento.department || 'Sin departamento',
//           foto: evento.pictureURL || '',
//           label_original: label,
//           attendance_status_original: attendanceStatus,
//           time_original: evento.time
//         });

//       } catch (error) {
//         console.error('Error procesando evento:', error);
//         continue;
//       }
//     }
//   }

//   return eventosProcesados;
// }

// // FUNCIÓN PRINCIPAL - ÚLTIMAS 24 HORAS
// export async function obtenerEventosDeHikvision() {
//   try {
//     // Obtener hora actual en Colombia
//     const ahora = new Date();

//     // Calcular hace 24 horas atrás (Colombia)
//     const hace24Horas = new Date(ahora.getTime() - (24 * 60 * 60 * 1000));

//     // Formatear para Hikvision (sin conversión UTC, mantener Colombia)
//     const inicio = formatHikvisionDate(hace24Horas);
//     const fin = formatHikvisionDate(ahora);

//     console.log('📅 Consultando eventos últimas 24 horas (Colombia):', {
//       inicio: inicio.replace('Z', ''),
//       fin: fin.replace('Z', ''),
//       rango_horas: 'Últimas 24 horas'
//     });

//     const resultadosConsulta = [];

//     // Consultar cada dispositivo
//     for (const deviceIp of CONFIG.devices) {
//       let resultado;
//       let intentos = 0;

//       while (intentos < 2) {
//         intentos++;

//         try {
//           resultado = await consultarTodosEventosDispositivo(deviceIp, inicio, fin);
//           if (resultado.eventos.length > 0) break;
//         } catch (error) {
//           if (intentos < 2) {
//             await delay(5000);
//           }
//         }
//       }

//       if (resultado?.eventos.length > 0) {
//         resultadosConsulta.push(resultado);
//         console.log(`✅ ${deviceIp}: ${resultado.eventos.length} eventos`);
//       }

//       if (deviceIp !== CONFIG.devices[CONFIG.devices.length - 1]) {
//         await delay(CONFIG.deviceDelay);
//       }
//     }

//     if (resultadosConsulta.length === 0) {
//       console.log('⚠️ No se encontraron eventos en las últimas 24 horas');
//       return [];
//     }

//     // Procesar eventos
//     const eventosProcesados = procesarEventos24Horas(resultadosConsulta);

//     console.log(`✅ Eventos procesados: ${eventosProcesados.length}`);

//     // Mostrar solo información básica
//     if (eventosProcesados.length > 0) {
//       console.log('📋 Primeros eventos encontrados:');
//       eventosProcesados.slice(0, 3).forEach((evento, i) => {
//         console.log(`  ${i + 1}. ${evento.nombre} - ${evento.fecha} ${evento.hora_simple} - ${evento.tipo}`);
//       });
//     }

//     return eventosProcesados;

//   } catch (error) {
//     console.error('❌ Error obteniendo eventos:', error);
//     return [];
//   }
// }

// // Función para obtener eventos con rango específico (Colombia)
// export async function obtenerEventosDeHikvisionRango(inicio, fin) {
//   try {
//     console.log('📅 Consultando eventos con rango:', {
//       inicio: formatHikvisionDate(inicio).replace('Z', ''),
//       fin: formatHikvisionDate(fin).replace('Z', '')
//     });

//     const resultadosConsulta = [];

//     // Consultar cada dispositivo
//     for (const deviceIp of CONFIG.devices) {
//       let resultado;
//       let intentos = 0;

//       while (intentos < 2) {
//         intentos++;

//         try {
//           resultado = await consultarTodosEventosDispositivo(
//             deviceIp,
//             formatHikvisionDate(inicio),
//             formatHikvisionDate(fin)
//           );

//           if (resultado.eventos.length > 0) break;
//         } catch (error) {
//           if (intentos < 2) {
//             await delay(5000);
//           }
//         }
//       }

//       if (resultado?.eventos.length > 0) {
//         resultadosConsulta.push(resultado);
//       }
//     }

//     if (resultadosConsulta.length === 0) {
//       return [];
//     }

//     // Aplanar todos los eventos
//     const todosEventos = resultadosConsulta.flatMap(r => r.eventos);

//     console.log(`✅ Eventos obtenidos: ${todosEventos.length}`);
//     return todosEventos;

//   } catch (error) {
//     console.error('❌ Error obteniendo eventos:', error);
//     return [];
//   }
// }