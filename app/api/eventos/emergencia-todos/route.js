// import { NextResponse } from 'next/server';
// import DigestFetch from 'digest-fetch';

// // Configuración
// const CONFIG = {
//   username: "admin",
//   password: "Tattered3483",
//   devices: ["172.31.0.165", "172.31.0.164"],
//   maxResults: 100,
//   maxRetries: 10,
//   requestDelay: 100,
//   deviceDelay: 500
// };

// process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// // Utilidades
// const formatHikvisionDate = (date) => date.toISOString().replace(/\.\d{3}Z$/, '');
// const createDigestClient = () => new DigestFetch(CONFIG.username, CONFIG.password, { disableRetry: false, algorithm: 'MD5' });
// const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// // Cliente Hikvision
// class HikvisionClient {
//   constructor(deviceIp) {
//     this.client = createDigestClient();
//     this.deviceIp = deviceIp;
//     this.baseUrl = `https://${deviceIp}/ISAPI/AccessControl/AcsEvent?format=json`;
//   }

//   async fetchEvents(searchCondition) {
//     const body = {
//       AcsEventCond: {
//         searchID: searchCondition.tag,
//         searchResultPosition: searchCondition.position,
//         maxResults: searchCondition.maxResults,
//         major: 5,
//         minor: 0,
//         startTime: searchCondition.startTime,
//         endTime: searchCondition.endTime
//       }
//     };

//     console.log(`🔍 Consultando ${this.deviceIp}: posición ${searchCondition.position}`);

//     try {
//       const res = await this.client.fetch(this.baseUrl, {
//         method: "POST",
//         body: JSON.stringify(body),
//         headers: { "Content-Type": "application/json" }
//       });

//       if (!res.ok) {
//         const errorText = await res.text();
//         throw new Error(`Dispositivo ${this.deviceIp} - Error ${res.status}: ${errorText}`);
//       }

//       return await res.json();
//     } catch (error) {
//       console.error(`❌ Error en fetchEvents ${this.deviceIp}:`, error.message);
//       throw error;
//     }
//   }
// }

// // Servicio de consulta por rango
// class RangeQueryService {
//   constructor(hikvisionClient) {
//     this.client = hikvisionClient;
//   }

//   async queryEventsByRange(startTime, endTime, tag = 'consulta') {
//     let eventos = [];
//     let position = 0;
//     let intento = 1;
    
//     while (intento <= 30) { // Máximo 30 intentos = 3000 eventos
//       const searchCondition = {
//         tag: `${tag}_${intento}`,
//         position,
//         maxResults: CONFIG.maxResults,
//         startTime,
//         endTime
//       };

//       try {
//         console.log(`📡 ${this.client.deviceIp}: Lote ${intento}, posición ${position}`);
//         const data = await this.client.fetchEvents(searchCondition);
//         const eventosLote = data?.AcsEvent?.InfoList || [];

//         console.log(`📨 ${this.client.deviceIp}: Lote ${intento} → ${eventosLote.length} eventos`);

//         if (eventosLote.length === 0) {
//           console.log(`✅ ${this.client.deviceIp}: No hay más eventos`);
//           break;
//         }

//         // Agregar eventos
//         eventos.push(...eventosLote.map(evento => ({
//           ...evento,
//           dispositivo: this.client.deviceIp
//         })));

//         position += eventosLote.length;
//         intento++;

//         // Si obtenemos menos de maxResults, es probable el último lote
//         if (eventosLote.length < CONFIG.maxResults) {
//           console.log(`✅ ${this.client.deviceIp}: Lote incompleto, fin de datos`);
//           break;
//         }

//         await delay(CONFIG.requestDelay);

//       } catch (error) {
//         console.error(`❌ Error en lote ${intento}:`, error.message);
//         break;
//       }
//     }

//     console.log(`✅ ${this.client.deviceIp}: Total obtenidos ${eventos.length} eventos`);
//     return eventos;
//   }
// }

// // Procesador de eventos
// class EventProcessor {
//   static corregirZonaHoraria(evento) {
//     if (!evento.time) return evento.time;

//     try {
//       let fecha = new Date(evento.time);

//       // Dispositivo 164 está en +08:00 (Malasia) pero debería ser -05:00 (Colombia)
//       if (evento.dispositivo === '172.31.0.164') {
//         // Convertir de +08:00 a -05:00 = restar 13 horas
//         fecha.setHours(fecha.getHours() - 13);
//         return fecha.toISOString();
//       }
      
//       return evento.time;
      
//     } catch (error) {
//       console.log(`⚠️ Error corrigiendo zona horaria: ${evento.time}`);
//       return evento.time;
//     }
//   }

//   static extraerDocumento(evento) {
//     // Prioridad 1: employeeNoString
//     if (evento.employeeNoString && evento.employeeNoString.trim() !== '' && evento.employeeNoString !== 'N/A') {
//       return evento.employeeNoString.trim();
//     }

//     // Prioridad 2: cardNo  
//     if (evento.cardNo && evento.cardNo.trim() !== '') {
//       return evento.cardNo.trim();
//     }

//     // Prioridad 3: Si tiene nombre, crear documento temporal
//     if (evento.name && evento.name !== 'Sin nombre' && evento.name.trim() !== '') {
//       const nombreHash = Buffer.from(evento.name).toString('hex').substring(0, 12);
//       return `temp_${nombreHash}`;
//     }

//     // Último recurso: usar hora
//     if (evento.time) {
//       const horaNumeros = evento.time.replace(/[^0-9]/g, '').substring(0, 14);
//       return `hora_${horaNumeros}`;
//     }

//     return `evento_${Math.random().toString(36).substr(2, 9)}`;
//   }

//   static determinarTipoEvento(evento) {
//     if (evento.label) {
//       const labelLower = evento.label.toLowerCase();
//       if (labelLower.includes('salida')) return 'Solo Salida';
//       if (labelLower.includes('entrada')) return 'Solo Entrada';
//     }
    
//     // Por defecto, asumir entrada
//     return 'Solo Entrada';
//   }

//   static extraerHoraSimple(timestamp) {
//     if (!timestamp) return null;
    
//     try {
//       const fecha = new Date(timestamp);
//       if (isNaN(fecha.getTime())) return null;
      
//       const horas = fecha.getHours().toString().padStart(2, '0');
//       const minutos = fecha.getMinutes().toString().padStart(2, '0');
//       const segundos = fecha.getSeconds().toString().padStart(2, '0');
      
//       return `${horas}:${minutos}:${segundos}`;
//     } catch (error) {
//       console.log('⚠️ Error extrayendo hora:', error.message);
//       return null;
//     }
//   }

//   static processEvents(eventos) {
//     console.log(`📊 Procesando ${eventos.length} eventos brutos`);

//     // Procesar TODOS los eventos
//     const eventosProcesados = eventos.map(evento => {
//       const horaCorregida = this.corregirZonaHoraria(evento);
//       const fechaObj = new Date(horaCorregida);
//       const documento = this.extraerDocumento(evento);
//       const tipo = this.determinarTipoEvento(evento);
//       const horaSimple = this.extraerHoraSimple(horaCorregida);

//       return {
//         empleadoId: documento,
//         nombre: evento.name || 'Sin nombre',
//         hora: horaSimple,
//         horaCompleta: horaCorregida,
//         fecha: fechaObj.toISOString().split('T')[0],
//         campaña: evento.department || 'Sin grupo',
//         tipo: tipo,
//         foto: evento.pictureURL || '',
//         dispositivo: evento.dispositivo || 'Desconocido'
//       };
//     });

//     console.log(`✅ Procesados ${eventosProcesados.length} eventos para BD`);
    
//     return eventosProcesados.sort((a, b) => {
//       const fechaA = new Date(a.horaCompleta || a.hora);
//       const fechaB = new Date(b.horaCompleta || b.hora);
//       return fechaB.getTime() - fechaA.getTime();
//     });
//   }
// }

// // Servicio principal - ESPECÍFICO PARA 30 DE NOVIEMBRE 2025
// class BiometricService {
//   async queryAllDevices() {
//     console.log(`\n🚀 CONSULTANDO DISPOSITIVOS BIOMÉTRICOS - FECHA ESPECÍFICA: 30 DE NOVIEMBRE 2025`);

//     const allEvents = [];
//     const errors = [];

//     // FECHA ESPECÍFICA: 30 de noviembre de 2025
//     const fechaEspecifica = new Date('2025-11-30');
    
//     const inicioDia = new Date(fechaEspecifica);
//     inicioDia.setHours(0, 0, 0, 0);
    
//     const finDia = new Date(fechaEspecifica);
//     finDia.setHours(23, 59, 59, 999);
    
//     const startTime = formatHikvisionDate(inicioDia);
//     const endTime = formatHikvisionDate(finDia);
    
//     console.log(`📅 Fecha específica: 2025-11-30`);
//     console.log(`🎯 Rango consultado: ${startTime} a ${endTime}`);

//     for (const deviceIp of CONFIG.devices) {
//       try {
//         console.log(`\n📡 Consultando dispositivo: ${deviceIp}`);

//         const hikvisionClient = new HikvisionClient(deviceIp);
//         const rangeService = new RangeQueryService(hikvisionClient);

//         const deviceEvents = await rangeService.queryEventsByRange(
//           startTime,
//           endTime,
//           '30_nov_2025' // Tag específico
//         );

//         console.log(`✅ ${deviceIp}: ${deviceEvents.length} eventos obtenidos`);
//         allEvents.push(...deviceEvents);

//         await delay(CONFIG.deviceDelay);

//       } catch (error) {
//         console.error(`❌ Error en ${deviceIp}:`, error.message);
//         errors.push({
//           dispositivo: deviceIp,
//           error: error.message
//         });
//       }
//     }

//     const eventosProcesados = EventProcessor.processEvents(allEvents);

//     console.log(`\n📈 RESUMEN CONSULTA:`);
//     console.log(`   - Total eventos brutos: ${allEvents.length}`);
//     console.log(`   - Eventos procesados: ${eventosProcesados.length}`);
//     console.log(`   - Dispositivos con error: ${errors.length}`);
    
//     // Mostrar primeros 5 eventos como ejemplo
//     if (eventosProcesados.length > 0) {
//       console.log(`\n📋 Primeros 5 eventos procesados:`);
//       eventosProcesados.slice(0, 5).forEach((e, i) => {
//         console.log(`   ${i+1}. ${e.nombre} (${e.empleadoId}) - ${e.hora} - ${e.tipo}`);
//       });
//     }

//     return {
//       eventos: eventosProcesados,
//       errors,
//       fecha_consultada: '2025-11-30',
//       rango_consultado: { startTime, endTime },
//       dispositivos_consultados: CONFIG.devices,
//       estadisticas: {
//         total_eventos_brutos: allEvents.length,
//         total_eventos_procesados: eventosProcesados.length,
//         dispositivos_exitosos: CONFIG.devices.length - errors.length,
//         dispositivos_con_error: errors.length
//       }
//     };
//   }
// }

// // Exportar GET method - SOLO PARA 30 DE NOVIEMBRE
// export async function GET(request) {
//   console.log('\n🌐 ========== CONSULTA ESPECÍFICA 30 NOVIEMBRE 2025 ==========');

//   const biometricService = new BiometricService();

//   try {
//     const result = await biometricService.queryAllDevices();

//     console.log(`\n✅ CONSULTA COMPLETADA: ${result.eventos.length} eventos procesados`);

//     const response = {
//       success: true,
//       fecha_consultada: '2025-11-30',
//       mensaje: 'Consulta específica para el 30 de noviembre de 2025',
//       dispositivos_consultados: CONFIG.devices,
//       total_eventos: result.estadisticas.total_eventos_procesados,
//       eventos: result.eventos,
//       estadisticas: result.estadisticas
//     };

//     if (result.errors.length > 0) {
//       response.errores = result.errors;
//       response.advertencia = 'Algunos dispositivos presentaron errores';
//     }

//     return NextResponse.json(response);

//   } catch (error) {
//     console.error('❌ ERROR GENERAL:', error.message);
//     return NextResponse.json(
//       {
//         success: false,
//         error: error.message,
//         fecha_intentada: '2025-11-30'
//       },
//       { status: 500 }
//     );
//   }
// }