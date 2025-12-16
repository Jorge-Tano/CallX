// components/Faltas.tsx
"use client";

import { useState, useEffect } from 'react';

interface Falta {
  documento: string;
  nombre: string;
  subtipo: string;
  categoria: string;
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
  foto: string;
  ultimaActualizacion: string;
  tipo: string;
}

interface Estadisticas {
  totalRegistros: number;
  porSubtipo: Record<string, number>;
  porCategoria: Record<string, number>;
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
  // Función para obtener la fecha de ayer
  const getFechaAyer = () => {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    return ayer.toISOString().split('T')[0];
  };

  // Función para obtener la fecha de hoy
  const getFechaHoy = () => {
    return new Date().toISOString().split('T')[0];
  };

  // Si mostrarSoloHoy es true, usar ayer. De lo contrario, usar fechaInicial o ayer por defecto
  const fechaInicialCalculada = mostrarSoloHoy ? getFechaAyer() : (fechaInicial || getFechaAyer());
  
  const [fecha, setFecha] = useState(fechaInicialCalculada);
  const [faltas, setFaltas] = useState<Falta[]>([]);
  const [estadisticas, setEstadisticas] = useState<Estadisticas | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtroCategoria, setFiltroCategoria] = useState<string>('');
  const [incluirCompletos, setIncluirCompletos] = useState(false);

  // Colores para gravedad
  const coloresGravedad = {
    ALTA: 'bg-gradient-to-r from-red-600 to-red-500 border-red-500/50 text-white',
    MEDIA: 'bg-gradient-to-r from-yellow-600 to-yellow-500 border-yellow-500/50 text-white',
    BAJA: 'bg-gradient-to-r from-blue-600 to-blue-500 border-blue-500/50 text-white',
    NINGUNA: 'bg-gradient-to-r from-green-600 to-green-500 border-green-500/50 text-white'
  };

  // Colores para estados de almuerzo
  const coloresAlmuerzo = {
    NORMAL: 'bg-gradient-to-r from-green-600 to-green-500 border-green-500/50 text-white',
    CURTO: 'bg-gradient-to-r from-yellow-600 to-yellow-500 border-yellow-500/50 text-white',
    LARGO: 'bg-gradient-to-r from-orange-600 to-orange-500 border-orange-500/50 text-white',
    INCOMPLETO: 'bg-gradient-to-r from-red-600 to-red-500 border-red-500/50 text-white',
    NO_REGISTRADO: 'bg-gradient-to-r from-slate-600 to-slate-500 border-slate-500/50 text-white',
    ERROR: 'bg-gradient-to-r from-purple-600 to-purple-500 border-purple-500/50 text-white',
    DESCONOCIDO: 'bg-gradient-to-r from-gray-600 to-gray-500 border-gray-500/50 text-white'
  };

  // Colores para categorías de problema (agregada la nueva categoría)
  const getCategoriaColor = (categoria: string) => {
    const colores: Record<string, string> = {
      'ENTRADA_SIN_SALIDA': 'bg-gradient-to-r from-red-700 to-red-600 border-red-600/50',
      'SALIDA_SIN_ENTRADA': 'bg-gradient-to-r from-orange-700 to-orange-600 border-orange-600/50',
      'ALMUERZO_INCOMPLETO': 'bg-gradient-to-r from-yellow-700 to-yellow-600 border-yellow-600/50',
      'SIN_ENTRADA_CON_ALMUERZO': 'bg-gradient-to-r from-pink-700 to-pink-600 border-pink-600/50',
      'ERROR_DATOS': 'bg-gradient-to-r from-purple-700 to-purple-600 border-purple-600/50',
      'SIN_MARCAS': 'bg-gradient-to-r from-slate-700 to-slate-600 border-slate-600/50',
      'COMPLETO': 'bg-gradient-to-r from-green-700 to-green-600 border-green-600/50',
      'FALTA_SALIDA': 'bg-gradient-to-r from-red-700 to-red-600 border-red-600/50',
      'FALTA_ENTRADA': 'bg-gradient-to-r from-orange-700 to-orange-600 border-orange-600/50',
      'SOLO_ALMUERZO': 'bg-gradient-to-r from-yellow-700 to-yellow-600 border-yellow-600/50',
      'FALTA_ENTRADA_ALMUERZO': 'bg-gradient-to-r from-yellow-700 to-yellow-600 border-yellow-600/50',
      'FALTA_SALIDA_ALMUERZO': 'bg-gradient-to-r from-yellow-700 to-yellow-600 border-yellow-600/50'
    };
    return colores[categoria] || 'bg-gradient-to-r from-slate-700 to-slate-600 border-slate-600/50';
  };

  // Función para formatear fecha
  const formatearFecha = (fechaStr: string) => {
    const fechaObj = new Date(fechaStr + 'T00:00:00');
    const opciones: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    return fechaObj.toLocaleDateString('es-ES', opciones);
  };

  // Función para cargar faltas
  const cargarFaltas = async () => {
    setCargando(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        fecha,
        ...(filtroCategoria && { categoria: filtroCategoria }),
        incluirCompletos: incluirCompletos.toString(),
        limite: '100'
      });

      const response = await fetch(`/api/eventos/faltas?${params}`);
      
      // Verifica si la respuesta es HTML (error)
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('text/html')) {
        throw new Error('La API devolvió HTML en lugar de JSON');
      }
      
      const data = await response.json();

      if (data.success) {
        setFaltas(data.todosRegistros || []);
        setEstadisticas(data.estadisticas);
      } else {
        setError(data.error || 'Error al cargar faltas');
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
      console.error('Error cargando faltas:', err);
    } finally {
      setCargando(false);
    }
  };

  // Cargar faltas al cambiar fecha o filtros
  useEffect(() => {
    if (fecha) {
      cargarFaltas();
    }
  }, [fecha, filtroCategoria, incluirCompletos]);

  // Formatear fecha para mostrar
  const fechaFormateada = fecha ? formatearFecha(fecha) : '';

  // Filtrar faltas según filtros activos
  const faltasFiltradas = faltas.filter(falta => {
    if (filtroCategoria && falta.categoria !== filtroCategoria) return false;
    return true;
  });

  // Botones de filtro por categoría (incluyendo la nueva categoría)
  const categoriasDisponibles = [
    { id: 'ENTRADA_SIN_SALIDA', nombre: 'Entrada sin salida' },
    { id: 'SALIDA_SIN_ENTRADA', nombre: 'Salida sin entrada' },
    { id: 'ALMUERZO_INCOMPLETO', nombre: 'Almuerzo incompleto' },
    { id: 'SIN_ENTRADA_CON_ALMUERZO', nombre: 'Sin entrada con almuerzo' },
    { id: 'ERROR_DATOS', nombre: 'Error en datos' },
    { id: 'SIN_MARCAS', nombre: 'Sin marcas' },
    { id: 'COMPLETO', nombre: 'Jornada completa' }
  ];

  return (
    <div className="p-4 ">
      {/* Header similar al de eventos */}
      <div className="mb-4 p-6 pt-4 pb-3 bg-gradient-to-r from-slate-600 via-emerald-600 to-slate-700 rounded-lg shadow-lg border border-slate-500/30">
        
        {/* PRIMERA FILA: Título y botón */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">Reporte de Faltas y Almuerzos</h1>
              {fecha && (
                <span className="text-sm font-medium text-emerald-200 bg-emerald-900/40 px-3 py-1 rounded-full border border-emerald-500/30">
                  {fechaFormateada}
                </span>
              )}
            </div>

            {/* Botón de actualizar */}
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

        {/* SEGUNDA FILA: Fecha y Estadísticas - MODIFICADA */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
          
          {/* Columna 1: Selector de fecha - OCUPA 4 COLUMNAS */}
          <div className="bg-slate-800/50 rounded-lg border border-slate-500/30 p-4 lg:col-span-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Seleccionar Fecha
              </h3>
            </div>

            {/* Selector de fecha */}
            <div className="flex items-center gap-6 mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <label className="text-sm font-medium text-slate-300">Fecha del Reporte</label>
                </div>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => {
                    const nuevaFecha = e.target.value;
                    const fechaHoy = getFechaHoy();
                    
                    // Verificar que no sea hoy
                    if (nuevaFecha === fechaHoy) {
                      alert('No se puede seleccionar la fecha de hoy. Seleccione una fecha anterior.');
                      return;
                    }
                    
                    setFecha(nuevaFecha);
                  }}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-base focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  max={getFechaAyer()} // Máximo: ayer (no permite hoy ni futuras)
                />
                <p className="text-xs text-slate-400 mt-1">
                  Solo fechas anteriores. Hoy no está disponible porque los datos aún no están completos.
                </p>
              </div>

              {/* Checkbox para incluir completos */}
              <div className="flex items-center gap-3 mt-6">
                <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={incluirCompletos}
                    onChange={(e) => setIncluirCompletos(e.target.checked)}
                    disabled={cargando}
                    className="rounded border-slate-500 bg-slate-800 text-emerald-500 focus:ring-emerald-500 disabled:opacity-50"
                  />
                  <span>Incluir jornadas completas</span>
                </label>
              </div>
            </div>
          </div>

          {/* Columna 2: Resumen */}
          <div className="bg-gradient-to-br from-purple-900/60 to-purple-800/60 rounded-lg border border-purple-500/30 p-4 shadow-lg lg:col-span-1">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-purple-200 uppercase tracking-wide">Resumen</h3>
              <svg className="w-5 h-5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-white mb-3">
                {estadisticas?.totalRegistros || 0}
              </div>
              <div className="text-sm text-purple-200 font-medium">
                Registros Totales
              </div>
              {filtroCategoria && (
                <div className="mt-2 text-xs text-purple-300">
                  Filtro: {filtroCategoria.replace(/_/g, ' ')}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* TERCERA FILA: Filtros por Categoría */}
        <div className="pt-4 border-t border-slate-500/50">
          <div className="flex items-start md:items-center gap-3 mb-3 flex-col md:flex-row">
            {/* Título y contador */}
            <div className="flex items-center text-sm font-medium text-slate-200">
              <svg className="w-4 h-4 mr-2 text-emerald-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
              </svg>
              <span className="whitespace-nowrap">Filtro por Categoría</span>
              <span className="ml-2 px-2 py-0.5 bg-slate-800 text-slate-300 text-xs rounded-full border border-slate-600">
                {categoriasDisponibles.length}
              </span>
            </div>

            {/* Botón Todos */}
            <div className="flex-shrink-0">
              <button
                onClick={() => setFiltroCategoria('')}
                className={`transition-all duration-200 px-3 py-1.5 rounded-lg border flex-shrink-0 shadow-sm text-xs font-medium ${!filtroCategoria
                  ? 'bg-gradient-to-br from-emerald-700 to-emerald-600 border-emerald-500/50 text-white'
                  : 'bg-gradient-to-br from-slate-700/80 to-slate-800/80 hover:from-slate-600/80 hover:to-slate-700/80 border-slate-600/40 hover:border-slate-500/50 text-slate-200'
                  }`}
              >
                <div className="flex items-center gap-1.5">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                  </svg>
                  Todas
                </div>
              </button>
            </div>

            {/* Botones de categorías */}
            <div className="overflow-x-auto flex-1">
              <div className="flex gap-1.5 min-w-min">
                {categoriasDisponibles.map((categoria) => {
                  const isActive = filtroCategoria === categoria.id;
                  const count = estadisticas?.porCategoria[categoria.id] || 0;

                  return (
                    <button
                      key={categoria.id}
                      onClick={() => setFiltroCategoria(isActive ? '' : categoria.id)}
                      className={`transition-all duration-200 px-3 py-1.5 rounded-lg border flex-shrink-0 shadow-sm text-xs font-medium ${isActive
                        ? `bg-gradient-to-br ${getCategoriaColor(categoria.id)} text-white`
                        : 'bg-gradient-to-br from-slate-700/80 to-slate-800/80 hover:from-slate-600/80 hover:to-slate-700/80 border-slate-600/40 hover:border-slate-500/50 text-slate-200'
                        }`}
                      title={`Filtrar por ${categoria.nombre} (${count} registros)`}
                    >
                      <div className="text-xs font-medium flex items-center gap-1.5">
                        <span className="truncate max-w-[120px]">{categoria.nombre}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold min-w-[20px] flex items-center justify-center ${isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-900/50 text-slate-300'
                          }`}>
                          {count}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-gradient-to-r from-red-900/50 to-red-800/50 border border-red-500/30 rounded-lg shadow-lg">
          <div className="flex items-center gap-3 text-red-100">
            <svg className="w-6 h-6 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div>
              <span className="font-semibold">{error}</span>
              <p className="text-sm text-red-200 mt-1">
                Verifica que el servidor esté funcionando y la API /api/eventos/faltas devuelva JSON.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Estadísticas */}
      {estadisticas && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Tarjeta 1: Total de registros */}
          <div className="bg-gradient-to-br from-blue-900/60 to-blue-800/60 rounded-lg border border-blue-500/30 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-blue-200 uppercase tracking-wide">Registros Totales</h3>
              <svg className="w-6 h-6 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="text-center">
              <div className="text-5xl font-bold text-white mb-3">{estadisticas.totalRegistros}</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-blue-800/40 p-2 rounded">
                  <div className="text-blue-200 font-semibold">Alta</div>
                  <div className="text-white text-lg font-bold">{estadisticas.porGravedad.ALTA}</div>
                </div>
                <div className="bg-blue-800/40 p-2 rounded">
                  <div className="text-blue-200 font-semibold">Media</div>
                  <div className="text-white text-lg font-bold">{estadisticas.porGravedad.MEDIA}</div>
                </div>
                <div className="bg-blue-800/40 p-2 rounded">
                  <div className="text-blue-200 font-semibold">Baja</div>
                  <div className="text-white text-lg font-bold">{estadisticas.porGravedad.BAJA}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Tarjeta 2: Almuerzos */}
          <div className="bg-gradient-to-br from-green-900/60 to-green-800/60 rounded-lg border border-green-500/30 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-green-200 uppercase tracking-wide">Estadísticas de Almuerzos</h3>
              <svg className="w-6 h-6 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-center">
              <div className="text-5xl font-bold text-white mb-3">{estadisticas.almuerzos.normales}</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-green-800/40 p-2 rounded">
                  <div className="text-green-200 font-semibold">Normales</div>
                  <div className="text-white text-lg font-bold">{estadisticas.almuerzos.normales}</div>
                </div>
                <div className="bg-green-800/40 p-2 rounded">
                  <div className="text-green-200 font-semibold">Cortos</div>
                  <div className="text-white text-lg font-bold">{estadisticas.almuerzos.cortos}</div>
                </div>
                <div className="bg-green-800/40 p-2 rounded">
                  <div className="text-green-200 font-semibold">Largos</div>
                  <div className="text-white text-lg font-bold">{estadisticas.almuerzos.largos}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Tarjeta 3: Tipos de Faltas */}
          <div className="bg-gradient-to-br from-purple-900/60 to-purple-800/60 rounded-lg border border-purple-500/30 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-purple-200 uppercase tracking-wide">Tipos de Faltas</h3>
              <svg className="w-6 h-6 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </div>
            <div className="text-center">
              <div className="text-5xl font-bold text-white mb-3">{Object.keys(estadisticas.porSubtipo).length}</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-purple-800/40 p-2 rounded">
                  <div className="text-purple-200 font-semibold">Más Común</div>
                  <div className="text-white text-lg font-bold">
                    {Object.entries(estadisticas.porSubtipo).length > 0 
                      ? Object.entries(estadisticas.porSubtipo)
                          .sort(([,a], [,b]) => b - a)[0][1]
                      : 0}
                  </div>
                </div>
                <div className="bg-purple-800/40 p-2 rounded">
                  <div className="text-purple-200 font-semibold">Segundo</div>
                  <div className="text-white text-lg font-bold">
                    {Object.entries(estadisticas.porSubtipo).length > 1 
                      ? Object.entries(estadisticas.porSubtipo)
                          .sort(([,a], [,b]) => b - a)[1][1]
                      : 0}
                  </div>
                </div>
                <div className="bg-purple-800/40 p-2 rounded">
                  <div className="text-purple-200 font-semibold">Tercero</div>
                  <div className="text-white text-lg font-bold">
                    {Object.entries(estadisticas.porSubtipo).length > 2 
                      ? Object.entries(estadisticas.porSubtipo)
                          .sort(([,a], [,b]) => b - a)[2][1]
                      : 0}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabla de faltas */}
      <div className="overflow-x-auto rounded-lg shadow-lg bg-white border border-slate-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gradient-to-r from-slate-700 to-slate-800 text-white text-sm">
            <tr>
              <th className="py-3 px-4 text-left font-semibold">Empleado</th>
              <th className="py-3 px-4 text-left font-semibold">Subtipo</th>
              <th className="py-3 px-4 text-left font-semibold">Horarios</th>
              <th className="py-3 px-4 text-left font-semibold">Almuerzo</th>
              <th className="py-3 px-4 text-left font-semibold">Gravedad</th>
            </tr>
          </thead>
          
          {cargando ? (
            <tbody>
              <tr>
                <td colSpan={5} className="text-center py-10 text-gray-600">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-10 w-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="font-medium text-gray-700">Cargando faltas...</span>
                  </div>
                </td>
              </tr>
            </tbody>
          ) : (
            <tbody className="bg-white divide-y divide-gray-200">
              {faltasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-gray-600">
                    <div className="flex flex-col items-center gap-3">
                      <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="font-medium text-gray-700">
                          {incluirCompletos 
                            ? 'No hay registros para esta fecha' 
                            : '¡No hay faltas registradas!'}
                        </p>
                        {filtroCategoria ? (
                          <p className="text-sm text-gray-500 mt-1">
                            Intenta con otros filtros
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                faltasFiltradas.map((falta, index) => (
                  <tr key={index} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          {falta.foto ? (
                            <img
                              className="h-10 w-10 rounded-full object-cover border-2 border-gray-200"
                              src={falta.foto}
                              alt={falta.nombre}
                              onError={(e) => {
                                e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(falta.nombre)}&background=random&color=fff&bold=true`;
                              }}
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 flex items-center justify-center text-white text-sm font-bold border-2 border-emerald-100">
                              {falta.nombre.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-semibold text-gray-900">
                            {falta.nombre}
                          </div>
                          <div className="text-xs text-gray-600 font-medium">
                            {falta.documento}
                          </div>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-4 py-4">
                      <div className="text-sm font-semibold text-gray-900">{falta.subtipo}</div>
                      <div className={`mt-1 px-2 py-1 rounded-lg text-xs font-medium inline-block ${getCategoriaColor(falta.categoria)} text-white`}>
                        {falta.categoria.replace(/_/g, ' ')}
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
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-16 text-gray-600 text-xs font-medium">Salida Alm:</span>
                          <span className="font-bold text-gray-900">{falta.horas.salidaAlmuerzo}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-16 text-gray-600 text-xs font-medium">Entrada Alm:</span>
                          <span className="font-bold text-gray-900">{falta.horas.entradaAlmuerzo}</span>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-4 py-4">
                      <span className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 ${coloresAlmuerzo[falta.almuerzo.estado as keyof typeof coloresAlmuerzo] || 'bg-gray-100 text-gray-800'}`}>
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
                        </svg>
                        {falta.almuerzo.mensaje}
                      </span>
                      {falta.almuerzo.duracion && (
                        <div className="text-xs text-gray-700 font-medium mt-2 px-2 py-1 bg-gray-100 rounded">
                          Duración: {falta.almuerzo.duracion} minutos
                        </div>
                      )}
                    </td>
                    
                    <td className="px-4 py-4">
                      <span className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 ${coloresGravedad[falta.gravedad as keyof typeof coloresGravedad]}`}>
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {falta.gravedad}
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
      {estadisticas && faltasFiltradas.length > 0 && (
        <div className="mt-6 p-4 bg-gradient-to-r from-slate-800 to-slate-900 rounded-lg border border-slate-700 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 text-white">
            <div>
              <h3 className="text-lg font-semibold text-slate-100 mb-1">Resumen del Reporte</h3>
              <div className="text-sm text-slate-300">
                Mostrando {faltasFiltradas.length} de {estadisticas.totalRegistros} registros
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              {filtroCategoria && (
                <span className="px-3 py-1.5 bg-emerald-700/30 text-emerald-200 rounded-full border border-emerald-500/30">
                  Categoría: {filtroCategoria.replace(/_/g, ' ')}
                </span>
              )}
              {incluirCompletos && (
                <span className="px-3 py-1.5 bg-green-700/30 text-green-200 rounded-full border border-green-500/30">
                  Incluye jornadas completas
                </span>
              )}
              <span className="px-3 py-1.5 bg-purple-700/30 text-purple-200 rounded-full border border-purple-500/30">
                Fecha: {fecha}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}