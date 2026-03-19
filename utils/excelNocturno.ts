// utils/excelNocturno.ts
import * as XLSX from 'xlsx';
import { EventoNocturno } from '@/components/NocturnoTable';

const formatearFechaExcel = (fechaString: string): string => {
  if (!fechaString) return '';
  try {
    if (fechaString.includes('-') && fechaString.length === 10) {
      const [anio, mes, dia] = fechaString.split('-');
      return `${dia}/${mes}/${anio}`;
    }
    return fechaString;
  } catch {
    return fechaString;
  }
};

const tipoRecargoLabel = (tipo: EventoNocturno['tipoRecargo']): string => {
  if (tipo === 'ambos') return '⚠ Ambas condiciones';
  if (tipo === 'salida_tardia') return 'Salida tardía';
  return 'Entrada temprana';
};

const descargarBuffer = (wb: XLSX.WorkBook, nombreArchivo: string) => {
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombreArchivo}_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

export const descargarExcelNocturnoPage = (
  eventos: EventoNocturno[],
  filtroInfo?: string
) => {
  if (eventos.length === 0) {
    alert('No hay registros para descargar.');
    return;
  }

  // ── Hoja principal ──────────────────────────────────────────────────────────
  const datos = eventos.map(e => ({
    'ID Empleado': e.empleadoId || 'N/A',
    'Nombre': e.nombre || 'Sin nombre',
    'Fecha': formatearFechaExcel(e.fecha || ''),
    'Hora Entrada': e.horaEntrada || '--:--',
    'Entrada antes 06:00': e.esEntradaTemprana ? 'SÍ' : 'No',
    'Min. antes de 06:00': e.esEntradaTemprana ? e.minutosAntesManana : '',
    'Hora Salida': e.horaSalida || '--:--',
    'Salida después 19:00': e.esSalidaTardia ? 'SÍ' : 'No',
    'Min. después de 19:00': e.esSalidaTardia ? e.minutosExtrasNoche : '',
    'Tipo de Recargo': tipoRecargoLabel(e.tipoRecargo),
    'Horas Trabajadas': e.horasTrabajadasFormato || 'N/A',
    'Total Horas (decimal)': e.horasTrabajadas ?? '',
    'Salida Almuerzo': e.horaSalidaAlmuerzo || '--:--',
    'Entrada Almuerzo': e.horaEntradaAlmuerzo || '--:--',
    'Duración Almuerzo': e.duracionAlmuerzo || 'N/A',
    'Campaña/Departamento': e.campaña || 'Sin grupo',
    'Dispositivo': e.dispositivo || 'Desconocido',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(datos);

  ws['!cols'] = [
    { wch: 15 }, // ID
    { wch: 28 }, // Nombre
    { wch: 13 }, // Fecha
    { wch: 14 }, // Hora Entrada
    { wch: 20 }, // Entrada antes 06:00
    { wch: 20 }, // Min. antes de 06:00
    { wch: 13 }, // Hora Salida
    { wch: 22 }, // Salida después 19:00
    { wch: 22 }, // Min. después de 19:00
    { wch: 24 }, // Tipo de Recargo
    { wch: 18 }, // Horas Trabajadas
    { wch: 20 }, // Total decimal
    { wch: 16 }, // Salida almuerzo
    { wch: 16 }, // Entrada almuerzo
    { wch: 16 }, // Duración almuerzo
    { wch: 22 }, // Campaña
    { wch: 16 }, // Dispositivo
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Registros');

  // ── Hoja de resumen ─────────────────────────────────────────────────────────
  const salidaTardia = eventos.filter(e => e.esSalidaTardia);
  const entradaTemprana = eventos.filter(e => e.esEntradaTemprana);
  const ambos = eventos.filter(e => e.tipoRecargo === 'ambos');

  const horasMax = eventos.length > 0
    ? Math.max(...eventos.map(e => e.horasTrabajadas ?? 0))
    : 0;
  const horasPromedio = eventos.length > 0
    ? (eventos.reduce((s, e) => s + (e.horasTrabajadas ?? 0), 0) / eventos.length).toFixed(2)
    : '0';

  // Conteo por campaña
  const conteoCampaña: Record<string, { total: number; salidaTardia: number; entradaTemprana: number; ambos: number; horasSum: number }> = {};
  eventos.forEach(e => {
    const c = e.campaña || 'Sin grupo';
    if (!conteoCampaña[c]) conteoCampaña[c] = { total: 0, salidaTardia: 0, entradaTemprana: 0, ambos: 0, horasSum: 0 };
    conteoCampaña[c].total++;
    conteoCampaña[c].horasSum += e.horasTrabajadas ?? 0;
    if (e.tipoRecargo === 'salida_tardia') conteoCampaña[c].salidaTardia++;
    else if (e.tipoRecargo === 'entrada_temprana') conteoCampaña[c].entradaTemprana++;
    else if (e.tipoRecargo === 'ambos') conteoCampaña[c].ambos++;
  });

  // Top 5 más horas
  const top5 = [...eventos]
    .sort((a, b) => (b.horasTrabajadas ?? 0) - (a.horasTrabajadas ?? 0))
    .slice(0, 5);

  const resumen: (string | number)[][] = [
    ['REPORTE DE RECARGOS — Salida >19:00 o Entrada <06:00 con más de 10h trabajadas'],
    [''],
    ['Fecha de generación:', new Date().toLocaleString('es-CO')],
    ['Total de registros:', eventos.length],
    ['Máximo de horas trabajadas:', `${horasMax}h`],
    ['Promedio de horas:', `${horasPromedio}h`],
    [''],
    ['RESUMEN POR TIPO DE RECARGO'],
    ['Tipo', 'Cantidad'],
    ['🌙 Salida tardía (>19:00)', salidaTardia.length],
    ['🌅 Entrada temprana (<06:00)', entradaTemprana.length],
    ['⚠ Ambas condiciones', ambos.length],
    [''],
    ['DISTRIBUCIÓN POR CAMPAÑA'],
    ['Campaña', 'Total', 'Salida tardía', 'Entrada temprana', 'Ambas', 'Prom. horas'],
    ...Object.entries(conteoCampaña)
      .sort(([, a], [, b]) => b.total - a.total)
      .map(([c, v]) => [
        c,
        v.total,
        v.salidaTardia,
        v.entradaTemprana,
        v.ambos,
        parseFloat((v.horasSum / v.total).toFixed(2)),
      ]),
    [''],
    ['TOP 5 — MÁS HORAS TRABAJADAS'],
    ['Nombre', 'Horas', 'Hora entrada', 'Hora salida', 'Tipo de recargo', 'Campaña'],
    ...top5.map(e => [
      e.nombre,
      e.horasTrabajadasFormato,
      e.horaEntrada,
      e.horaSalida,
      tipoRecargoLabel(e.tipoRecargo),
      e.campaña,
    ]),
  ];

  const wsResumen = XLSX.utils.aoa_to_sheet(resumen);
  wsResumen['!cols'] = [
    { wch: 35 }, { wch: 10 }, { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

  const nombreFiltro = filtroInfo ? `_${filtroInfo}` : '';
  descargarBuffer(wb, `reporte_recargos${nombreFiltro}`);
};