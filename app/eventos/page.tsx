'use client';

import { useState, useEffect, useCallback } from 'react';
import { EventosTable } from '@/components/EventosTable';
import { HeaderEventos } from '@/components/Header';
import Navbar from "@/components/navbar";
import IdleSessionProtector from '@/components/IdleSessionProtector';
import { ExcelDownloadButton } from '@/components/ExcelDownloadButton';
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

  // Construye el filtroInfo para el nombre del archivo Excel
  const buildFiltroInfo = (): string => {
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

    return filtroInfo;
  };

  // Inicializar desde localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedDeptoFilter = localStorage.getItem('departamentoFiltro');
      const savedEjecutivoFilter = localStorage.getItem('ejecutivoFiltro');

      if (savedDeptoFilter) setDepartamentoFiltro(savedDeptoFilter);
      if (savedEjecutivoFilter) setEjecutivoFiltro(savedEjecutivoFilter);

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

    if (deptoFiltro && deptoFiltro !== 'Todos' && deptoFiltro !== 'todos') {
      const filtroNormalizado = normalizarString(deptoFiltro);
      filtrados = filtrados.filter(evento => {
        const campañaEvento = evento.campaña || 'Sin grupo';
        return normalizarString(campañaEvento).includes(filtroNormalizado);
      });
      console.log(`🔍 Filtrado por departamento "${deptoFiltro}": ${filtrados.length} eventos`);
    }

    if (ejecFiltro && ejecFiltro.trim() !== '') {
      const filtroNormalizado = normalizarString(ejecFiltro);
      filtrados = filtrados.filter(evento =>
        normalizarString(evento.nombre || '').includes(filtroNormalizado)
      );
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

      if (periodo === 'personalizado' && inicio && fin) {
        url += `&fechaInicio=${inicio}&fechaFin=${fin}`;
      }
      if (deptoFiltro) url += `&departamento=${encodeURIComponent(deptoFiltro)}`;
      if (ejecFiltro) url += `&ejecutivo=${encodeURIComponent(ejecFiltro)}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.success && data.eventos) {
        setEventos(data.eventos);

        if (data.estadisticas?.porCampaña) {
          const usuariosPorDepartamento: Record<string, number> = {};
          Object.entries(data.estadisticas.porCampaña).forEach(([campaña, stats]: [string, any]) => {
            usuariosPorDepartamento[campaña] = stats.total || 0;
          });
          setEstadisticas({ usuariosPorDepartamento, ejecutivos: data.estadisticas.ejecutivos || [] });
        } else {
          setEstadisticas({ usuariosPorDepartamento: {}, ejecutivos: data.estadisticas?.ejecutivos || [] });
        }

        aplicarFiltros(data.eventos, deptoFiltro, ejecFiltro);
      } else {
        setEventos([]);
        setEventosFiltrados([]);
        setEstadisticas({ usuariosPorDepartamento: {}, ejecutivos: [] });
      }
    } catch (error: any) {
      console.error('❌ Error cargando eventos:', error);
      setEventos([]);
      setEventosFiltrados([]);
      setEstadisticas({ usuariosPorDepartamento: {}, ejecutivos: [] });
    } finally {
      setIsLoading(false);
    }
  }, [departamentoFiltro, ejecutivoFiltro, aplicarFiltros]);

  // Handler para cambiar filtro de departamento
  const handleFiltroDepartamento = useCallback((nuevoFiltro: string | null) => {
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

  // Handler para cambiar período
  const handlePeriodoChange = (periodo: 'hoy' | '7dias' | '30dias' | 'personalizado') => {
    setSelectedPeriodo(periodo);
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
        if (fechaInicio && fechaFin) {
          cargarEventos('personalizado', fechaInicio, fechaFin, departamentoFiltro, ejecutivoFiltro);
        }
        break;
    }
  };

  // Handler para cambiar fechas
  const handleFechasChange = (inicio: string, fin: string) => {
    setFechaInicio(inicio);
    setFechaFin(fin);
  };

  // Handler para refresh
  const handleRefresh = () => {
    if (selectedPeriodo === 'personalizado' && fechaInicio && fechaFin) {
      cargarEventos('personalizado', fechaInicio, fechaFin, departamentoFiltro, ejecutivoFiltro);
    } else {
      cargarEventos(selectedPeriodo, undefined, undefined, departamentoFiltro, ejecutivoFiltro);
    }
  };

  // Cargar datos iniciales
  useEffect(() => {
    const timer = setTimeout(() => {
      cargarEventos('hoy', undefined, undefined, null, null);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Auto-buscar en personalizado cuando cambian las fechas
  useEffect(() => {
    if (selectedPeriodo === 'personalizado' && fechaInicio && fechaFin) {
      cargarEventos('personalizado', fechaInicio, fechaFin, departamentoFiltro, ejecutivoFiltro);
    }
  }, [fechaInicio, fechaFin, selectedPeriodo, departamentoFiltro, ejecutivoFiltro, cargarEventos]);

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
                <ExcelDownloadButton
                  eventos={eventosFiltrados}
                  filtroInfo={buildFiltroInfo()}
                  disabled={isLoading}
                />
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