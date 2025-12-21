// components/Header.tsx
import { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { useHideFrom } from "@/lib/hooks/useRole";

interface HeaderEventosProps {
  estadisticas: {
    usuariosPorDepartamento: Record<string, number>;
  };
  departamentoFiltro: string | null;
  onFiltroChange: (departamento: string | null) => void;
  eventosCount: number;
  onRefresh: () => void;
  isRefreshing?: boolean;
  selectedPeriodo: 'hoy' | '7dias' | '30dias' | 'personalizado';
  onPeriodoChange: (periodo: 'hoy' | '7dias' | '30dias' | 'personalizado') => void;
  onFechasChange: (inicio: string, fin: string) => void;
  fechaInicio: string;
  fechaFin: string;
}

export function HeaderEventos({
  estadisticas,
  departamentoFiltro,
  onFiltroChange,
  eventosCount,
  onRefresh,
  isRefreshing = false,
  selectedPeriodo,
  onPeriodoChange,
  onFechasChange,
  fechaInicio,
  fechaFin,
}: HeaderEventosProps) {

  const { shouldHide } = useHideFrom();
  const [localFechaInicio, setLocalFechaInicio] = useState(fechaInicio);
  const [localFechaFin, setLocalFechaFin] = useState(fechaFin);
  const [isSincronizando, setIsSincronizando] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success?: boolean; message?: string; eventos_obtenidos?: number; registros_procesados?: number; tiempo_segundos?: number } | null>(null);

  // Estados para el modal de sincronización con DatePicker
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(new Date());
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([new Date(), new Date()]);

  // Sincronizar con las props cuando cambien
  useEffect(() => {
    setLocalFechaInicio(fechaInicio);
    setLocalFechaFin(fechaFin);
  }, [fechaInicio, fechaFin]);

  // Función para formatear fecha a YYYY-MM-DD
  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  const handleFechaInicioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nuevaInicio = e.target.value;
    setLocalFechaInicio(nuevaInicio);
    onFechasChange(nuevaInicio, fechaFin);
  };

  const handleFechaFinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nuevaFin = e.target.value;
    setLocalFechaFin(nuevaFin);
    if (fechaInicio && nuevaFin) {
      onPeriodoChange('personalizado');
      onFechasChange(fechaInicio, nuevaFin);
    }
  };

  // Función para abrir modal de sincronización
  const handleOpenSyncModal = () => {
    // Inicializar con rango predeterminado: Diciembre 1 hasta hoy
    const inicio = new Date();
    const fin = new Date();
    setStartDate(inicio);
    setEndDate(fin);
    setDateRange([inicio, fin]);
    setShowSyncModal(true);
  };

  // Función para cerrar modal
  const handleCloseSyncModal = () => {
    setShowSyncModal(false);
  };

  // Función para manejar cambio de rango en DatePicker
  const handleDateRangeChange = (update: [Date | null, Date | null]) => {
    setDateRange(update);
    setStartDate(update[0]);
    setEndDate(update[1]);
  };

  // En Header.tsx, en la función handleExecuteSync:
  const handleExecuteSync = async () => {
    if (!startDate || !endDate) {
      alert('⚠️ Por favor selecciona un rango de fechas válido');
      return;
    }

    const fechaInicioStr = formatDate(startDate);
    const fechaFinStr = formatDate(endDate);

    setIsSincronizando(true);
    setSyncResult(null);
    handleCloseSyncModal();

    try {
      // CORREGIR ESTA URL:
      // Cambiar de /api/sincronizar a /api/eventos/actualizar-eventos
      const url = `/api/eventos/actualizar-eventos?accion=historico&fechaInicio=${fechaInicioStr}&fechaFin=${fechaFinStr}`;

      console.log('📡 Enviando solicitud a:', url);

      const response = await fetch(url);

      // Verificar si la respuesta es HTML (error)
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('❌ Respuesta no es JSON:', text.substring(0, 200));
        throw new Error(`El servidor devolvió HTML en lugar de JSON. ¿URL correcta?`);
      }

      const data = await response.json();

      console.log('📊 Respuesta recibida:', data);

      if (data.success) {
        setSyncResult(data);

        // Refrescar la tabla automáticamente después de 2 segundos
        setTimeout(() => {
          if (onRefresh) onRefresh();
        }, 2000);
      } else {
        throw new Error(data.error || 'Error en la sincronización');
      }
    } catch (error: any) {
      console.error('❌ Error sincronizando:', error);
      alert(`❌ ERROR EN SINCRONIZACIÓN\n\n${error.message || 'Error desconocido'}`);
    } finally {
      setIsSincronizando(false);
    }
  };

  useEffect(() => {
    if (syncResult && syncResult.success) {
      const timer = setTimeout(() => {
        setSyncResult(null);
      }, 5000); // 5000 milisegundos = 5 segundos

      // Limpia el timer si el componente se desmonta
      return () => clearTimeout(timer);
    }
  }, [syncResult]);

  // Colores para departamentos
  const getDepartamentoColor = (depto: string) => {
    const coloresDepartamentos: Record<string, string> = {
      "TI": "from-purple-600 to-purple-500 border-purple-500/50",
      "Teams Leaders": "from-blue-600 to-blue-500 border-blue-500/50",
      "Campana 5757": "from-emerald-600 to-emerald-500 border-emerald-500/50",
      "Campana SAV": "from-yellow-600 to-yellow-500 border-yellow-500/50",
      "Campana REFI": "from-red-600 to-red-500 border-red-500/50",
      "Campana PL": "from-indigo-600 to-indigo-500 border-indigo-500/50",
      "Campana PARLO": "from-pink-600 to-pink-500 border-pink-500/50",
      "Administrativo": "from-slate-600 to-slate-500 border-slate-500/50",
      "No asignado": "from-gray-600 to-gray-500 border-gray-500/50"
    };
    return coloresDepartamentos[depto] || "from-gray-600 to-gray-500 border-gray-500/50";
  };

  return (
    <>
      {/* Modal de sincronización con DatePicker - UN SOLO MES */}
      {showSyncModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl shadow-2xl border border-slate-700 w-full max-w-md">
            {/* Header del modal */}
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">Seleccionar Rango de Fechas</h3>
                </div>
                <button
                  onClick={handleCloseSyncModal}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Contenido del modal - UN SOLO CALENDARIO */}
            <div className="p-6">
              {/* Calendario de selección de rango - UN SOLO MES */}
              <div className="mb-6">
                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                  <DatePicker
                    selectsRange={true}
                    startDate={dateRange[0]}
                    endDate={dateRange[1]}
                    onChange={handleDateRangeChange}
                    monthsShown={1}  // SOLO UN MES
                    inline
                    className="react-datepicker-custom"
                    dateFormat="dd/MM/yyyy"
                    maxDate={new Date()}
                    locale="es"
                    dayClassName={(date) => {
                      const baseClass = "react-datepicker__day";
                      if (dateRange[0] && dateRange[1] && date >= dateRange[0] && date <= dateRange[1]) {
                        return `${baseClass} react-datepicker__day--in-range`;
                      }
                      return baseClass;
                    }}
                  />
                </div>


              </div>
              <div className="text-sm text-slate-400">
                {startDate && endDate ? (
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {formatDate(startDate)} al {formatDate(endDate)}
                  </span>
                ) : (
                  <span>Selecciona un rango de fechas</span>
                )}
              </div>

            </div>

            {/* Footer del modal */}
            <div className="p-6 border-t border-slate-700 flex justify-between items-center">

              <div className="flex gap-3">
                <button
                  onClick={handleCloseSyncModal}
                  className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleExecuteSync}
                  disabled={!startDate || !endDate}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sincronizar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Estilos personalizados para el DatePicker */}
      <style jsx global>{`
        /* Calendario más compacto para un solo mes */
        .react-datepicker {
          background-color: #1e293b !important;
          border-color: #475569 !important;
          font-family: inherit !important;
          width: 100% !important;
        }
        
        .react-datepicker__header {
          background-color: #0f172a !important;
          border-bottom-color: #475569 !important;
        }
        
        .react-datepicker__current-month,
        .react-datepicker__day-name {
          color: #e2e8f0 !important;
          font-size: 0.9rem !important;
        }
        
        .react-datepicker__day {
          color: #cbd5e1 !important;
          width: 2rem !important;
          height: 2rem !important;
          line-height: 2rem !important;
          margin: 0.1rem !important;
          font-size: 0.85rem !important;
        }
        
        .react-datepicker__day:hover {
          background-color: #475569 !important;
        }
        
        .react-datepicker__day--selected,
        .react-datepicker__day--in-range {
          background-color: #7c3aed !important;
          color: white !important;
        }
        
        .react-datepicker__day--keyboard-selected {
          background-color: #8b5cf6 !important;
        }
        
        .react-datepicker__day--range-start,
        .react-datepicker__day--range-end {
          background-color: #6d28d9 !important;
          font-weight: bold !important;
        }
        
        .react-datepicker__navigation-icon::before {
          border-color: #cbd5e1 !important;
        }
        
        .react-datepicker__navigation:hover *::before {
          border-color: #e2e8f0 !important;
        }
        
        .react-datepicker__month-container {
          width: 100% !important;
        }
        
        /* Para que el calendario ocupe todo el ancho */
        .react-datepicker__month {
          margin: 0 !important;
        }
        
        .react-datepicker__week {
          display: flex !important;
          justify-content: space-around !important;
        }
      `}</style>

      <div className="p-4 pt-20">
        <div className="mb-4 p-6 pt-2 pb-1 bg-gradient-to-r from-slate-600 via-emerald-600 to-slate-700 rounded-lg shadow-lg border border-slate-500/30">

          {/* PRIMERA FILA: Título y estadísticas */}
          <div className="mb-1">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-white">Reporte de Accesos Biométricos</h1>
              </div>

              <div className="flex items-center gap-2">
                {!shouldHide(['TI', 'Team Leader']) && (
                  <button
                    onClick={handleOpenSyncModal}
                    disabled={isSincronizando || isRefreshing}
                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                    title="Abre calendario para seleccionar rango de fechas"
                  >
                    {isSincronizando ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Sincronizando...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Sincronizar
                      </>
                    )}
                  </button>
                )}

                {/* Botón de actualizar normal */}
                <button
                  onClick={onRefresh}
                  disabled={isRefreshing || isSincronizando}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                  title="Actualizar eventos del día de hoy"
                >
                  {isRefreshing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Actualizando...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Actualizar Hoy
                    </>
                  )}
                </button>
              </div>
            </div>

            {syncResult && syncResult.success && (
              <div className="mb-4 p-3 bg-gradient-to-r from-green-900/30 to-emerald-900/30 rounded-lg border border-green-500/30 animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-green-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-green-300">{syncResult.message}</p>
                      <div className="flex gap-4 mt-1 text-xs text-green-200">
                        <span>📊 Eventos: {syncResult.eventos_obtenidos}</span>
                        <span>💾 Registros: {syncResult.registros_procesados}</span>
                        <span>⏱️ Tiempo: {syncResult.tiempo_segundos}s</span>
                      </div>
                    </div>
                  </div>

                  {/* Indicador de tiempo */}
                  <div className="flex items-center gap-2">
                    <div className="relative w-8 h-8">
                      {/* Círculo de progreso */}
                      <svg className="w-8 h-8 transform -rotate-90">
                        <circle
                          cx="16"
                          cy="16"
                          r="7"
                          stroke="currentColor"
                          strokeWidth="2"
                          fill="none"
                          className="text-green-900/50"
                        />
                        <circle
                          cx="16"
                          cy="16"
                          r="7"
                          stroke="currentColor"
                          strokeWidth="2"
                          fill="none"
                          strokeDasharray="44"
                          strokeDashoffset="44"
                          className="text-green-400 animate-countdown"
                          style={{
                            animation: 'countdown 5s linear forwards'
                          }}
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SEGUNDA FILA: Los tres elementos en una fila */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-1">

            {/* COLUMNA 1: Filtro por período */}
            <div className="bg-slate-800/50 rounded-lg border border-slate-500/30 p-4 lg:col-span-1">
              <div className="flex items-center justify-between mb-1 p-1">
                <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Período
                </h3>
              </div>

              {/* Indicador de período activo */}
              <div className="mb-2 p-3 bg-slate-900/50 rounded border border-slate-600/50">
                <div className="flex items-center gap-2">
                  <div className="text-xs text-slate-400">Período activo:</div>
                  <div className="text-sm font-medium text-white truncate">
                    {selectedPeriodo === 'hoy' && 'Hoy'}
                    {selectedPeriodo === '7dias' && 'Últimos 7 días'}
                    {selectedPeriodo === '30dias' && 'Últimos 30 días'}
                    {selectedPeriodo === 'personalizado' && `Personalizado`}
                  </div>
                </div>
              </div>

              {/* Botones de período */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => onPeriodoChange('hoy')}
                  disabled={isRefreshing || isSincronizando}
                  className={`px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${selectedPeriodo === 'hoy'
                    ? 'bg-emerald-700 text-white shadow-md'
                    : 'bg-slate-700/70 text-slate-200 hover:bg-slate-600/70 border border-slate-500/30'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  Hoy
                </button>
                <button
                  onClick={() => onPeriodoChange('7dias')}
                  disabled={isRefreshing || isSincronizando}
                  className={`px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${selectedPeriodo === '7dias'
                    ? 'bg-emerald-700 text-white shadow-md'
                    : 'bg-slate-700/70 text-slate-200 hover:bg-slate-600/70 border border-slate-500/30'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  7 Días
                </button>
                <button
                  onClick={() => onPeriodoChange('30dias')}
                  disabled={isRefreshing || isSincronizando}
                  className={`px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${selectedPeriodo === '30dias'
                    ? 'bg-emerald-700 text-white shadow-md'
                    : 'bg-slate-700/70 text-slate-200 hover:bg-slate-600/70 border border-slate-500/30'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  30 Días
                </button>
              </div>
            </div>

            {/* COLUMNA 2: Rango personalizado - OCUPA 3 COLUMNAS */}
            <div className="bg-slate-800/50 rounded-lg border border-slate-500/30 p-3 lg:col-span-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Rango Personalizado
                </h3>
                <button
                  onClick={() => onPeriodoChange('personalizado')}
                  disabled={!fechaInicio || !fechaFin || isSincronizando}
                  className={`text-sm px-4 py-2 rounded-lg flex items-center gap-2 ${selectedPeriodo === 'personalizado' && fechaInicio && fechaFin
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed'
                    }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Aplicar
                </button>
              </div>

              {/* Fechas a los lados - CON MÁS ESPACIO */}
              <div className="flex items-center gap-6 mb-4">
                {/* Fecha Inicio */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <label className="text-sm font-medium text-slate-300">Fecha Inicio</label>
                  </div>
                  <input
                    type="date"
                    value={localFechaInicio}
                    onChange={handleFechaInicioChange}
                    disabled={isSincronizando}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-base focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Flecha separadora más grande */}
                <div className="pt-8">
                  <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>

                {/* Fecha Fin */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <label className="text-sm font-medium text-slate-300">Fecha Fin</label>
                  </div>
                  <input
                    type="date"
                    value={localFechaFin}
                    onChange={handleFechaFinChange}
                    disabled={isSincronizando}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-base focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    min={localFechaInicio}
                  />
                </div>
              </div>

              {/* Botón rápido de aplicar para móvil */}
              <div className="lg:hidden">
                <button
                  onClick={() => onPeriodoChange('personalizado')}
                  disabled={!fechaInicio || !fechaFin || isSincronizando}
                  className={`w-full px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${selectedPeriodo === 'personalizado' && fechaInicio && fechaFin
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed'
                    }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Aplicar Rango Personalizado
                </button>
              </div>
            </div>

            {/* COLUMNA 3: Resumen */}
            <div className="bg-gradient-to-br from-purple-900/60 to-purple-800/60 rounded-lg border border-purple-500/30 p-4 shadow-lg lg:col-span-1">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-purple-200 uppercase tracking-wide">Resumen</h3>
                <svg className="w-5 h-5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-white mb-3">{eventosCount}</div>
                <div className="text-sm text-purple-200 font-medium">
                  Eventos {departamentoFiltro ? 'Filtrados' : 'Encontrados'}
                </div>
                {departamentoFiltro && (
                  <div className="mt-2 text-xs text-purple-300">
                    Filtro: {departamentoFiltro}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* TERCERA FILA: Filtros por Departamento */}
          <div className="pt-4 border-t border-slate-500/50">
            <div className="flex items-start md:items-center gap-3 mb-3 flex-col md:flex-row">
              {/* Título y contador */}
              <div className="flex items-center text-sm font-medium text-slate-200">
                <svg className="w-4 h-4 mr-2 text-emerald-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                </svg>
                <span className="whitespace-nowrap">Filtro por Departamento</span>
                <span className="ml-2 px-2 py-0.5 bg-slate-800 text-slate-300 text-xs rounded-full border border-slate-600">
                  {Object.keys(estadisticas.usuariosPorDepartamento).length}
                </span>
              </div>

              {/* Botón Todos */}
              <div className="flex-shrink-0">
                <button
                  onClick={() => onFiltroChange(null)}
                  disabled={isSincronizando}
                  className={`transition-all duration-200 px-3 py-1.5 rounded-lg border flex-shrink-0 shadow-sm text-xs font-medium ${!departamentoFiltro
                    ? 'bg-gradient-to-br from-emerald-700 to-emerald-600 border-emerald-500/50 text-white'
                    : 'bg-gradient-to-br from-slate-700/80 to-slate-800/80 hover:from-slate-600/80 hover:to-slate-700/80 border-slate-600/40 hover:border-slate-500/50 text-slate-200'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                    </svg>
                    Todos
                  </div>
                </button>
              </div>

              {/* Botones de departamentos */}
              <div className="overflow-x-auto flex-1">
                <div className="flex gap-1.5 min-w-min">
                  {Object.keys(estadisticas.usuariosPorDepartamento)
                    .sort((a, b) => a.localeCompare(b))
                    .map((depto) => {
                      const colorClase = getDepartamentoColor(depto);
                      const isActive = departamentoFiltro === depto;
                      const count = estadisticas.usuariosPorDepartamento[depto] || 0;

                      return (
                        <button
                          key={depto}
                          onClick={() => onFiltroChange(isActive ? null : depto)}
                          disabled={isSincronizando}
                          className={`transition-all duration-200 px-3 py-1.5 rounded-lg border flex-shrink-0 shadow-sm ${isActive
                            ? `bg-gradient-to-br ${colorClase} text-white font-medium`
                            : 'bg-gradient-to-br from-slate-700/80 to-slate-800/80 hover:from-slate-600/80 hover:to-slate-700/80 border-slate-600/40 hover:border-slate-500/50 text-slate-200'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          title={`Filtrar por ${depto} (${count} usuarios)\nClick para ${isActive ? 'quitar filtro' : 'aplicar filtro'}`}
                        >
                          <div className="text-xs font-medium flex items-center gap-1.5">
                            <span className="truncate max-w-[100px]">{depto}</span>
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
      </div>
    </>
  );
}

<style jsx global>{`
  @keyframes countdown {
    from {
      stroke-dashoffset: 44;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
  
  .animate-countdown {
    animation: countdown 5s linear forwards;
  }
`}</style>