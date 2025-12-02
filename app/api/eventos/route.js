import { NextResponse } from 'next/server';
import DigestFetch from 'digest-fetch';

// Configuración
const CONFIG = {
  username: "admin",
  password: "Tattered3483",
  devices: ["172.31.0.165", "172.31.0.164"],
  maxResults: 100,  // Aumentado de 30 a 100
  maxRetries: 10,
  requestDelay: 100,
  deviceDelay: 500
};

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Utilidades
const formatHikvisionDate = (date) => date.toISOString().replace(/\.\d{3}Z$/, '');
const createDigestClient = () => new DigestFetch(CONFIG.username, CONFIG.password, { disableRetry: false, algorithm: 'MD5' });
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Cliente Hikvision
class HikvisionClient {
  constructor(deviceIp) {
    this.client = createDigestClient();
    this.deviceIp = deviceIp;
    this.baseUrl = `https://${deviceIp}/ISAPI/AccessControl/AcsEvent?format=json`;
  }

  async fetchEvents(searchCondition) {
    const body = {
      AcsEventCond: {
        searchID: searchCondition.tag,
        searchResultPosition: searchCondition.position,
        maxResults: searchCondition.maxResults,
        major: 5,
        minor: 0,
        startTime: searchCondition.startTime,
        endTime: searchCondition.endTime
      }
    };

    console.log(`🔍 Consultando ${this.deviceIp}: posición ${searchCondition.position}, límite ${searchCondition.maxResults}`);

    try {
      const res = await this.client.fetch(this.baseUrl, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" }
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Dispositivo ${this.deviceIp} - Error ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      
      // DEBUG: Ver estructura de respuesta
      console.log(`📊 ${this.deviceIp} respuesta:`, {
        listaEventos: data?.AcsEvent?.InfoList?.length || 0,
        totalMatches: data?.AcsEvent?.totalMatches,
        numOfMatches: data?.AcsEvent?.numOfMatches
      });

      return data;
    } catch (error) {
      console.error(`❌ Error en fetchEvents ${this.deviceIp}:`, error.message);
      throw error;
    }
  }
}

// Servicio de consulta por rango
class RangeQueryService {
  constructor(hikvisionClient) {
    this.client = hikvisionClient;
  }

  async queryEventsByRange(startTime, endTime, tag = 'consulta') {
    let eventos = [];
    let position = 0;
    let intento = 1;
    let totalObtenidos = 0;
    
    // Aumentar intentos para obtener más eventos
    while (intento <= 30) {  // Máximo 30 intentos = 3000 eventos (100 × 30)
      const searchCondition = {
        tag: `${tag}_${intento}`,
        position,
        maxResults: CONFIG.maxResults,
        startTime,
        endTime
      };

      try {
        console.log(`📡 ${this.client.deviceIp}: Lote ${intento}, posición ${position}`);
        const data = await this.client.fetchEvents(searchCondition);
        const eventosLote = data?.AcsEvent?.InfoList || [];

        console.log(`📨 ${this.client.deviceIp}: Lote ${intento} → ${eventosLote.length} eventos`);

        if (eventosLote.length === 0) {
          console.log(`✅ ${this.client.deviceIp}: No hay más eventos después de ${totalObtenidos} obtenidos`);
          break;
        }

        // Agregar eventos con información del dispositivo
        eventos.push(...eventosLote.map(evento => ({
          ...evento,
          dispositivo: this.client.deviceIp
        })));

        totalObtenidos += eventosLote.length;
        position += eventosLote.length;
        intento++;

        // Si obtenemos menos de maxResults, probablemente es el último lote
        if (eventosLote.length < CONFIG.maxResults) {
          console.log(`✅ ${this.client.deviceIp}: Lote incompleto, fin de datos (${totalObtenidos} total)`);
          break;
        }

        // Pequeña pausa
        await delay(CONFIG.requestDelay);

      } catch (error) {
        console.error(`❌ Error en lote ${intento}:`, error.message);
        break;
      }
    }

    console.log(`✅ ${this.client.deviceIp}: Total obtenidos ${eventos.length} eventos`);
    return eventos;
  }
}

// Servicio de periodos de tiempo
class TimePeriodService {
  getTodayRange() {
    const today = new Date();
    const inicioDia = new Date(today);
    inicioDia.setHours(0, 0, 0, 0);
    const finDia = new Date(today);
    finDia.setHours(23, 59, 59, 999);

    console.log(`📅 Rango de hoy: ${inicioDia.toISOString()} a ${finDia.toISOString()}`);

    return {
      startTime: formatHikvisionDate(inicioDia),
      endTime: formatHikvisionDate(finDia),
      tag: 'hoy'
    };
  }

  getLast7DaysRange() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    console.log(`📅 Rango de 7 días: ${sevenDaysAgo.toISOString()} a ${now.toISOString()}`);

    return {
      startTime: formatHikvisionDate(sevenDaysAgo),
      endTime: formatHikvisionDate(now),
      tag: '7dias'
    };
  }

  getLast30DaysRange() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    console.log(`📅 Rango de 30 días: ${thirtyDaysAgo.toISOString()} a ${now.toISOString()}`);

    return {
      startTime: formatHikvisionDate(thirtyDaysAgo),
      endTime: formatHikvisionDate(now),
      tag: '30dias'
    };
  }
}

// Procesador de eventos - VERSIÓN MEJORADA
class EventProcessor {
  static corregirZonaHoraria(evento) {
    if (!evento.time) return evento.time;

    try {
      let fecha = new Date(evento.time);

      // Dispositivo 164 está en +08:00 (Malasia) pero debería ser -05:00 (Colombia)
      if (evento.dispositivo === '172.31.0.164') {
        // Convertir de +08:00 a -05:00 = restar 13 horas
        fecha.setHours(fecha.getHours() - 13);
        
        const original = evento.time;
        const corregido = fecha.toISOString();
        
        // Solo loguear algunos para no saturar
        if (Math.random() < 0.1) { // 10% de los eventos
          console.log(`🕒 ${evento.dispositivo}: ${original.split('T')[1]?.substring(0,8)} → ${corregido.split('T')[1]?.substring(0,8)}`);
        }
        
        return corregido;
      }
      
      return evento.time;
      
    } catch (error) {
      console.log(`⚠️ Error corrigiendo zona horaria: ${evento.time}`, error.message);
      return evento.time;
    }
  }

  static extraerDocumento(evento) {
    // Prioridad 1: employeeNoString
    if (evento.employeeNoString && evento.employeeNoString.trim() !== '' && evento.employeeNoString !== 'N/A') {
      return evento.employeeNoString.trim();
    }

    // Prioridad 2: cardNo  
    if (evento.cardNo && evento.cardNo.trim() !== '') {
      return evento.cardNo.trim();
    }

    // Prioridad 3: Si tiene nombre, crear documento temporal
    if (evento.name && evento.name !== 'Sin nombre' && evento.name.trim() !== '') {
      // Crear hash simple del nombre
      const nombreHash = Buffer.from(evento.name).toString('hex').substring(0, 12);
      return `temp_${nombreHash}`;
    }

    // Prioridad 4: Usar hora como identificador único
    if (evento.time) {
      const horaNumeros = evento.time.replace(/[^0-9]/g, '').substring(0, 14);
      return `hora_${horaNumeros}`;
    }

    // Último recurso: dispositivo + índice
    return `evento_${evento.dispositivo || 'desconocido'}_${Math.random().toString(36).substr(2, 9)}`;
  }

  static determinarTipoEvento(evento) {
    if (evento.label) {
      const labelLower = evento.label.toLowerCase();
      if (labelLower.includes('salida')) return 'Solo Salida';
      if (labelLower.includes('entrada')) return 'Solo Entrada';
    }
    
    // Por defecto, asumir entrada para eventos de marcación
    return 'Solo Entrada';
  }

  static extraerHoraSimple(timestamp) {
    if (!timestamp) return null;
    
    try {
      const fecha = new Date(timestamp);
      if (isNaN(fecha.getTime())) return null;
      
      const horas = fecha.getHours().toString().padStart(2, '0');
      const minutos = fecha.getMinutes().toString().padStart(2, '0');
      const segundos = fecha.getSeconds().toString().padStart(2, '0');
      
      return `${horas}:${minutos}:${segundos}`;
    } catch (error) {
      console.log('⚠️ Error extrayendo hora:', error.message);
      return null;
    }
  }

  static processEvents(eventos, startTime, endTime) {
    console.log(`📊 Procesando ${eventos.length} eventos brutos`);

    // Estadísticas detalladas
    const conEmployeeNo = eventos.filter(e => e.employeeNoString && e.employeeNoString.trim() !== '').length;
    const conCardNo = eventos.filter(e => e.cardNo && e.cardNo.trim() !== '').length;
    const conNombre = eventos.filter(e => e.name && e.name !== 'Sin nombre' && e.name.trim() !== '').length;
    const sinIdentificacion = eventos.filter(e => 
      !e.employeeNoString && !e.cardNo && (!e.name || e.name === 'Sin nombre')
    ).length;

    console.log(`📈 Estadísticas detalladas:`);
    console.log(`   - Con employeeNo: ${conEmployeeNo}`);
    console.log(`   - Con cardNo: ${conCardNo}`);
    console.log(`   - Con nombre: ${conNombre}`);
    console.log(`   - Sin identificación: ${sinIdentificacion}`);

    // Procesar TODOS los eventos
    const eventosProcesados = eventos.map(evento => {
      const horaCorregida = this.corregirZonaHoraria(evento);
      const fechaObj = new Date(horaCorregida);
      const documento = this.extraerDocumento(evento);
      const tipo = this.determinarTipoEvento(evento);
      const horaSimple = this.extraerHoraSimple(horaCorregida);

      return {
        empleadoId: documento,
        nombre: evento.name || 'Sin nombre',
        hora: horaSimple,  // ← Enviar hora simple (HH:MM:SS)
        horaCompleta: horaCorregida,  // ← Mantener timestamp completo también
        fecha: fechaObj.toISOString().split('T')[0],
        campaña: evento.department || 'Sin grupo',
        tipo: tipo,
        foto: evento.pictureURL || '',
        dispositivo: evento.dispositivo || 'Desconocido',
        tieneDocumentoReal: !!(evento.employeeNoString || evento.cardNo)
      };
    });

    console.log(`✅ Procesados ${eventosProcesados.length} eventos para BD`);
    
    // Mostrar algunos ejemplos
    if (eventosProcesados.length > 0) {
      console.log(`📋 Ejemplos procesados:`);
      eventosProcesados.slice(0, 3).forEach((e, i) => {
        console.log(`   ${i+1}. Doc: ${e.empleadoId.substring(0, 15)}..., Nombre: ${e.nombre.substring(0, 20)}..., Hora: ${e.hora}, Tipo: ${e.tipo}`);
      });
    }

    return eventosProcesados.sort((a, b) => {
      const fechaA = new Date(a.horaCompleta || a.hora);
      const fechaB = new Date(b.horaCompleta || b.hora);
      return fechaB.getTime() - fechaA.getTime();
    });
  }
}

// Servicio principal
class BiometricService {
  async queryAllDevices(rango = 'hoy', fechaInicio = null, fechaFin = null) {
    console.log(`\n🚀 CONSULTANDO DISPOSITIVOS BIOMÉTRICOS - Rango: ${rango}`);

    const allEvents = [];
    const errors = [];
    const timeService = new TimePeriodService();

    let timeRange;
    switch (rango) {
      case '7dias':
        timeRange = timeService.getLast7DaysRange();
        break;
      case '30dias':
        timeRange = timeService.getLast30DaysRange();
        break;
      case 'personalizado':
        if (!fechaInicio || !fechaFin) {
          throw new Error('Para rango personalizado se requieren fechaInicio y fechaFin');
        }
        timeRange = {
          startTime: formatHikvisionDate(new Date(fechaInicio + 'T00:00:00')),
          endTime: formatHikvisionDate(new Date(fechaFin + 'T23:59:59')),
          tag: 'personalizado'
        };
        break;
      case 'hoy':
      default:
        timeRange = timeService.getTodayRange();
    }

    console.log(`🎯 Consultando con rango: ${timeRange.startTime} a ${timeRange.endTime}`);

    for (const deviceIp of CONFIG.devices) {
      try {
        console.log(`\n📡 Consultando dispositivo: ${deviceIp}`);

        const hikvisionClient = new HikvisionClient(deviceIp);
        const rangeService = new RangeQueryService(hikvisionClient);

        const deviceEvents = await rangeService.queryEventsByRange(
          timeRange.startTime,
          timeRange.endTime,
          timeRange.tag
        );

        console.log(`✅ ${deviceIp}: ${deviceEvents.length} eventos obtenidos`);
        allEvents.push(...deviceEvents);

        await delay(CONFIG.deviceDelay);

      } catch (error) {
        console.error(`❌ Error en ${deviceIp}:`, error.message);
        errors.push({
          dispositivo: deviceIp,
          error: error.message
        });
      }
    }

    const eventosProcesados = EventProcessor.processEvents(allEvents, timeRange.startTime, timeRange.endTime);

    console.log(`\n📈 RESUMEN CONSULTA BIOMÉTRICA:`);
    console.log(`   - Total eventos brutos: ${allEvents.length}`);
    console.log(`   - Eventos procesados para BD: ${eventosProcesados.length}`);
    console.log(`   - Dispositivos con error: ${errors.length}`);

    return {
      eventos: eventosProcesados,
      errors,
      timeRange,
      dispositivos_consultados: CONFIG.devices,
      estadisticas: {
        total_eventos_brutos: allEvents.length,
        total_eventos_procesados: eventosProcesados.length,
        dispositivos_exitosos: CONFIG.devices.length - errors.length,
        dispositivos_con_error: errors.length
      }
    };
  }
}

// Exportar GET method
export async function GET(request) {
  console.log('\n🌐 ========== CONSULTA BIOMÉTRICA ==========');

  const biometricService = new BiometricService();

  try {
    const { searchParams } = new URL(request.url);
    const rango = searchParams.get('rango') || 'hoy';
    const fechaInicio = searchParams.get('fechaInicio');
    const fechaFin = searchParams.get('fechaFin');

    console.log(`📋 Parámetros - Rango: ${rango}, FechaInicio: ${fechaInicio}, FechaFin: ${fechaFin}`);

    if (rango === 'personalizado') {
      if (!fechaInicio || !fechaFin) {
        return NextResponse.json(
          {
            success: false,
            error: 'Para rango personalizado se requieren fechaInicio y fechaFin'
          },
          { status: 400 }
        );
      }
    }

    const result = await biometricService.queryAllDevices(rango, fechaInicio, fechaFin);

    console.log(`\n✅ CONSULTA COMPLETADA: ${result.eventos.length} eventos procesados obtenidos`);

    const response = {
      success: true,
      rango_utilizado: result.timeRange.tag,
      dispositivos_consultados: CONFIG.devices,
      total_eventos: result.estadisticas.total_eventos_procesados,
      eventos: result.eventos
    };

    if (result.errors.length > 0) {
      response.errores = result.errors;
      response.advertencia = 'Algunos dispositivos presentaron errores';
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ ERROR GENERAL:', error.message);
    return NextResponse.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}