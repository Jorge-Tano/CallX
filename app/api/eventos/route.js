import { NextResponse } from 'next/server';
import DigestFetch from 'digest-fetch';

// Permite conexión HTTPS sin validar certificado (útil para dispositivos Hikvision)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

/**
 * Configuración principal del servicio de consulta de eventos.
 */
const CONFIG = {
  username: "admin",
  password: "Tattered3483",
  deviceIp: "172.31.0.229",
  maxResults: 30,         // Límite de eventos por lote
  maxRetries: 10          // Límite máximo de iteraciones en consulta por rango
};

/**
 * Convierte fechas a formato requerido por el API de Hikvision.
 */
const formatHikvisionDate = (date) =>
  date.toISOString().replace(/\.\d{3}Z$/, '');

/**
 * Crea un cliente de autenticación Digest.
 */
const createDigestClient = () =>
  new DigestFetch(CONFIG.username, CONFIG.password, {
    disableRetry: false,
    algorithm: 'MD5'
  });

/**
 * Cliente que realiza peticiones al endpoint Hikvision ACS Event.
 */
class HikvisionClient {
  constructor(client, deviceIp) {
    this.client = client;
    this.baseUrl = `https://${deviceIp}/ISAPI/AccessControl/AcsEvent?format=json`;
  }

  /**
   * Realiza una solicitud POST para obtener eventos según un rango.
   */
  async fetchEvents(searchCondition) {
    const body = {
      AcsEventCond: {
        searchID: searchCondition.tag,
        searchResultPosition: searchCondition.position,
        maxResults: searchCondition.maxResults,
        major: 5,   // Código de eventos ACS
        minor: 0,   // Se especifica luego con filtrado
        startTime: searchCondition.startTime,
        endTime: searchCondition.endTime
      }
    };

    const res = await this.client.fetch(this.baseUrl, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    // Manejo de errores HTTP
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Error ${res.status}: ${errorText}`);
    }

    return res.json();
  }
}

/**
 * Servicio responsable de:
 * - Consultar eventos en rangos
 * - Aplicar paginación por lotes
 * - Consultar meses completos o el año
 */
class EventQueryService {
  constructor(hikvisionClient) {
    this.client = hikvisionClient;
  }

  /**
   * Consulta eventos dentro de un rango de fechas.
   * Implementa:
   *  - paginación por posición
   *  - límite de reintentos/lotes
   */
  async queryEventsByRange(startTime, endTime, tag = 'consulta') {
    let eventos = [];
    let position = 0;
    let intento = 1;

    while (intento <= CONFIG.maxRetries) {
      const searchCondition = {
        tag,
        position,
        maxResults: CONFIG.maxResults,
        startTime,
        endTime
      };

      const data = await this.client.fetchEvents(searchCondition);
      const eventosLote = data?.AcsEvent?.InfoList || [];

      if (eventosLote.length === 0) break; // no hay más eventos

      eventos = [...eventos, ...eventosLote];
      position += eventosLote.length;
      intento++;

      // Último lote si viene incompleto
      if (eventosLote.length < CONFIG.maxResults) break;

      // Pausa ligera entre solicitudes para evitar bloqueo del dispositivo
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return eventos;
  }

  /**
   * Consulta todos los meses de un año, en orden.
   */
  async queryMonthlyEvents(year) {
    const today = new Date();
    let todosLosEventosAnuales = [];

    for (let month = 0; month < 12; month++) {
      const inicioMes = new Date(year, month, 1);
      const finMes = new Date(year, month + 1, 0, 23, 59, 59);

      // Omitir meses futuros
      if (inicioMes > today) continue;

      const endOfMonth = finMes > today ? today : finMes;

      const startTimeMes = formatHikvisionDate(inicioMes);
      const endTimeMes = formatHikvisionDate(endOfMonth);

      try {
        const eventosMes = await this.queryEventsByRange(
          startTimeMes,
          endTimeMes,
          `mes-${month + 1}`
        );

        todosLosEventosAnuales = [...todosLosEventosAnuales, ...eventosMes];
        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (error) {
        console.error(`Error en mes ${month + 1}:`, error.message);
      }
    }

    return todosLosEventosAnuales;
  }

  /**
   * Consulta todos los eventos del mes actual.
   */
  async queryCurrentMonth() {
    const today = new Date();
    const inicioMes = new Date(today.getFullYear(), today.getMonth(), 1);
    const finMes = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);

    const startTime = formatHikvisionDate(inicioMes);
    const endTime = formatHikvisionDate(finMes);

    return this.queryEventsByRange(startTime, endTime, 'mes-completo');
  }

  /**
   * Consulta los eventos del día actual.
   */
  async queryToday() {
    const today = new Date();
    const inicioDia = new Date(today);
    inicioDia.setHours(0, 0, 0, 0);

    const finDia = new Date(today);
    finDia.setHours(23, 59, 59, 999);

    const startTime = formatHikvisionDate(inicioDia);
    const endTime = formatHikvisionDate(finDia);

    return this.queryEventsByRange(startTime, endTime, 'hoy');
  }
}

/**
 * Procesa y transforma eventos:
 * - Filtra accesos (minor === 75)
 * - Normaliza estructura para frontend
 * - Ordena por hora descendente
 */
class EventProcessor {
  static filterAndTransformEvents(eventos) {
    return eventos
      .filter(evento => evento.minor === 75)  // Eventos de acceso
      .map(evento => {
        const fechaObj = new Date(evento.time);
        return {
          nombre: evento.name,
          empleadoId: evento.employeeNoString,
          hora: evento.time,
          fecha: fechaObj.toLocaleDateString("es-CO"),
          tipo: evento.label,
          foto: evento.pictureURL
        };
      })
      .sort((a, b) =>
        new Date(b.hora).getTime() - new Date(a.hora).getTime()
      );
  }
}

/**
 * Endpoint principal:
 * - Determina el periodo solicitado
 * - Consulta y filtra eventos
 * - Devuelve respuesta JSON limpia
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const periodo = searchParams.get('periodo') || 'hoy';

    const digestClient = createDigestClient();
    const hikvisionClient = new HikvisionClient(digestClient, CONFIG.deviceIp);
    const queryService = new EventQueryService(hikvisionClient);

    let todosLosEventos = [];

    switch (periodo) {
      case 'año': {
        const currentYear = new Date().getFullYear();
        todosLosEventos = await queryService.queryMonthlyEvents(currentYear);
        break;
      }

      case 'mes': {
        todosLosEventos = await queryService.queryCurrentMonth();
        break;
      }

      case 'hoy':
      default: {
        todosLosEventos = await queryService.queryToday();
        break;
      }
    }

    const eventosFiltrados = EventProcessor.filterAndTransformEvents(todosLosEventos);

    return NextResponse.json({
      success: true,
      periodo,
      total: todosLosEventos.length,
      accesos: eventosFiltrados.length,
      eventos: eventosFiltrados
    });

  } catch (error) {
    console.error("Error al consultar:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
