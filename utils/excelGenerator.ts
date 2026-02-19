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

// Función para formatear la fecha a formato DD/MM/YYYY
const formatearFechaExcel = (fechaString: string): string => {
  if (!fechaString) return '';
  
  try {
    // Si la fecha ya viene en formato YYYY-MM-DD, convertirla
    if (fechaString.includes('-') && fechaString.length === 10) {
      const [anio, mes, dia] = fechaString.split('-');
      return `${dia}/${mes}/${anio}`;
    }
    
    // Si viene como fecha ISO (con T), extraer solo la parte de la fecha
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

export const generarExcelDesdeEventos = (eventos: any[], nombreArchivo: string = 'reporte_eventos') => {
  // Transformar datos al formato Excel
  const datosExcel: EventoExcel[] = eventos.map(evento => {
    const fechaFormateada = formatearFechaExcel(evento.fecha || '');
    
    return {
      'ID Empleado': evento.empleadoId || 'N/A',
      'Nombre': evento.nombre || 'Sin nombre',
      'Fecha': fechaFormateada,
      'Hora Entrada': evento.horaEntrada || '--:--',
      'Hora Salida': evento.horaSalida || '--:--',
      'Hora Salida Almuerzo': evento.horaSalidaAlmuerzo || '--:--',
      'Hora Entrada Almuerzo': evento.horaEntradaAlmuerzo || '--:--',
      'Duración Almuerzo': evento.duracionAlmuerzo || 'N/A',
      'Tipo': evento.tipo || 'Registro',
      'Campaña/Departamento': evento.campaña || evento.departamento || 'Sin grupo',
      'Dispositivo': evento.dispositivo || 'Desconocido',
      'Foto URL': evento.foto || ''
    };
  });

  // Crear libro de trabajo
  const wb = XLSX.utils.book_new();
  
  // Crear hoja de trabajo
  const ws = XLSX.utils.json_to_sheet(datosExcel);
  
  // Configurar formato de fecha en Excel
  const rango = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  
  for (let R = rango.s.r + 1; R <= rango.e.r; ++R) {
    const cellAddress = XLSX.utils.encode_cell({ r: R, c: 2 });
    if (ws[cellAddress]) {
      const cellValue = ws[cellAddress].v;
      if (typeof cellValue === 'string' && cellValue.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        ws[cellAddress].z = 'dd/mm/yyyy';
      }
    }
  }
  
  // Ajustar anchos de columnas
  const colWidths = [
    { wch: 15 },  // ID Empleado
    { wch: 25 },  // Nombre
    { wch: 12 },  // Fecha
    { wch: 12 },  // Hora Entrada
    { wch: 12 },  // Hora Salida
    { wch: 18 },  // Hora Salida Almuerzo
    { wch: 18 },  // Hora Entrada Almuerzo
    { wch: 15 },  // Duración Almuerzo
    { wch: 15 },  // Tipo
    { wch: 20 },  // Campaña/Departamento
    { wch: 15 },  // Dispositivo
    { wch: 30 }   // Foto URL
  ];
  
  ws['!cols'] = colWidths;
  
  // Agregar hoja al libro
  XLSX.utils.book_append_sheet(wb, ws, 'Eventos');
  
  // Crear hoja de resumen - CORRECCIÓN DEL ERROR
  if (eventos.length > 0) {
    // Definir tipo explícito para resumenData
    const resumenData: (string | number)[][] = [
      ['RESUMEN DE REPORTE'],
      [''],
      ['Fecha de generación:', new Date().toLocaleString('es-CO')],
      ['Total de eventos:', eventos.length],
      ['Fecha del reporte:', new Date().toLocaleDateString('es-CO')],
      [''],
      ['ESTADÍSTICAS POR CAMPAÑA/DEPARTAMENTO'],
    ];
    
    // Contar por campaña/departamento con tipos explícitos
    const conteoDepartamentos: Record<string, number> = eventos.reduce((acc, evento) => {
      const depto = evento.campaña || evento.departamento || 'Sin grupo';
      acc[depto] = (acc[depto] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // CORRECCIÓN: Tipo explícito para los parámetros
    Object.entries(conteoDepartamentos)
      .sort(([, a]: [string, number], [, b]: [string, number]) => b - a)
      .forEach(([depto, count]: [string, number]) => {
        resumenData.push([depto, count]); // Ahora TypeScript sabe que count es number
      });
    
    resumenData.push(['']);
    resumenData.push(['TIPOS DE REGISTRO']);
    
    // Contar por tipo con tipos explícitos
    const conteoTipos: Record<string, number> = eventos.reduce((acc, evento) => {
      const tipo = evento.tipo || 'Sin tipo';
      acc[tipo] = (acc[tipo] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // CORRECCIÓN: Tipo explícito para los parámetros
    Object.entries(conteoTipos).forEach(([tipo, count]: [string, number]) => {
      resumenData.push([tipo, count]); // Ahora TypeScript sabe que count es number
    });
    
    const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
    wsResumen['!cols'] = [{ wch: 30 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
  }
  
  // Generar archivo
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  
  // Crear blob y descargar
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombreArchivo}_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

export const descargarExcel = (eventos: any[], filtroInfo?: string) => {
  const nombreBase = 'reporte_biometricos';
  const nombreFiltro = filtroInfo ? `_${filtroInfo}` : '';
  const nombreArchivo = `${nombreBase}${nombreFiltro}_${new Date().toISOString().split('T')[0]}`;
  
  generarExcelDesdeEventos(eventos, nombreArchivo);
};