// app/api/nocturno/route.js

import { NextResponse } from 'next/server';
import { Pool } from 'pg';

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

function horaAMinutos(hora) {
  if (!hora) return null;
  const partes = hora.split(':');
  if (partes.length < 2) return null;
  const h = parseInt(partes[0], 10);
  const m = parseInt(partes[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function calcularHorasTrabajadas(horaEntrada, horaSalida) {
  const minEntrada = horaAMinutos(horaEntrada);
  const minSalida = horaAMinutos(horaSalida);
  if (minEntrada === null || minSalida === null) return null;
  const diff = minSalida - minEntrada;
  if (diff <= 0) return null;
  return diff / 60;
}

function minutosExtrasNoche(horaSalida) {
  const min = horaAMinutos(horaSalida);
  if (min === null) return 0;
  return Math.max(0, min - 19 * 60);
}

function minutosAntesManana(horaEntrada) {
  const min = horaAMinutos(horaEntrada);
  if (min === null) return 0;
  // minutos antes de las 06:00 (360 min)
  return Math.max(0, 360 - min);
}

function formatearHoras(horas) {
  if (horas === null) return 'N/A';
  const h = Math.floor(horas);
  const m = Math.round((horas - h) * 60);
  return `${h}h ${m}m`;
}

function formatearEventosNocturno(registros) {
  return registros.map(registro => {
    const horaEntrada = registro.hora_entrada || '';
    const horaSalida = registro.hora_salida || '';
    const horasTrabajadas = calcularHorasTrabajadas(horaEntrada, horaSalida);
    const minExtrasNoche = minutosExtrasNoche(horaSalida);
    const minAntesManana = minutosAntesManana(horaEntrada);

    // Determinar tipo de recargo
    const esSalidaTardia = horaAMinutos(horaSalida) > 19 * 60;
    const esEntradaTemprana = horaAMinutos(horaEntrada) !== null && horaAMinutos(horaEntrada) < 6 * 60;
    const tipoRecargo = esSalidaTardia && esEntradaTemprana
      ? 'ambos'
      : esSalidaTardia
        ? 'salida_tardia'
        : 'entrada_temprana';

    // Almuerzo
    let duracionAlmuerzo = '';
    if (registro.hora_salida_almuerzo && registro.hora_entrada_almuerzo) {
      const minSalidaAlm = horaAMinutos(registro.hora_salida_almuerzo);
      const minEntradaAlm = horaAMinutos(registro.hora_entrada_almuerzo);
      if (minSalidaAlm !== null && minEntradaAlm !== null) {
        const dur = minEntradaAlm - minSalidaAlm;
        if (dur > 0) {
          const hA = Math.floor(dur / 60);
          const mA = dur % 60;
          duracionAlmuerzo = hA > 0 ? `${hA}h ${mA}m` : `${mA}m`;
        }
      }
    }

    return {
      id: registro.id,
      empleadoId: registro.documento || '',
      nombre: registro.nombre || 'Sin nombre',
      fecha: registro.fecha ? new Date(registro.fecha).toISOString().split('T')[0] : '',
      horaEntrada,
      horaSalida,
      horaSalidaAlmuerzo: registro.hora_salida_almuerzo || '',
      horaEntradaAlmuerzo: registro.hora_entrada_almuerzo || '',
      duracionAlmuerzo,
      campaña: registro.campaña || 'Sin campaña',
      dispositivo: registro.dispositivo_ip || 'Desconocido',
      horasTrabajadas: horasTrabajadas !== null ? parseFloat(horasTrabajadas.toFixed(2)) : null,
      horasTrabajadasFormato: formatearHoras(horasTrabajadas),
      minutosExtrasNoche: minExtrasNoche,
      minutosAntesManana: minAntesManana,
      esSalidaTardia,
      esEntradaTemprana,
      tipoRecargo,
      tipo: 'Biométrico',
      subtipo: 'Asistencia',
    };
  });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const rango = url.searchParams.get('rango') || 'hoy';
    const fechaInicio = url.searchParams.get('fechaInicio');
    const fechaFin = url.searchParams.get('fechaFin');
    const departamento = url.searchParams.get('departamento');
    const ejecutivo = url.searchParams.get('ejecutivo');
    const horasMinimas = parseFloat(url.searchParams.get('horasMinimas') || '10');
    const horaLimiteSalida = parseInt(url.searchParams.get('horaLimite') || '19');
    const horaLimiteEntrada = parseInt(url.searchParams.get('horaEntrada') || '6');

    // Registros con entrada Y salida, que cumplan AL MENOS UNA condición:
    // - salida después de las 19:00
    // - entrada antes de las 06:00
    let query = `
      SELECT id, documento, nombre, fecha,
             hora_entrada, hora_salida,
             hora_salida_almuerzo, hora_entrada_almuerzo,
             dispositivo_ip, campaña
      FROM attendance_events
      WHERE hora_entrada IS NOT NULL
        AND hora_salida IS NOT NULL
        AND (
          EXTRACT(HOUR FROM hora_salida::time) >= $1
          OR EXTRACT(HOUR FROM hora_entrada::time) < $2
        )
    `;

    const params = [horaLimiteSalida, horaLimiteEntrada];
    let paramIndex = 3;

    if (rango === 'hoy') {
      query += ` AND fecha = CURRENT_DATE`;
    } else if (rango === '7dias') {
      query += ` AND fecha >= CURRENT_DATE - INTERVAL '6 days'`;
    } else if (rango === '30dias') {
      query += ` AND fecha >= CURRENT_DATE - INTERVAL '29 days'`;
    } else if (rango === 'personalizado' && fechaInicio && fechaFin) {
      const fechaInicioDate = new Date(fechaInicio);
      const fechaFinDate = new Date(fechaFin);
      if (isNaN(fechaInicioDate.getTime()) || isNaN(fechaFinDate.getTime())) {
        return NextResponse.json({ success: false, error: 'Fechas inválidas', eventos: [] }, { status: 400 });
      }
      if (fechaInicioDate > fechaFinDate) {
        return NextResponse.json({ success: false, error: 'La fecha de inicio no puede ser posterior a la fecha fin', eventos: [] }, { status: 400 });
      }
      query += ` AND fecha BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(fechaInicio, fechaFin);
      paramIndex += 2;
    }

    if (departamento && departamento !== 'Todos' && departamento !== 'todos') {
      query += ` AND campaña ILIKE $${paramIndex}`;
      params.push(`%${departamento}%`);
      paramIndex++;
    }

    if (ejecutivo) {
      query += ` AND nombre ILIKE $${paramIndex}`;
      params.push(`%${ejecutivo}%`);
      paramIndex++;
    }

    query += ` ORDER BY fecha DESC, hora_salida DESC`;

    const result = await pool.query(query, params);
    let eventosFormateados = formatearEventosNocturno(result.rows);

    // Filtrar: solo los que tienen más de N horas trabajadas
    eventosFormateados = eventosFormateados.filter(
      e => e.horasTrabajadas !== null && e.horasTrabajadas >= horasMinimas
    );

    // Estadísticas por campaña
    const porCampaña = {};
    eventosFormateados.forEach(e => {
      const c = e.campaña || 'Sin campaña';
      if (!porCampaña[c]) porCampaña[c] = { total: 0, horasSum: 0, salidaTardia: 0, entradaTemprana: 0, ambos: 0 };
      porCampaña[c].total++;
      porCampaña[c].horasSum += e.horasTrabajadas || 0;
      if (e.tipoRecargo === 'salida_tardia') porCampaña[c].salidaTardia++;
      else if (e.tipoRecargo === 'entrada_temprana') porCampaña[c].entradaTemprana++;
      else if (e.tipoRecargo === 'ambos') porCampaña[c].ambos++;
    });
    Object.keys(porCampaña).forEach(c => {
      porCampaña[c].horasPromedio = parseFloat((porCampaña[c].horasSum / porCampaña[c].total).toFixed(2));
      delete porCampaña[c].horasSum;
    });

    const horasMax = eventosFormateados.length > 0
      ? Math.max(...eventosFormateados.map(e => e.horasTrabajadas || 0))
      : 0;
    const horasPromedio = eventosFormateados.length > 0
      ? parseFloat((eventosFormateados.reduce((s, e) => s + (e.horasTrabajadas || 0), 0) / eventosFormateados.length).toFixed(2))
      : 0;

    // Conteos globales por tipo
    const totalSalidaTardia = eventosFormateados.filter(e => e.esSalidaTardia).length;
    const totalEntradaTemprana = eventosFormateados.filter(e => e.esEntradaTemprana).length;
    const totalAmbos = eventosFormateados.filter(e => e.tipoRecargo === 'ambos').length;

    const campañasResult = await pool.query(
      `SELECT DISTINCT campaña FROM attendance_events WHERE campaña IS NOT NULL AND campaña != '' ORDER BY campaña`
    );

    return NextResponse.json({
      success: true,
      eventos: eventosFormateados,
      total: eventosFormateados.length,
      estadisticas: {
        porCampaña,
        horasMax,
        horasPromedio,
        totalSalidaTardia,
        totalEntradaTemprana,
        totalAmbos,
        horaLimiteUsada: horaLimiteSalida,
        horaEntradaUsada: horaLimiteEntrada,
        horasMinimasUsadas: horasMinimas,
      },
      campañasDisponibles: campañasResult.rows.map(r => r.campaña),
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Error en /api/nocturno:', error);
    return NextResponse.json({ success: false, error: error.message, eventos: [] }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';