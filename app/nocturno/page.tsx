'use client';

import { useState, useEffect, useCallback } from 'react';
import Navbar from '@/components/navbar';
import IdleSessionProtector from '@/components/IdleSessionProtector';
import { NocturnoTable, EventoNocturno } from '@/components/Nocturnotable';
import { descargarExcelNocturnoPage } from '@/utils/excelNocturno';
import { getLocalDateString, formatDateForInput } from '@/utils/dateUtils';

interface Estadisticas {
    porCampaña: Record<string, { total: number; horasPromedio: number; salidaTardia: number; entradaTemprana: number; ambos: number }>;
    horasMax: number;
    horasPromedio: number;
    totalSalidaTardia: number;
    totalEntradaTemprana: number;
    totalAmbos: number;
    horaLimiteUsada: number;
    horaEntradaUsada: number;
    horasMinimasUsadas: number;
}

export default function NocturnoPage() {
    const [eventos, setEventos] = useState<EventoNocturno[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedPeriodo, setSelectedPeriodo] = useState<'hoy' | '7dias' | '30dias' | 'personalizado'>('hoy');
    const [fechaInicio, setFechaInicio] = useState('');
    const [fechaFin, setFechaFin] = useState('');
    const [departamentoFiltro, setDepartamentoFiltro] = useState<string | null>(null);
    const [ejecutivoFiltro, setEjecutivoFiltro] = useState('');
    const [campañasDisponibles, setCampañasDisponibles] = useState<string[]>([]);
    const [estadisticas, setEstadisticas] = useState<Estadisticas>({
        porCampaña: {},
        horasMax: 0,
        horasPromedio: 0,
        totalSalidaTardia: 0,
        totalEntradaTemprana: 0,
        totalAmbos: 0,
        horaLimiteUsada: 19,
        horaEntradaUsada: 6,
        horasMinimasUsadas: 10,
    });
    const [isDownloading, setIsDownloading] = useState(false);

    useEffect(() => {
        const hoy = getLocalDateString();
        setFechaInicio(hoy);
        setFechaFin(hoy);
    }, []);

    const cargarEventos = useCallback(async (
        periodo: 'hoy' | '7dias' | '30dias' | 'personalizado',
        inicio?: string,
        fin?: string,
        depto?: string | null,
        ejec?: string
    ) => {
        setIsLoading(true);
        try {
            let url = `/api/nocturno?rango=${periodo}`;
            if (periodo === 'personalizado' && inicio && fin) {
                url += `&fechaInicio=${inicio}&fechaFin=${fin}`;
            }
            if (depto && depto !== 'Todos') url += `&departamento=${encodeURIComponent(depto)}`;
            if (ejec) url += `&ejecutivo=${encodeURIComponent(ejec)}`;

            const res = await fetch(url);
            const data = await res.json();

            if (data.success) {
                setEventos(data.eventos || []);
                setEstadisticas(data.estadisticas || {
                    porCampaña: {}, horasMax: 0, horasPromedio: 0,
                    totalSalidaTardia: 0, totalEntradaTemprana: 0, totalAmbos: 0,
                    horaLimiteUsada: 19, horaEntradaUsada: 6, horasMinimasUsadas: 10,
                });
                setCampañasDisponibles(data.campañasDisponibles || []);
            } else {
                setEventos([]);
            }
        } catch (err) {
            console.error('Error cargando eventos nocturnos:', err);
            setEventos([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            cargarEventos('hoy', undefined, undefined, null, '');
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    const handlePeriodoChange = (periodo: 'hoy' | '7dias' | '30dias' | 'personalizado') => {
        setSelectedPeriodo(periodo);
        const hoy = getLocalDateString();
        const ahora = new Date();

        if (periodo === 'hoy') {
            setFechaInicio(hoy); setFechaFin(hoy);
            cargarEventos('hoy', undefined, undefined, departamentoFiltro, ejecutivoFiltro);
        } else if (periodo === '7dias') {
            const inicio = new Date(ahora); inicio.setDate(ahora.getDate() - 6);
            setFechaInicio(formatDateForInput(inicio)); setFechaFin(hoy);
            cargarEventos('7dias', undefined, undefined, departamentoFiltro, ejecutivoFiltro);
        } else if (periodo === '30dias') {
            const inicio = new Date(ahora); inicio.setDate(ahora.getDate() - 29);
            setFechaInicio(formatDateForInput(inicio)); setFechaFin(hoy);
            cargarEventos('30dias', undefined, undefined, departamentoFiltro, ejecutivoFiltro);
        }
    };

    const handleRefresh = () => {
        if (selectedPeriodo === 'personalizado' && fechaInicio && fechaFin) {
            cargarEventos('personalizado', fechaInicio, fechaFin, departamentoFiltro, ejecutivoFiltro);
        } else {
            cargarEventos(selectedPeriodo, undefined, undefined, departamentoFiltro, ejecutivoFiltro);
        }
    };

    const handleDescargarExcel = async () => {
        if (eventos.length === 0 || isDownloading) return;
        setIsDownloading(true);
        try {
            await new Promise(r => setTimeout(r, 200));
            descargarExcelNocturnoPage(
                eventos,
                selectedPeriodo === 'personalizado'
                    ? `${fechaInicio.replace(/-/g, '')}_a_${fechaFin.replace(/-/g, '')}`
                    : selectedPeriodo
            );
        } catch (err) {
            console.error(err);
        } finally {
            setIsDownloading(false);
        }
    };

    const periodos: { value: 'hoy' | '7dias' | '30dias' | 'personalizado'; label: string }[] = [
        { value: 'hoy', label: 'Hoy' },
        { value: '7dias', label: '7 días' },
        { value: '30dias', label: '30 días' },
        { value: 'personalizado', label: 'Personalizado' },
    ];

    return (
        <IdleSessionProtector timeoutMinutes={15}>
            <>
                <Navbar />
                <div className="min-h-screen bg-gray-50">

                    {/* ── Header ── */}
                    <div className="bg-white border-b border-gray-200 shadow-sm pt-16">
                        <div className="container mx-auto px-4 py-5">

                            {/* Título + refresh */}
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center flex-shrink-0">
                                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h1 className="text-xl font-bold text-gray-900">Recargos</h1>
                                        <p className="text-gray-500 text-sm">Salida después de 19:00 o entrada antes de 06:00 · Más de 10 horas trabajadas</p>
                                    </div>
                                </div>

                                <button
                                    onClick={handleRefresh}
                                    disabled={isLoading}
                                    className="self-start sm:self-center flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                                >
                                    <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    {isLoading ? 'Cargando...' : 'Actualizar'}
                                </button>
                            </div>

                            {/* Tarjetas de estadísticas */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                                    <div className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-1">Total registros</div>
                                    <div className="text-2xl font-bold text-gray-900">{eventos.length}</div>
                                    <div className="text-gray-400 text-xs mt-0.5">empleados</div>
                                </div>
                                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                                    <div className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-1">Salida tardía</div>
                                    <div className="text-2xl font-bold text-gray-900">{estadisticas.totalSalidaTardia}</div>
                                    <div className="text-gray-400 text-xs mt-0.5"> después de 19:00</div>
                                </div>
                                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                                    <div className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-1">Entrada temprana</div>
                                    <div className="text-2xl font-bold text-gray-900">{estadisticas.totalEntradaTemprana}</div>
                                    <div className="text-gray-400 text-xs mt-0.5"> antes de 06:00</div>
                                </div>
                                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                                    <div className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-1">Ambas condiciones</div>
                                    <div className="text-2xl font-bold text-gray-900">{estadisticas.totalAmbos}</div>
                                    <div className="text-gray-400 text-xs mt-0.5">⚠ entrada y salida</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Contenido ── */}
                    <div className="container mx-auto px-4 pb-8 py-5">

                        {/* Filtros */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
                            <div className="flex flex-col md:flex-row gap-4 items-start md:items-end flex-wrap">

                                {/* Período */}
                                <div className="flex-1 min-w-0">
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                        Período
                                    </label>
                                    <div className="flex gap-1.5 flex-wrap">
                                        {periodos.map(p => (
                                            <button
                                                key={p.value}
                                                onClick={() => handlePeriodoChange(p.value)}
                                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedPeriodo === p.value
                                                    ? 'bg-slate-700 text-white shadow-sm'
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                    }`}
                                            >
                                                {p.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Fechas personalizadas */}
                                {selectedPeriodo === 'personalizado' && (
                                    <div className="flex items-end gap-2 flex-wrap">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Desde</label>
                                            <input
                                                type="date"
                                                value={fechaInicio}
                                                onChange={e => setFechaInicio(e.target.value)}
                                                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Hasta</label>
                                            <input
                                                type="date"
                                                value={fechaFin}
                                                onChange={e => setFechaFin(e.target.value)}
                                                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
                                            />
                                        </div>
                                        <button
                                            onClick={() => cargarEventos('personalizado', fechaInicio, fechaFin, departamentoFiltro, ejecutivoFiltro)}
                                            className="px-4 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors"
                                        >
                                            Buscar
                                        </button>
                                    </div>
                                )}

                                {/* Filtro campaña */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Campaña</label>
                                    <select
                                        value={departamentoFiltro || ''}
                                        onChange={e => {
                                            const val = e.target.value || null;
                                            setDepartamentoFiltro(val);
                                            if (selectedPeriodo === 'personalizado' && fechaInicio && fechaFin) {
                                                cargarEventos('personalizado', fechaInicio, fechaFin, val, ejecutivoFiltro);
                                            } else {
                                                cargarEventos(selectedPeriodo, undefined, undefined, val, ejecutivoFiltro);
                                            }
                                        }}
                                        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-400 min-w-[150px]"
                                    >
                                        <option value="">Todas</option>
                                        {campañasDisponibles.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Filtro empleado */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Empleado</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="Buscar nombre..."
                                            value={ejecutivoFiltro}
                                            onChange={e => setEjecutivoFiltro(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    if (selectedPeriodo === 'personalizado' && fechaInicio && fechaFin) {
                                                        cargarEventos('personalizado', fechaInicio, fechaFin, departamentoFiltro, ejecutivoFiltro);
                                                    } else {
                                                        cargarEventos(selectedPeriodo, undefined, undefined, departamentoFiltro, ejecutivoFiltro);
                                                    }
                                                }
                                            }}
                                            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-400 w-40"
                                        />
                                        {ejecutivoFiltro && (
                                            <button
                                                onClick={() => {
                                                    setEjecutivoFiltro('');
                                                    if (selectedPeriodo === 'personalizado' && fechaInicio && fechaFin) {
                                                        cargarEventos('personalizado', fechaInicio, fechaFin, departamentoFiltro, '');
                                                    } else {
                                                        cargarEventos(selectedPeriodo, undefined, undefined, departamentoFiltro, '');
                                                    }
                                                }}
                                                className="px-2 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-500 text-sm transition-colors"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Filtros activos */}
                            {(departamentoFiltro || ejecutivoFiltro) && (
                                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                                    {departamentoFiltro && (
                                        <div className="inline-flex items-center px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-full text-sm font-medium border border-emerald-200">
                                            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                            </svg>
                                            Campaña: {departamentoFiltro}
                                        </div>
                                    )}
                                    {ejecutivoFiltro && (
                                        <div className="inline-flex items-center px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-sm font-medium border border-blue-200">
                                            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                            Empleado: {ejecutivoFiltro}
                                        </div>
                                    )}
                                    <button
                                        onClick={() => {
                                            setDepartamentoFiltro(null);
                                            setEjecutivoFiltro('');
                                            cargarEventos(selectedPeriodo, fechaInicio, fechaFin, null, '');
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
                        </div>

                        {/* Botón descarga */}
                        <div className="mb-4 flex justify-end">
                            <button
                                onClick={handleDescargarExcel}
                                disabled={eventos.length === 0 || isDownloading || isLoading}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg text-sm font-medium shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isDownloading ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                        Generando...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        Descargar Excel ({eventos.length})
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Mini tarjetas por campaña */}
                        {!isLoading && Object.keys(estadisticas.porCampaña).length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
                                {Object.entries(estadisticas.porCampaña)
                                    .sort(([, a], [, b]) => b.total - a.total)
                                    .map(([campaña, stats]) => (
                                        <div key={campaña} className="bg-white rounded-lg border border-gray-200 shadow-sm p-3">
                                            <div className="text-xs font-semibold text-gray-600 truncate mb-1">{campaña}</div>
                                            <div className="flex items-end justify-between">
                                                <span className="text-2xl font-bold text-gray-800">{stats.total}</span>
                                                <span className="text-xs text-gray-400 pb-0.5">~{stats.horasPromedio}h prom.</span>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        )}

                        {/* Tabla */}
                        <NocturnoTable eventos={eventos} isLoading={isLoading} />

                        {/* Leyenda */}
                        <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
                            <div className="flex items-center gap-1.5">
                                <span className="inline-block w-3 h-3 rounded-sm bg-indigo-100 border border-indigo-200" />
                                Entrada antes de 06:00
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="inline-block w-3 h-3 rounded-sm bg-blue-100 border border-blue-200" />
                                Salida después de 19:00
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="inline-block w-3 h-3 rounded-sm bg-red-100 border border-red-200" />
                                Ambas condiciones
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="inline-block w-3 h-3 rounded-sm bg-yellow-100 border border-yellow-200" />
                                12–14 horas trabajadas
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="inline-block w-3 h-3 rounded-sm bg-red-200 border border-red-300" />
                                14+ horas trabajadas
                            </div>
                        </div>
                    </div>
                </div>
            </>
        </IdleSessionProtector>
    );
}