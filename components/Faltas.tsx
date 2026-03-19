// components/Faltas.tsx
"use client";

import { useState, useEffect, useMemo } from 'react';

interface Falta {
  documento: string;
  nombre: string;
  fecha: string;
  campana: string;
  estado: string;
  gravedad: string;
  horas: {
    entrada: string;
    salida: string;
    salidaAlmuerzo: string;
    entradaAlmuerzo: string;
  };
  almuerzo: {
    estado: string;
    mensaje: string;
    tieneProblema: boolean;
    duracion?: number;
  };
  dispositivo: string;
  ultimaActualizacion: string;
}

interface Estadisticas {
  totalRegistros: number;
  totalIncompletos: number;
  porEstado: Record<string, number>;
  porGravedad: {
    NINGUNA: number;
    ALTA: number;
    MEDIA: number;
    BAJA: number;
  };
  almuerzos: {
    completos: number;
    incompletos: number;
    noRegistrados: number;
    noAplica: number;
    cortos: number;
    largos: number;
    normales: number;
  };
}

interface FaltasProps {
  fechaInicial?: string;
  mostrarSoloHoy?: boolean;
}

export default function Faltas({ 
  fechaInicial,
  mostrarSoloHoy = false 
}: FaltasProps) {
  const getFechaAyer = () => {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    return ayer.toISOString().split('T')[0];
  };

  const getFechaHoy = () => new Date().toISOString().split('T')[0];

  const fechaDefault = mostrarSoloHoy ? getFechaAyer() : (fechaInicial || getFechaAyer());

  const [fechaInicio, setFechaInicio] = useState(fechaDefault);
  const [fechaFin, setFechaFin] = useState(fechaDefault);
  const [todosRegistros, setTodosRegistros] = useState<Falta[]>([]);
  const [estadisticas, setEstadisticas] = useState<Estadisticas | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [esRango, setEsRango] = useState(false);
  
  // Filtros
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [filtroGravedad, setFiltroGravedad] = useState<string>('');
  const [busqueda, setBusqueda] = useState<string>('');

  const coloresGravedad = {
    ALTA: 'bg-gradient-to-r from-red-600 to-red-500 border-red-500/50 text-white',
    MEDIA: 'bg-gradient-to-r from-yellow-600 to-yellow-500 border-yellow-500/50 text-white',
    BAJA: 'bg-gradient-to-r from-blue-600 to-blue-500 border-blue-500/50 text-white',
    NINGUNA: 'bg-gradient-to-r from-green-600 to-green-500 border-green-500/50 text-white'
  };

  const coloresAlmuerzo = {
    NORMAL: 'bg-gradient-to-r from-green-600 to-green-500 border-green-500/50 text-white',
    CURTO: 'bg-gradient-to-r from-yellow-600 to-yellow-500 border-yellow-500/50 text-white',
    LARGO: 'bg-gradient-to-r from-orange-600 to-orange-500 border-orange-500/50 text-white',
    INCOMPLETO: 'bg-gradient-to-r from-red-600 to-red-500 border-red-500/50 text-white',
    NO_REGISTRADO: 'bg-gradient-to-r from-slate-600 to-slate-500 border-slate-500/50 text-white',
    NO_APLICA: 'bg-gradient-to-r from-slate-500 to-slate-400 border-slate-400/50 text-white',
    ERROR: 'bg-gradient-to-r from-purple-600 to-purple-500 border-purple-500/50 text-white',
    DESCONOCIDO: 'bg-gradient-to-r from-gray-600 to-gray-500 border-gray-500/50 text-white'
  };

  const getEstadoColor = (estado: string) => {
    const colores: Record<string, string> = {
      'ENTRADA_SIN_SALIDA': 'bg-gradient-to-r from-red-700 to-red-600 border-red-600/50',
      'SALIDA_SIN_ENTRADA': 'bg-gradient-to-r from-orange-700 to-orange-600 border-orange-600/50',
      'SIN_ALMUERZO': 'bg-gradient-to-r from-yellow-700 to-yellow-600 border-yellow-600/50',
      'SOLO_ALMUERZO': 'bg-gradient-to-r from-pink-700 to-pink-600 border-pink-600/50',
      'SIN_MARCAS': 'bg-gradient-to-r from-slate-700 to-slate-600 border-slate-600/50',
      'FALTA_ENTRADA_ALMUERZO': 'bg-gradient-to-r from-yellow-700 to-yellow-600 border-yellow-600/50',
      'FALTA_SALIDA_ALMUERZO': 'bg-gradient-to-r from-yellow-700 to-yellow-600 border-yellow-600/50',
      'OTRO': 'bg-gradient-to-r from-gray-700 to-gray-600 border-gray-600/50'
    };
    return colores[estado] || 'bg-gradient-to-r from-slate-700 to-slate-600 border-slate-600/50';
  };

  const getEstadoNombre = (estado: string) => {
    const nombres: Record<string, string> = {
      'ENTRADA_SIN_SALIDA': 'Entrada sin salida',
      'SALIDA_SIN_ENTRADA': 'Salida sin entrada',
      'SIN_ALMUERZO': 'Sin almuerzo',
      'SOLO_ALMUERZO': 'Solo almuerzo',
      'SIN_MARCAS': 'Sin registros',
      'FALTA_ENTRADA_ALMUERZO': 'Falta entrada almuerzo',
      'FALTA_SALIDA_ALMUERZO': 'Falta salida almuerzo',
      'OTRO': 'Otro'
    };
    return nombres[estado] || estado;
  };

  const formatearFecha = (fechaStr: string) => {
    const fechaObj = new Date(fechaStr + 'T00:00:00');
    const opciones: Intl.DateTimeFormatOptions = { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    };
    return fechaObj.toLocaleDateString('es-ES', opciones);
  };

  const formatearRango = () => {
    if (fechaInicio === fechaFin) return formatearFecha(fechaInicio);
    return `${formatearFecha(fechaInicio)} — ${formatearFecha(fechaFin)}`;
  };

  const cargarFaltas = async () => {
    if (!fechaInicio || !fechaFin) return;
    if (fechaFin < fechaInicio) {
      setError('La fecha fin no puede ser anterior a la fecha inicio');
      return;
    }

    setCargando(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        fechaInicio,
        fechaFin
      });

      const response = await fetch(`/api/eventos/faltas?${params}`);
      
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('text/html')) {
        throw new Error('La API devolvió HTML en lugar de JSON');
      }
      
      const data = await response.json();

      if (data.success) {
        setTodosRegistros(data.registros || []);
        setEstadisticas(data.estadisticas);
        setEsRango(data.esRango || false);
        setFiltroEstado('');
        setFiltroGravedad('');
        setBusqueda('');
      } else {
        setError(data.error || 'Error al cargar faltas');
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (fechaInicio && fechaFin) {
      cargarFaltas();
    }
  }, []);

  // Aplicar filtros en frontend
  const registrosFiltrados = useMemo(() => {
    return todosRegistros.filter(registro => {
      if (filtroEstado && registro.estado !== filtroEstado) return false;
      if (filtroGravedad && registro.gravedad !== filtroGravedad) return false;
      if (busqueda) {
        const termino = busqueda.toLowerCase();
        const nombre = registro.nombre?.toLowerCase() || '';
        const documento = registro.documento?.toLowerCase() || '';
        if (!nombre.includes(termino) && !documento.includes(termino)) return false;
      }
      return true;
    });
  }, [todosRegistros, filtroEstado, filtroGravedad, busqueda]);

  const estadisticasFiltradas = useMemo(() => {
    const stats = {
      totalRegistros: registrosFiltrados.length,
      porEstado: {} as Record<string, number>,
      porGravedad: { NINGUNA: 0, ALTA: 0, MEDIA: 0, BAJA: 0 },
      almuerzos: { completos: 0, incompletos: 0, noRegistrados: 0, noAplica: 0, cortos: 0, largos: 0, normales: 0 }
    };

    registrosFiltrados.forEach(registro => {
      stats.porEstado[registro.estado] = (stats.porEstado[registro.estado] || 0) + 1;
      switch (registro.almuerzo?.estado) {
        case 'NORMAL': stats.almuerzos.normales++; break;
        case 'CURTO': stats.almuerzos.cortos++; break;
        case 'LARGO': stats.almuerzos.largos++; break;
        case 'INCOMPLETO': stats.almuerzos.incompletos++; break;
        case 'NO_REGISTRADO': stats.almuerzos.noRegistrados++; break;
        case 'NO_APLICA': stats.almuerzos.noAplica++; break;
      }
      if (registro.horas.salidaAlmuerzo !== '--:--' && registro.horas.entradaAlmuerzo !== '--:--') {
        stats.almuerzos.completos++;
      }
    });

    return stats;
  }, [registrosFiltrados]);

  const estadosDisponibles = useMemo(() => {
    if (!estadisticas?.porEstado) return [];
    return Object.entries(estadisticas.porEstado)
      .map(([estado, cantidad]) => ({
        id: estado,
        nombre: getEstadoNombre(estado),
        count: cantidad,
        porcentaje: Math.round((cantidad / (estadisticas?.totalIncompletos || 1)) * 100)
      }))
      .sort((a, b) => b.count - a.count);
  }, [estadisticas]);

  const recomendaciones = useMemo(() => {
    const recs = [];
    if (!estadisticasFiltradas.porGravedad) return recs;
    
    if (estadisticasFiltradas.porGravedad.ALTA > 0) {
      recs.push({
        tipo: 'URGENTE',
        mensaje: `${estadisticasFiltradas.porGravedad.ALTA} empleados con faltas graves (entrada/salida incompleta)`,
        accion: 'Notificar inmediatamente a RRHH'
      });
    }
    if (estadisticasFiltradas.almuerzos.cortos > 0) {
      recs.push({
        tipo: 'REVISIÓN',
        mensaje: `${estadisticasFiltradas.almuerzos.cortos} empleados con almuerzos muy cortos (<30 min)`,
        accion: 'Verificar cumplimiento de tiempo de almuerzo'
      });
    }
    if (estadisticasFiltradas.almuerzos.largos > 0) {
      recs.push({
        tipo: 'REVISIÓN',
        mensaje: `${estadisticasFiltradas.almuerzos.largos} empleados con almuerzos muy largos (>2h)`,
        accion: 'Revisar tiempos de almuerzo extendidos'
      });
    }
    if (estadisticasFiltradas.porEstado.SIN_MARCAS > 0) {
      recs.push({
        tipo: 'ATENCIÓN',
        mensaje: `${estadisticasFiltradas.porEstado.SIN_MARCAS} empleados sin registros de asistencia`,
        accion: 'Verificar inasistencias'
      });
    }
    return recs;
  }, [estadisticasFiltradas]);

  return (
    <div className="p-4">
      {/* Header */}
      <div className="mb-4 p-6 pt-4 pb-3 bg-gradient-to-r from-slate-600 via-emerald-600 to-slate-700 rounded-lg shadow-lg border border-slate-500/30">
        
        {/* Título y botón */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-white">Reporte de Faltas y Almuerzos</h1>
              {fechaInicio && (
                <span className="text-sm font-medium text-emerald-200 bg-emerald-900/40 px-3 py-1 rounded-full border border-emerald-500/30">
                  {formatearRango()}
                </span>
              )}
            </div>
            <button
              onClick={cargarFaltas}
              disabled={cargando}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {cargando ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Actualizando...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Actualizar
                </>
              )}
            </button>
          </div>
        </div>

        {/* Controles */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
          
          {/* Fechas y búsqueda */}
          <div className="bg-slate-800/50 rounded-lg border border-slate-500/30 p-4 lg:col-span-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Fecha inicio */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <label className="text-sm font-medium text-slate-300">Fecha inicio</label>
                </div>
                <input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val >= getFechaHoy()) {
                      alert('No se puede seleccionar la fecha de hoy o posterior.');
                      return;
                    }
                    setFechaInicio(val);
                    // Si fechaFin es anterior al nuevo inicio, igualarla
                    if (fechaFin < val) setFechaFin(val);
                  }}
                  max={getFechaAyer()}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-base focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white shadow-sm"
                />
              </div>

              {/* Fecha fin */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <label className="text-sm font-medium text-slate-300">Fecha fin</label>
                </div>
                <input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val >= getFechaHoy()) {
                      alert('No se puede seleccionar la fecha de hoy o posterior.');
                      return;
                    }
                    if (val < fechaInicio) {
                      alert('La fecha fin no puede ser anterior a la fecha inicio.');
                      return;
                    }
                    setFechaFin(val);
                  }}
                  min={fechaInicio}
                  max={getFechaAyer()}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-base focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white shadow-sm"
                />
              </div>

              {/* Búsqueda */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <label className="text-sm font-medium text-slate-300">Buscar empleado</label>
                </div>
                <input
                  type="text"
                  placeholder="Nombre o documento..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-base focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white shadow-sm placeholder-slate-400"
                />
              </div>
            </div>

            {/* Botón buscar rango */}
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={cargarFaltas}
                disabled={cargando}
                className="px-6 py-2 bg-gradient-to-r from-emerald-700 to-emerald-600 hover:from-emerald-800 hover:to-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Buscar
              </button>
            </div>
          </div>

          {/* Resumen */}
          <div className="bg-gradient-to-br from-purple-900/60 to-purple-800/60 rounded-lg border border-purple-500/30 p-4 shadow-lg lg:col-span-1">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-purple-200 uppercase tracking-wide">Resumen</h3>
              <svg className="w-5 h-5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-white mb-1">
                {registrosFiltrados.length}
              </div>
              <div className="text-sm text-purple-200 font-medium">
                Con novedades
              </div>
              <div className="text-xs text-purple-300 mt-2">
                Total BD: {estadisticas?.totalRegistros || 0}
              </div>
            </div>
          </div>
        </div>

        {/* Filtros por Estado */}
        {estadosDisponibles.length > 0 && (
          <div className="pt-4 border-t border-slate-500/50">
            <div className="flex items-start md:items-center gap-3 mb-3 flex-col md:flex-row">
              <div className="flex items-center text-sm font-medium text-slate-200">
                <svg className="w-4 h-4 mr-2 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                </svg>
                <span className="whitespace-nowrap">Filtrar por Estado</span>
                <span className="ml-2 px-2 py-0.5 bg-slate-800 text-slate-300 text-xs rounded-full border border-slate-600">
                  {estadosDisponibles.length}
                </span>
              </div>

              <div className="flex-shrink-0">
                <button
                  onClick={() => { setFiltroEstado(''); setFiltroGravedad(''); }}
                  className={`transition-all duration-200 px-3 py-1.5 rounded-lg border flex-shrink-0 shadow-sm text-xs font-medium ${
                    !filtroEstado && !filtroGravedad
                      ? 'bg-gradient-to-br from-emerald-700 to-emerald-600 border-emerald-500/50 text-white'
                      : 'bg-gradient-to-br from-slate-700/80 to-slate-800/80 hover:from-slate-600/80 hover:to-slate-700/80 border-slate-600/40 text-slate-200'
                  }`}
                >
                  Todos
                </button>
              </div>

              <div className="overflow-x-auto flex-1">
                <div className="flex gap-1.5 min-w-min pb-1">
                  {estadosDisponibles.map((estado) => {
                    const isActive = filtroEstado === estado.id;
                    return (
                      <button
                        key={estado.id}
                        onClick={() => { setFiltroEstado(isActive ? '' : estado.id); setFiltroGravedad(''); }}
                        className={`transition-all duration-200 px-3 py-1.5 rounded-lg border flex-shrink-0 shadow-sm text-xs font-medium ${
                          isActive
                            ? `bg-gradient-to-br ${getEstadoColor(estado.id)} text-white`
                            : 'bg-gradient-to-br from-slate-700/80 to-slate-800/80 hover:from-slate-600/80 hover:to-slate-700/80 border-slate-600/40 text-slate-200'
                        }`}
                      >
                        <div className="text-xs font-medium flex items-center gap-1.5">
                          <span className="truncate max-w-[120px]">{estado.nombre}</span>
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold min-w-[20px] flex items-center justify-center ${
                            isActive ? 'bg-white/20 text-white' : 'bg-slate-900/50 text-slate-300'
                          }`}>
                            {estado.count}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Filtro de gravedad */}
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className="text-slate-400">Filtrar por gravedad:</span>
              {(['ALTA', 'MEDIA', 'BAJA'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setFiltroGravedad(filtroGravedad === g ? '' : g)}
                  className={`px-2 py-1 rounded-md transition-colors ${
                    filtroGravedad === g
                      ? coloresGravedad[g]
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-gradient-to-r from-red-900/50 to-red-800/50 border border-red-500/30 rounded-lg shadow-lg">
          <div className="flex items-center gap-3 text-red-100">
            <svg className="w-6 h-6 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="font-semibold">{error}</span>
          </div>
        </div>
      )}

      {/* Recomendaciones */}
      {recomendaciones.length > 0 && (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {recomendaciones.map((rec, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg border shadow-lg ${
                rec.tipo === 'URGENTE' 
                  ? 'bg-gradient-to-r from-red-900/60 to-red-800/60 border-red-500/30' 
                  : rec.tipo === 'ATENCIÓN'
                  ? 'bg-gradient-to-r from-yellow-900/60 to-yellow-800/60 border-yellow-500/30'
                  : 'bg-gradient-to-r from-blue-900/60 to-blue-800/60 border-blue-500/30'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`px-2 py-1 rounded text-xs font-bold flex-shrink-0 ${
                  rec.tipo === 'URGENTE' ? 'bg-red-700 text-white' 
                  : rec.tipo === 'ATENCIÓN' ? 'bg-yellow-700 text-white'
                  : 'bg-blue-700 text-white'
                }`}>
                  {rec.tipo}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-white font-medium">{rec.mensaje}</p>
                  <p className="text-xs text-white/80 mt-1">{rec.accion}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Estadísticas */}
      {estadisticasFiltradas.totalRegistros > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-900/60 to-blue-800/60 rounded-lg border border-blue-500/30 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-blue-200 uppercase tracking-wide">Registros con Novedad</h3>
              <svg className="w-6 h-6 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="text-center">
              <div className="text-5xl font-bold text-white mb-3">{estadisticasFiltradas.totalRegistros}</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-blue-800/40 p-2 rounded">
                  <div className="text-blue-200 font-semibold">Alta</div>
                  <div className="text-white text-lg font-bold">{estadisticasFiltradas.porGravedad.ALTA}</div>
                </div>
                <div className="bg-blue-800/40 p-2 rounded">
                  <div className="text-blue-200 font-semibold">Media</div>
                  <div className="text-white text-lg font-bold">{estadisticasFiltradas.porGravedad.MEDIA}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-900/60 to-green-800/60 rounded-lg border border-green-500/30 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-green-200 uppercase tracking-wide">Estadísticas de Almuerzos</h3>
              <svg className="w-6 h-6 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-white">{estadisticasFiltradas.almuerzos.normales}</div>
                <div className="text-xs text-green-200 mt-1">Normales</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-white">{estadisticasFiltradas.almuerzos.cortos}</div>
                <div className="text-xs text-green-200 mt-1">Cortos</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-white">{estadisticasFiltradas.almuerzos.largos}</div>
                <div className="text-xs text-green-200 mt-1">Largos</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-white">{estadisticasFiltradas.almuerzos.incompletos}</div>
                <div className="text-xs text-green-200 mt-1">Incompletos</div>
              </div>
            </div>
            {estadisticasFiltradas.almuerzos.noAplica > 0 && (
              <div className="mt-3 text-center text-xs text-green-300 bg-green-900/40 rounded p-1">
                {estadisticasFiltradas.almuerzos.noAplica} empleados PARLO (sin requerir almuerzo)
              </div>
            )}
          </div>

          <div className="bg-gradient-to-br from-purple-900/60 to-purple-800/60 rounded-lg border border-purple-500/30 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-purple-200 uppercase tracking-wide">Estados</h3>
              <svg className="w-6 h-6 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </div>
            <div className="space-y-2">
              {Object.entries(estadisticasFiltradas.porEstado)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .map(([estado, count]) => (
                  <div key={estado} className="flex justify-between items-center bg-purple-800/40 p-2 rounded">
                    <span className="text-xs text-purple-200 truncate max-w-[140px]">
                      {getEstadoNombre(estado)}
                    </span>
                    <span className="text-sm font-bold text-white">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto rounded-lg shadow-lg bg-white border border-slate-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gradient-to-r from-slate-700 to-slate-800 text-white text-sm">
            <tr>
              <th className="py-3 px-4 text-left font-semibold">Empleado</th>
              {esRango && <th className="py-3 px-4 text-left font-semibold">Fecha</th>}
              <th className="py-3 px-4 text-left font-semibold">Campaña</th>
              <th className="py-3 px-4 text-left font-semibold">Estado</th>
              <th className="py-3 px-4 text-left font-semibold">Horarios</th>
              <th className="py-3 px-4 text-left font-semibold">Almuerzo</th>
              <th className="py-3 px-4 text-left font-semibold">Gravedad</th>
            </tr>
          </thead>
          
          {cargando ? (
            <tbody>
              <tr>
                <td colSpan={esRango ? 7 : 6} className="text-center py-10 text-gray-600">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-10 w-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="font-medium text-gray-700">Cargando registros...</span>
                  </div>
                </td>
              </tr>
            </tbody>
          ) : (
            <tbody className="bg-white divide-y divide-gray-200">
              {registrosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={esRango ? 7 : 6} className="text-center py-10 text-gray-600">
                    <div className="flex flex-col items-center gap-3">
                      <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="font-medium text-gray-700">
                          {todosRegistros.length === 0
                            ? 'No hay registros con novedades para el rango seleccionado'
                            : 'No se encontraron registros con los filtros aplicados'}
                        </p>
                        {(filtroEstado || filtroGravedad || busqueda) && (
                          <p className="text-sm text-gray-500 mt-1">Intenta quitando los filtros</p>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                registrosFiltrados.map((falta, index) => (
                  <tr key={`${falta.documento}-${falta.fecha}-${index}`} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 flex items-center justify-center text-white text-sm font-bold border-2 border-emerald-100">
                            {falta.nombre?.charAt(0).toUpperCase() || '?'}
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-semibold text-gray-900">{falta.nombre || 'Sin nombre'}</div>
                          <div className="text-xs text-gray-600 font-medium">{falta.documento || 'Sin documento'}</div>
                        </div>
                      </div>
                    </td>

                    {esRango && (
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-700 font-medium">
                          {falta.fecha ? new Date(falta.fecha + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) : '--'}
                        </div>
                      </td>
                    )}

                    <td className="px-4 py-4 whitespace-nowrap">
                      {falta.campana ? (
                        <span className="text-xs font-medium px-2 py-1 bg-slate-100 text-slate-700 rounded-full border border-slate-200">
                          {falta.campana}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    
                    <td className="px-4 py-4">
                      <div className="text-sm font-semibold text-gray-900 mb-2">
                        {getEstadoNombre(falta.estado)}
                      </div>
                      <div className={`px-2 py-1 rounded-lg text-xs font-medium inline-block ${getEstadoColor(falta.estado)} text-white`}>
                        {falta.estado}
                      </div>
                    </td>
                    
                    <td className="px-4 py-4">
                      <div className="text-sm font-mono">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-16 text-gray-600 text-xs font-medium">Entrada:</span>
                          <span className="font-bold text-gray-900">{falta.horas.entrada}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-16 text-gray-600 text-xs font-medium">Salida:</span>
                          <span className="font-bold text-gray-900">{falta.horas.salida}</span>
                        </div>
                        {falta.campana !== 'Campaña PARLO' && (
                          <>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="w-16 text-gray-600 text-xs font-medium">Sal. Alm:</span>
                              <span className="font-bold text-gray-900">{falta.horas.salidaAlmuerzo}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-16 text-gray-600 text-xs font-medium">Ent. Alm:</span>
                              <span className="font-bold text-gray-900">{falta.horas.entradaAlmuerzo}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                    
                    <td className="px-4 py-4">
                      <span className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 ${
                        coloresAlmuerzo[falta.almuerzo?.estado as keyof typeof coloresAlmuerzo] || 'bg-gray-100 text-gray-800'
                      }`}>
                        <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
                        </svg>
                        {falta.almuerzo?.mensaje || 'Estado desconocido'}
                      </span>
                      {falta.almuerzo?.duracion && (
                        <div className="text-xs text-gray-700 font-medium mt-2 px-2 py-1 bg-gray-100 rounded">
                          Duración: {falta.almuerzo.duracion} min
                        </div>
                      )}
                    </td>
                    
                    <td className="px-4 py-4">
                      <span className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 ${
                        coloresGravedad[falta.gravedad as keyof typeof coloresGravedad] || 'bg-gray-600 text-white'
                      }`}>
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {falta.gravedad || 'NINGUNA'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          )}
        </table>
      </div>

      {/* Resumen final */}
      {registrosFiltrados.length > 0 && (
        <div className="mt-6 p-4 bg-gradient-to-r from-slate-800 to-slate-900 rounded-lg border border-slate-700 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 text-white">
            <div>
              <h3 className="text-lg font-semibold text-slate-100 mb-1">Resumen del Reporte</h3>
              <div className="text-sm text-slate-300">
                Mostrando {registrosFiltrados.length} de {estadisticas?.totalRegistros || 0} registros totales (jornadas completas excluidas)
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              {filtroEstado && (
                <span className="px-3 py-1.5 bg-emerald-700/30 text-emerald-200 rounded-full border border-emerald-500/30">
                  Estado: {getEstadoNombre(filtroEstado)}
                </span>
              )}
              {filtroGravedad && (
                <span className={`px-3 py-1.5 rounded-full border ${coloresGravedad[filtroGravedad as keyof typeof coloresGravedad]}`}>
                  Gravedad: {filtroGravedad}
                </span>
              )}
              {busqueda && (
                <span className="px-3 py-1.5 bg-blue-700/30 text-blue-200 rounded-full border border-blue-500/30">
                  Búsqueda: {busqueda}
                </span>
              )}
              <span className="px-3 py-1.5 bg-purple-700/30 text-purple-200 rounded-full border border-purple-500/30">
                {fechaInicio === fechaFin ? `Fecha: ${fechaInicio}` : `Del ${fechaInicio} al ${fechaFin}`}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}