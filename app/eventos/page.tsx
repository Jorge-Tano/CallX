'use client';

import { useState, useEffect, useCallback } from 'react';
import { EventosTable } from '@/components/EventosTable';
import { HeaderEventos } from '@/components/Header';
import Navbar from "@/components/navbar";
import IdleSessionProtector from '@/components/IdleSessionProtector';
import { descargarExcel } from '@/utils/excelGenerator';
import { getLocalDateString, formatDateForInput, parseDateFromString } from '@/utils/dateUtils';

export interface Evento {
  id?: number;
  empleadoId: string;
  nombre: string;
  fecha: string;
  horaEntrada: string;
  horaSalida: string;
  horaSalidaAlmuerzo: string;
  horaEntradaAlmuerzo: string;
  duracionAlmuerzo?: string;
  campaña: string;
  tipo: string;
  subtipo: string;
  estado: string;
  estadoColor: string;
  estadoIcono: string;
  estadoDescripcion: string;
  faltas: string[];
  tieneProblemas: boolean;
  necesitaRevision: boolean;
  tieneAlmuerzoCompleto: boolean;
  dispositivo?: string;
  foto?: string;
}

interface Estadisticas {
  usuariosPorDepartamento: Record<string, number>;
  ejecutivos: string[];
}

export default function EventosPage() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [eventosFiltrados, setEventosFiltrados] = useState<Evento[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriodo, setSelectedPeriodo] = useState<'hoy' | '7dias' | '30dias' | 'personalizado'>('hoy');
  const [fechaInicio, setFechaInicio] = useState<string>('');
  const [fechaFin, setFechaFin] = useState<string>('');
  const [departamentoFiltro, setDepartamentoFiltro] = useState<string | null>(null);
  const [ejecutivoFiltro, setEjecutivoFiltro] = useState<string | null>(null);
  const [estadisticas, setEstadisticas] = useState<Estadisticas>({
    usuariosPorDepartamento: {},
    ejecutivos: []
  });
  const [isDescargandoExcel, setIsDescargandoExcel] = useState(false);

  // Inicializar desde localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedDeptoFilter = localStorage.getItem('departamentoFiltro');
      const savedEjecutivoFilter = localStorage.getItem('ejecutivoFiltro');

      if (savedDeptoFilter) {
        setDepartamentoFiltro(savedDeptoFilter);
      }

      if (savedEjecutivoFilter) {
        setEjecutivoFiltro(savedEjecutivoFilter);
      }

      // USAR FECHA LOCAL, NO UTC
      const fechaHoy = getLocalDateString();
      console.log('📅 Fecha hoy (LOCAL):', fechaHoy, 'Hora actual:', new Date().toLocaleString());
      
      setFechaInicio(fechaHoy);
      setFechaFin(fechaHoy);
    }
  }, []);

  // Función normalizadora para comparar strings
  const normalizarString = (str: string): string => {
    if (!str) return '';
    return str.trim().toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  };

  // Aplicar filtros por departamento/campaña y ejecutivo
  const aplicarFiltros = useCallback((
    eventosLista: Evento[],
    deptoFiltro: string | null,
    ejecFiltro: string | null
  ) => {
    let filtrados = eventosLista;

    // 1. Aplicar filtro por departamento
    if (deptoFiltro && deptoFiltro !== 'Todos' && deptoFiltro !== 'todos') {
      const filtroNormalizado = normalizarString(deptoFiltro);

      filtrados = filtrados.filter(evento => {
        const campañaEvento = evento.campaña || 'Sin grupo';
        const campañaNormalizada = normalizarString(campañaEvento);
        return campañaNormalizada.includes(filtroNormalizado);
      });

      console.log(`🔍 Filtrado por departamento "${deptoFiltro}": ${filtrados.length} eventos`);
    }

    // 2. Aplicar filtro por ejecutivo
    if (ejecFiltro && ejecFiltro.trim() !== '') {
      const filtroNormalizado = normalizarString(ejecFiltro);

      filtrados = filtrados.filter(evento => {
        const nombreEjecutivo = evento.nombre || '';
        const nombreNormalizado = normalizarString(nombreEjecutivo);
        return nombreNormalizado.includes(filtroNormalizado);
      });

      console.log(`👤 Filtrado por ejecutivo "${ejecFiltro}": ${filtrados.length} eventos`);
    }

    setEventosFiltrados(filtrados);
  }, []);

  // Función principal para cargar eventos
  const cargarEventos = useCallback(async (
    periodo: 'hoy' | '7dias' | '30dias' | 'personalizado',
    inicio?: string,
    fin?: string,
    deptoFiltroParam?: string | null,
    ejecFiltroParam?: string | null
  ) => {
    setIsLoading(true);
    try {
      let url = `/api/eventos?rango=${periodo}`;

      const deptoFiltro = deptoFiltroParam !== undefined ? deptoFiltroParam : departamentoFiltro;
      const ejecFiltro = ejecFiltroParam !== undefined ? ejecFiltroParam : ejecutivoFiltro;

      console.log('🔄 Iniciando carga de eventos:', {
        periodo,
        inicio,
        fin,
        deptoFiltro,
        ejecFiltro,
        fechaActualLocal: getLocalDateString(),
        fechaActualUTC: new Date().toISOString().split('T')[0]
      });

      if (periodo === 'personalizado' && inicio && fin) {
        url += `&fechaInicio=${inicio}&fechaFin=${fin}`;
      }

      if (deptoFiltro) {
        url += `&departamento=${encodeURIComponent(deptoFiltro)}`;
      }

      if (ejecFiltro) {
        url += `&ejecutivo=${encodeURIComponent(ejecFiltro)}`;
      }

      console.log('🌐 URL final:', url);

      const response = await fetch(url);
      const data = await response.json();

      if (data.success && data.eventos) {
        console.log(`✅ ${data.eventos.length} eventos cargados exitosamente`);

        setEventos(data.eventos);

        if (data.estadisticas?.porCampaña) {
          const usuariosPorDepartamento: Record<string, number> = {};
          Object.entries(data.estadisticas.porCampaña).forEach(([campaña, stats]: [string, any]) => {
            usuariosPorDepartamento[campaña] = stats.total || 0;
          });
          setEstadisticas({
            usuariosPorDepartamento,
            ejecutivos: data.estadisticas.ejecutivos || []
          });
        } else {
          setEstadisticas({
            usuariosPorDepartamento: {},
            ejecutivos: data.estadisticas?.ejecutivos || []
          });
        }

        aplicarFiltros(data.eventos, deptoFiltro, ejecFiltro);
      } else {
        console.error('❌ API no devolvió éxito. Datos:', data);
        setEventos([]);
        setEventosFiltrados([]);
        setEstadisticas({
          usuariosPorDepartamento: {},
          ejecutivos: []
        });
      }
    } catch (error: any) {
      console.error('❌ Error completo cargando eventos:', error);
      setEventos([]);
      setEventosFiltrados([]);
      setEstadisticas({
        usuariosPorDepartamento: {},
        ejecutivos: []
      });
    } finally {
      setIsLoading(false);
    }
  }, [departamentoFiltro, ejecutivoFiltro, aplicarFiltros]);

  // Handler para cambiar filtro de departamento
  const handleFiltroDepartamento = useCallback((nuevoFiltro: string | null) => {
    console.log(`🔄 Cambiando filtro departamento: ${nuevoFiltro}`);

    if (nuevoFiltro && nuevoFiltro !== 'Todos') {
      localStorage.setItem('departamentoFiltro', nuevoFiltro);
    } else {
      localStorage.removeItem('departamentoFiltro');
      nuevoFiltro = null;
    }

    setDepartamentoFiltro(nuevoFiltro);

    if (selectedPeriodo === 'personalizado' && fechaInicio && fechaFin) {
      cargarEventos('personalizado', fechaInicio, fechaFin, nuevoFiltro, ejecutivoFiltro);
    } else {
      cargarEventos(selectedPeriodo, undefined, undefined, nuevoFiltro, ejecutivoFiltro);
    }
  }, [selectedPeriodo, fechaInicio, fechaFin, ejecutivoFiltro, cargarEventos]);

  // Handler para cambiar filtro de ejecutivo
  const handleFiltroEjecutivo = useCallback((nuevoFiltro: string | null) => {
    console.log(`🔄 Cambiando filtro ejecutivo: ${nuevoFiltro}`);

    if (nuevoFiltro) {
      localStorage.setItem('ejecutivoFiltro', nuevoFiltro);
    } else {
      localStorage.removeItem('ejecutivoFiltro');
    }

    setEjecutivoFiltro(nuevoFiltro);

    if (selectedPeriodo === 'personalizado' && fechaInicio && fechaFin) {
      cargarEventos('personalizado', fechaInicio, fechaFin, departamentoFiltro, nuevoFiltro);
    } else {
      cargarEventos(selectedPeriodo, undefined, undefined, departamentoFiltro, nuevoFiltro);
    }
  }, [selectedPeriodo, fechaInicio, fechaFin, departamentoFiltro, cargarEventos]);

  // Handler para descargar Excel
  const handleDescargarExcel = async () => {
    if (eventosFiltrados.length === 0) {
      alert('No hay eventos para descargar');
      return;
    }

    setIsDescargandoExcel(true);
    try {
      let filtroInfo = '';

      if (departamentoFiltro) {
        filtroInfo += `dep_${departamentoFiltro.replace(/\s+/g, '_')}`;
      }

      if (ejecutivoFiltro) {
        filtroInfo += filtroInfo ? '_' : '';
        const nombreCorto = ejecutivoFiltro.substring(0, 20).replace(/\s+/g, '_');
        filtroInfo += `ejec_${nombreCorto}`;
      }

      if (selectedPeriodo !== 'hoy') {
        filtroInfo += filtroInfo ? '_' : '';
        if (selectedPeriodo === 'personalizado') {
          const formatFecha = (fecha: string) => fecha.replace(/-/g, '');
          filtroInfo += `${formatFecha(fechaInicio)}_a_${formatFecha(fechaFin)}`;
        } else {
          filtroInfo += selectedPeriodo;
        }
      }

      descargarExcel(eventosFiltrados, filtroInfo);
    } catch (error) {
      console.error('Error al descargar Excel:', error);
      alert('Error al generar el archivo Excel. Por favor, intente nuevamente.');
    } finally {
      setIsDescargandoExcel(false);
    }
  };

  // Handler para cambiar período - CORREGIDO
  const handlePeriodoChange = (periodo: 'hoy' | '7dias' | '30dias' | 'personalizado') => {
    console.log(`📅 Cambiando período a: ${periodo}`);
    setSelectedPeriodo(periodo);
    
    // Siempre usar fecha LOCAL
    const hoy = new Date();
    const fechaHoy = getLocalDateString();
    
    switch (periodo) {
      case 'hoy':
        setFechaInicio(fechaHoy);
        setFechaFin(fechaHoy);
        cargarEventos('hoy', undefined, undefined, departamentoFiltro, ejecutivoFiltro);
        break;
      case '7dias':
        const hace7Dias = new Date(hoy);
        hace7Dias.setDate(hoy.getDate() - 6);
        setFechaInicio(formatDateForInput(hace7Dias));
        setFechaFin(fechaHoy);
        cargarEventos('7dias', undefined, undefined, departamentoFiltro, ejecutivoFiltro);
        break;
      case '30dias':
        const hace30Dias = new Date(hoy);
        hace30Dias.setDate(hoy.getDate() - 29);
        setFechaInicio(formatDateForInput(hace30Dias));
        setFechaFin(fechaHoy);
        cargarEventos('30dias', undefined, undefined, departamentoFiltro, ejecutivoFiltro);
        break;
      case 'personalizado':
        // Mantener las fechas actuales
        if (fechaInicio && fechaFin) {
          cargarEventos('personalizado', fechaInicio, fechaFin, departamentoFiltro, ejecutivoFiltro);
        }
        break;
    }
    
    console.log('📅 Fechas actualizadas (LOCAL):', {
      periodo,
      fechaInicio: periodo === 'hoy' ? fechaHoy : fechaInicio,
      fechaFin: periodo === 'hoy' ? fechaHoy : fechaFin
    });
  };

  // Handler para cambiar fechas
  const handleFechasChange = (inicio: string, fin: string) => {
    console.log(`📆 Cambiando fechas: ${inicio} - ${fin}`);
    setFechaInicio(inicio);
    setFechaFin(fin);
  };

  // Handler para refresh
  const handleRefresh = () => {
    console.log('🔄 Refrescando eventos...');
    if (selectedPeriodo === 'personalizado' && fechaInicio && fechaFin) {
      cargarEventos('personalizado', fechaInicio, fechaFin, departamentoFiltro, ejecutivoFiltro);
    } else {
      cargarEventos(selectedPeriodo, undefined, undefined, departamentoFiltro, ejecutivoFiltro);
    }
  };

  // Cargar datos iniciales
  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('📅 Cargando datos iniciales...');
      console.log('📅 Fecha actual LOCAL:', getLocalDateString());
      console.log('📅 Fecha actual UTC:', new Date().toISOString().split('T')[0]);
      cargarEventos('hoy', undefined, undefined, null, null);
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);

  // Auto-buscar en personalizado cuando cambian las fechas
  useEffect(() => {
    if (selectedPeriodo === 'personalizado' && fechaInicio && fechaFin) {
      console.log(`🔄 Cargando eventos personalizados: ${fechaInicio} - ${fechaFin}`);
      cargarEventos('personalizado', fechaInicio, fechaFin, departamentoFiltro, ejecutivoFiltro);
    }
  }, [fechaInicio, fechaFin, selectedPeriodo, departamentoFiltro, ejecutivoFiltro, cargarEventos]);

  // Debug: mostrar estado de fechas
  useEffect(() => {
    console.log('📅 Estado actual de fechas:', {
      selectedPeriodo,
      fechaInicio,
      fechaFin,
      hoyLocal: getLocalDateString(),
      hoyUTC: new Date().toISOString().split('T')[0]
    });
  }, [selectedPeriodo, fechaInicio, fechaFin]);

  return (
    <IdleSessionProtector timeoutMinutes={15}>
      <>
        <Navbar />
        <div className="min-h-screen bg-gray-50">
          <div className="container mx-auto">
            <HeaderEventos
              estadisticas={estadisticas}
              departamentoFiltro={departamentoFiltro}
              ejecutivoFiltro={ejecutivoFiltro}
              onFiltroChange={handleFiltroDepartamento}
              onEjecutivoChange={handleFiltroEjecutivo}
              eventosCount={eventosFiltrados.length}
              onRefresh={handleRefresh}
              isRefreshing={isLoading}
              selectedPeriodo={selectedPeriodo}
              onPeriodoChange={handlePeriodoChange}
              onFechasChange={handleFechasChange}
              fechaInicio={fechaInicio}
              fechaFin={fechaFin}
            />

            <div className="px-4 pb-8">
              {/* Botón de descarga */}
              <div className="mb-4 flex justify-end">
                <button
                  onClick={handleDescargarExcel}
                  disabled={isDescargandoExcel || eventosFiltrados.length === 0}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg font-medium flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                >
                  {isDescargandoExcel ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Generando Excel...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Descargar Excel ({eventosFiltrados.length})
                    </>
                  )}
                </button>
              </div>

              {/* Indicadores de filtros activos */}
              {(departamentoFiltro || ejecutivoFiltro) && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {departamentoFiltro && (
                    <div className="inline-flex items-center px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-full text-sm font-medium border border-emerald-200">
                      <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      Departamento: {departamentoFiltro}
                    </div>
                  )}

                  {ejecutivoFiltro && (
                    <div className="inline-flex items-center px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-sm font-medium border border-blue-200">
                      <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Ejecutivo: {ejecutivoFiltro}
                    </div>
                  )}

                  <button
                    onClick={() => {
                      handleFiltroDepartamento(null);
                      handleFiltroEjecutivo(null);
                    }}
                    className="inline-flex items-center px-3 py-1.5 bg-gray-100 text-gray-800 rounded-full text-sm font-medium border border-gray-200 hover:bg-gray-200 transition-colors"
                  >
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Limpiar filtros
                  </button>
                </div>
              )}

              <EventosTable
                eventos={eventosFiltrados}
                isLoading={isLoading}
              />
            </div>
          </div>
        </div>
      </>
    </IdleSessionProtector>
  );
}