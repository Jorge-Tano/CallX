'use client';

import { useState, useEffect, useCallback } from 'react';
import { EventosTable } from '@/components/EventosTable';
import { HeaderEventos } from '@/components/Header';
import Navbar from "@/components/navbar";
import IdleSessionProtector from '@/components/IdleSessionProtector';
import { descargarExcel } from '@/utils/excelGenerator';

export interface Evento {
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

export default function EventosPage() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [eventosFiltrados, setEventosFiltrados] = useState<Evento[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriodo, setSelectedPeriodo] = useState<'hoy' | '7dias' | '30dias' | 'personalizado'>('hoy');
  const [fechaInicio, setFechaInicio] = useState<string>('');
  const [fechaFin, setFechaFin] = useState<string>('');
  const [departamentoFiltro, setDepartamentoFiltro] = useState<string | null>(null);
  const [estadisticasDepartamentos, setEstadisticasDepartamentos] = useState({
    usuariosPorDepartamento: {} as Record<string, number>
  });
  const [isDescargandoExcel, setIsDescargandoExcel] = useState(false);

  // Inicializar desde localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedFilter = localStorage.getItem('departamentoFiltro');
      if (savedFilter) {
        setDepartamentoFiltro(savedFilter);
      }
      
      const hoy = new Date().toISOString().split('T')[0];
      setFechaInicio(hoy);
      setFechaFin(hoy);
    }
  }, []);

  // Cargar eventos desde el API
  const cargarEventos = useCallback(async (
    periodo: 'hoy' | '7dias' | '30dias' | 'personalizado',
    inicio?: string,
    fin?: string
  ) => {
    setIsLoading(true);
    try {
      let url = `/api/eventos/bd?rango=${periodo}`;
      if (periodo === 'personalizado' && inicio && fin) {
        url += `&fechaInicio=${inicio}&fechaFin=${fin}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (data.success && data.eventos) {
        
        // Verificar estructura de datos
        if (data.eventos.length > 0) {          
          const campañasUnicas = [...new Set(data.eventos.map((e: Evento) => e.campaña))];
        }

        setEventos(data.eventos);
        
        // Extraer estadísticas para filtros
        if (data.estadisticas?.porCampaña) {
          const usuariosPorDepartamento: Record<string, number> = {};
          Object.entries(data.estadisticas.porCampaña).forEach(([campaña, stats]: [string, any]) => {
            usuariosPorDepartamento[campaña] = stats.total || 0;
          });
          setEstadisticasDepartamentos({ usuariosPorDepartamento });
        }

        // Aplicar filtro actual a los nuevos datos
        aplicarFiltro(data.eventos, departamentoFiltro);
      } else {
        console.error('❌ API no devolvió éxito');
        setEventos([]);
        setEventosFiltrados([]);
      }
    } catch (error) {
      console.error('❌ Error cargando eventos:', error);
      setEventos([]);
      setEventosFiltrados([]);
    } finally {
      setIsLoading(false);
    }
  }, [departamentoFiltro]);

  // Función normalizadora para comparar strings (elimina espacios y convierte a minúsculas)
  const normalizarString = (str: string): string => {
    return str.trim().toLowerCase().replace(/\s+/g, ' ');
  };

  // Aplicar filtro por departamento/campaña
  const aplicarFiltro = useCallback((eventosLista: Evento[], filtro: string | null) => {
    if (!filtro || filtro === 'Todos' || filtro === 'todos') {
      
      setEventosFiltrados(eventosLista);
      return;
    }
    
    const filtroNormalizado = normalizarString(filtro);
    
    const filtrados = eventosLista.filter(evento => {
      const campañaEvento = evento.campaña || 'Sin grupo';
      const campañaNormalizada = normalizarString(campañaEvento);
      
      const coincide = campañaNormalizada === filtroNormalizado;
      
      if (coincide) {
        
      }
      
      return coincide;
    });
    
    setEventosFiltrados(filtrados);
  }, []);

  // Handler para cambiar filtro
  const handleFiltroDepartamento = useCallback((nuevoFiltro: string | null) => {    
    if (nuevoFiltro && nuevoFiltro !== 'Todos') {
      localStorage.setItem('departamentoFiltro', nuevoFiltro);
    } else {
      localStorage.removeItem('departamentoFiltro');
      nuevoFiltro = null;
    }

    setDepartamentoFiltro(nuevoFiltro);
    
    // Aplicar filtro a los eventos actuales
    aplicarFiltro(eventos, nuevoFiltro);
  }, [eventos, departamentoFiltro, aplicarFiltro]);

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

  // Handler para cambiar período
  const handlePeriodoChange = (periodo: 'hoy' | '7dias' | '30dias' | 'personalizado') => {
    setSelectedPeriodo(periodo);
    if (periodo !== 'personalizado') {
      cargarEventos(periodo);
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
      cargarEventos('personalizado', fechaInicio, fechaFin);
    } else {
      cargarEventos(selectedPeriodo);
    }
  };

  // Cargar datos iniciales
  useEffect(() => {
    cargarEventos('hoy');
  }, []);

  // Auto-buscar en personalizado cuando cambian las fechas
  useEffect(() => {
    if (selectedPeriodo === 'personalizado' && fechaInicio && fechaFin) {
      cargarEventos('personalizado', fechaInicio, fechaFin);
    }
  }, [fechaInicio, fechaFin, selectedPeriodo]);

  return (
    <IdleSessionProtector timeoutMinutes={15}>
      <>
        <Navbar />
        <div className="min-h-screen bg-gray-50">
          <div className="container mx-auto">
            <HeaderEventos
              estadisticas={estadisticasDepartamentos}
              departamentoFiltro={departamentoFiltro}
              onFiltroChange={handleFiltroDepartamento}
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