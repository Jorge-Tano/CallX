// /utils/excelGenerator.ts
import * as XLSX from 'xlsx';

export interface EventoExcel {
  'ID Empleado': string;
  'Nombre': string;
  'Fecha': string;
  'Hora Entrada': string;
  'Hora Salida': string;
  'Hora Salida Almuerzo': string;
  'Hora Entrada Almuerzo': string;
  'Duración Almuerzo': string;
  'Tipo': string;
  'Campaña/Departamento': string;
  'Dispositivo': string;
  'Foto URL': string;
}

export interface EventoNocheExcel extends EventoExcel {
  'Minutos Después de 19:00': number;
}

// Hora límite en minutos desde medianoche (19:00 = 1140 min)
const HORA_LIMITE_NOCHE = 19 * 60;

// Convierte "HH:MM" a minutos totales desde medianoche
const horaAMinutos = (hora: string): number | null => {
  if (!hora || hora === '--:--' || hora === '') return null;
  const partes = hora.split(':');
  if (partes.length < 2) return null;
  const h = parseInt(partes[0], 10);
  const m = parseInt(partes[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
};

// Retorna true si la horaSalida es posterior a las 19:00
export const salidaDespuesDeNoche = (horaSalida: string): boolean => {
  const minutos = horaAMinutos(horaSalida);
  if (minutos === null) return false;
  return minutos > HORA_LIMITE_NOCHE;
};

// Calcula cuántos minutos pasó de las 19:00
const minutosExtrasNoche = (horaSalida: string): number => {
  const minutos = horaAMinutos(horaSalida);
  if (minutos === null) return 0;
  return Math.max(0, minutos - HORA_LIMITE_NOCHE);
};

// Función para formatear la fecha a formato DD/MM/YYYY
const formatearFechaExcel = (fechaString: string): string => {
  if (!fechaString) return '';
  try {
    if (fechaString.includes('-') && fechaString.length === 10) {
      const [anio, mes, dia] = fechaString.split('-');
      return `${dia}/${mes}/${anio}`;
    }
    if (fechaString.includes('T')) {
      const fecha = new Date(fechaString);
      if (isNaN(fecha.getTime())) return fechaString;
      const dia = fecha.getDate().toString().padStart(2, '0');
      const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
      const anio = fecha.getFullYear();
      return `${dia}/${mes}/${anio}`;
    }
    return fechaString;
  } catch (error) {
    console.error('Error formateando fecha:', fechaString, error);
    return fechaString;
  }
};

// Anchos de columna base (compartidos por ambos reportes)
const COL_WIDTHS_BASE = [
  { wch: 15 }, // ID Empleado
  { wch: 25 }, // Nombre
  { wch: 12 }, // Fecha
  { wch: 12 }, // Hora Entrada
  { wch: 12 }, // Hora Salida
  { wch: 18 }, // Hora Salida Almuerzo
  { wch: 18 }, // Hora Entrada Almuerzo
  { wch: 15 }, // Duración Almuerzo
  { wch: 15 }, // Tipo
  { wch: 20 }, // Campaña/Departamento
  { wch: 15 }, // Dispositivo
  { wch: 30 }, // Foto URL
];

// Convierte un evento crudo al formato de fila base (compartido)
const eventoAFilaBase = (evento: any): EventoExcel => ({
  'ID Empleado': evento.empleadoId || 'N/A',
  'Nombre': evento.nombre || 'Sin nombre',
  'Fecha': formatearFechaExcel(evento.fecha || ''),
  'Hora Entrada': evento.horaEntrada || '--:--',
  'Hora Salida': evento.horaSalida || '--:--',
  'Hora Salida Almuerzo': evento.horaSalidaAlmuerzo || '--:--',
  'Hora Entrada Almuerzo': evento.horaEntradaAlmuerzo || '--:--',
  'Duración Almuerzo': evento.duracionAlmuerzo || 'N/A',
  'Tipo': evento.tipo || 'Registro',
  'Campaña/Departamento': evento.campaña || evento.departamento || 'Sin grupo',
  'Dispositivo': evento.dispositivo || 'Desconocido',
  'Foto URL': evento.foto || '',
});

// Aplica formato de fecha en la columna índice 2 de una hoja
const aplicarFormatoFecha = (ws: XLSX.WorkSheet) => {
  const rango = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = rango.s.r + 1; R <= rango.e.r; ++R) {
    const cell = XLSX.utils.encode_cell({ r: R, c: 2 });
    if (ws[cell]?.v && typeof ws[cell].v === 'string' && ws[cell].v.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      ws[cell].z = 'dd/mm/yyyy';
    }
  }
};

// Genera y dispara la descarga del workbook
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

// ─── Reporte COMPLETO ─────────────────────────────────────────────────────────

export const generarExcelDesdeEventos = (
  eventos: any[],
  nombreArchivo: string = 'reporte_eventos'
) => {
  const datosExcel: EventoExcel[] = eventos.map(eventoAFilaBase);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(datosExcel);
  aplicarFormatoFecha(ws);
  ws['!cols'] = COL_WIDTHS_BASE;
  XLSX.utils.book_append_sheet(wb, ws, 'Eventos');

  // Hoja de resumen
  if (eventos.length > 0) {
    const resumenData: (string | number)[][] = [
      ['RESUMEN DE REPORTE'],
      [''],
      ['Fecha de generación:', new Date().toLocaleString('es-CO')],
      ['Total de eventos:', eventos.length],
      [''],
      ['ESTADÍSTICAS POR CAMPAÑA/DEPARTAMENTO'],
    ];

    const conteoDepartamentos: Record<string, number> = eventos.reduce((acc, evento) => {
      const depto = evento.campaña || evento.departamento || 'Sin grupo';
      acc[depto] = (acc[depto] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(conteoDepartamentos)
      .sort(([, a]: [string, number], [, b]: [string, number]) => b - a)
      .forEach(([depto, count]: [string, number]) => resumenData.push([depto, count]));

    resumenData.push([''], ['TIPOS DE REGISTRO']);

    const conteoTipos: Record<string, number> = eventos.reduce((acc, evento) => {
      const tipo = evento.tipo || 'Sin tipo';
      acc[tipo] = (acc[tipo] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(conteoTipos).forEach(([tipo, count]: [string, number]) =>
      resumenData.push([tipo, count])
    );

    const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
    wsResumen['!cols'] = [{ wch: 30 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
  }

  descargarBuffer(wb, nombreArchivo);
};

// ─── Reporte NOCTURNO ─────────────────────────────────────────────────────────

/**
 * Filtra los eventos cuya hora de salida es posterior a las 19:00.
 * Genera un Excel con exactamente las mismas columnas del reporte normal
 * más "Minutos Después de 19:00" como última columna.
 * Los registros se ordenan de mayor a menor tiempo extra.
 */
export const generarExcelNocturno = (
  eventos: any[],
  nombreArchivo: string = 'reporte_nocturno'
) => {
  const eventosFiltrados = eventos.filter(e => salidaDespuesDeNoche(e.horaSalida));

  if (eventosFiltrados.length === 0) {
    alert('No hay empleados con salida después de las 19:00 en los datos actuales.');
    return;
  }

  // Mismas columnas base + columna extra al final
  const datosExcel: EventoNocheExcel[] = eventosFiltrados
    .sort((a, b) => minutosExtrasNoche(b.horaSalida) - minutosExtrasNoche(a.horaSalida))
    .map(evento => ({
      ...eventoAFilaBase(evento),
      'Minutos Después de 19:00': minutosExtrasNoche(evento.horaSalida),
    }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(datosExcel);
  aplicarFormatoFecha(ws);

  // Asegurar tipo numérico en la columna extra (índice 12)
  const rango = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = rango.s.r + 1; R <= rango.e.r; ++R) {
    const cellMin = XLSX.utils.encode_cell({ r: R, c: 12 });
    if (ws[cellMin]) ws[cellMin].t = 'n';
  }

  ws['!cols'] = [
    ...COL_WIDTHS_BASE,
    { wch: 22 }, // Minutos Después de 19:00
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Salidas Nocturnas');

  // Hoja de resumen nocturno
  const resumenData: (string | number)[][] = [
    ['REPORTE DE SALIDAS DESPUÉS DE 19:00'],
    [''],
    ['Fecha de generación:', new Date().toLocaleString('es-CO')],
    ['Total empleados:', eventosFiltrados.length],
    [''],
    ['DISTRIBUCIÓN POR CAMPAÑA'],
  ];

  const conteoCampaña: Record<string, number> = eventosFiltrados.reduce((acc, e) => {
    const c = e.campaña || 'Sin grupo';
    acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(conteoCampaña)
    .sort(([, a]: [string, number], [, b]: [string, number]) => b - a)
    .forEach(([c, count]) => resumenData.push([c, count]));

  resumenData.push([''], ['TOP 5 SALIDAS MÁS TARDÍAS']);
  datosExcel.slice(0, 5).forEach(e =>
    resumenData.push([e['Nombre'], e['Hora Salida'], `+${e['Minutos Después de 19:00']} min`])
  );

  const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
  wsResumen['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen Nocturno');

  descargarBuffer(wb, nombreArchivo);
};

// ─── Exports públicos ─────────────────────────────────────────────────────────

export const descargarExcel = (eventos: any[], filtroInfo?: string) => {
  const nombreFiltro = filtroInfo ? `_${filtroInfo}` : '';
  generarExcelDesdeEventos(eventos, `reporte_biometricos${nombreFiltro}`);
};

export const descargarExcelNocturno = (eventos: any[], filtroInfo?: string) => {
  const nombreFiltro = filtroInfo ? `_${filtroInfo}` : '';
  generarExcelNocturno(eventos, `reporte_nocturno_19h${nombreFiltro}`);
};