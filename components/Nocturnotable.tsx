'use client';

import { useState, useEffect } from 'react';
import { Pagination } from '@/components/Pagination';

export interface EventoNocturno {
    id?: number;
    empleadoId: string;
    nombre: string;
    fecha: string;
    horaEntrada: string;
    horaSalida: string;
    horaSalidaAlmuerzo: string;
    horaEntradaAlmuerzo: string;
    duracionAlmuerzo: string;
    campaña: string;
    dispositivo: string;
    horasTrabajadas: number | null;
    horasTrabajadasFormato: string;
    minutosExtrasNoche: number;
}

interface NocturnoTableProps {
    eventos: EventoNocturno[];
    isLoading: boolean;
}

const ITEMS_PER_PAGE = 10;

const getDepartamentoBadge = (campaña: string) => {
    const colores: Record<string, string> = {
        'Campana 5757': 'bg-emerald-100 text-emerald-800 border border-emerald-200',
        'Campana SAV': 'bg-yellow-100 text-yellow-800 border border-yellow-200',
        'Campana REFI': 'bg-red-100 text-red-800 border border-red-200',
        'Campana PL': 'bg-indigo-100 text-indigo-800 border border-indigo-200',
        'Campana PARLO': 'bg-pink-100 text-pink-800 border border-pink-200',
        'TI': 'bg-purple-100 text-purple-800 border border-purple-200',
        'Teams Leaders': 'bg-blue-100 text-blue-800 border border-blue-200',
        'Administrativo': 'bg-gray-100 text-gray-800 border border-gray-200',
    };
    const estilo = colores[campaña] || 'bg-gray-100 text-gray-800 border border-gray-200';
    return (
        <span className={`px-2.5 py-1 ${estilo} rounded-lg text-xs font-medium whitespace-nowrap`}>
            {campaña}
        </span>
    );
};

const getHorasBadge = (horas: number | null, formato: string) => {
    if (horas === null) return <span className="text-gray-400 text-sm">N/A</span>;

    let bg = 'bg-blue-100 text-blue-800 border-blue-200';
    if (horas >= 14) bg = 'bg-red-100 text-red-800 border-red-200';
    else if (horas >= 12) bg = 'bg-yellow-100 text-yellow-800 border-yellow-200';

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${bg}`}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {formato}
        </span>
    );
};

const getMinutosExtrasBadge = (minutos: number, horaSalida: string) => {
    let badge = 'bg-blue-100 text-blue-800';
    if (minutos >= 120) badge = 'bg-red-100 text-red-800';
    else if (minutos >= 60) badge = 'bg-yellow-100 text-yellow-800';

    return (
        <div className="flex flex-col items-center gap-0.5">
            <span className="text-sm font-bold text-gray-800">{horaSalida || '-'}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${badge}`}>
                +{minutos} min desde 19:00
            </span>
        </div>
    );
};

const formatFecha = (fechaStr: string) => {
    if (!fechaStr) return '-';
    try {
        if (fechaStr.includes('-') && fechaStr.length === 10) {
            const [year, month, day] = fechaStr.split('-');
            return `${day}-${month}-${year}`;
        }
        return fechaStr;
    } catch {
        return '-';
    }
};

export function NocturnoTable({ eventos, isLoading }: NocturnoTableProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [paginatedEventos, setPaginatedEventos] = useState<EventoNocturno[]>([]);
    const totalPages = Math.ceil(eventos.length / ITEMS_PER_PAGE);

    useEffect(() => { setCurrentPage(1); }, [eventos]);

    useEffect(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        setPaginatedEventos(eventos.slice(start, start + ITEMS_PER_PAGE));
    }, [currentPage, eventos]);

    return (
        <div className="overflow-x-auto rounded-lg shadow-lg bg-white">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gradient-to-r from-slate-700 to-slate-800 text-white text-sm">
                    <tr>
                        <th className="py-2.5 px-3 text-left font-semibold">ID</th>
                        <th className="py-2.5 px-3 text-left font-semibold">Nombre</th>
                        <th className="py-2.5 px-3 text-left font-semibold">Fecha</th>
                        <th className="py-2.5 px-3 text-left font-semibold">Entrada</th>
                        <th className="py-2.5 px-3 text-center font-semibold">Salida</th>
                        <th className="py-2.5 px-3 text-center font-semibold">Horas trabajadas</th>
                        <th className="py-2.5 px-3 text-left font-semibold">Almuerzo</th>
                        <th className="py-2.5 px-3 text-left font-semibold">Campaña</th>
                    </tr>
                </thead>

                {isLoading ? (
                    <tbody>
                        <tr>
                            <td colSpan={8} className="text-center py-10 text-gray-500">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="h-8 w-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
                                    <span>Cargando registros...</span>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                ) : (
                    <tbody className="bg-white divide-y divide-gray-200">
                        {paginatedEventos.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="text-center py-10 text-gray-500">
                                    <div className="flex flex-col items-center gap-2">
                                        <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                                        </svg>
                                        <span>Sin registros que cumplan los criterios</span>
                                        <span className="text-xs text-gray-400">Salida después de 19:00 y más de 10 horas trabajadas</span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            paginatedEventos.map((evento, index) => (
                                <tr key={index} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {evento.empleadoId}
                                    </td>

                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                                {evento.nombre.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="text-sm font-medium text-gray-900">{evento.nombre}</span>
                                        </div>
                                    </td>

                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                                        {formatFecha(evento.fecha)}
                                    </td>

                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {evento.horaEntrada || '-'}
                                    </td>

                                    <td className="px-4 py-4 whitespace-nowrap text-center">
                                        {getMinutosExtrasBadge(evento.minutosExtrasNoche, evento.horaSalida)}
                                    </td>

                                    <td className="px-4 py-4 whitespace-nowrap text-center">
                                        {getHorasBadge(evento.horasTrabajadas, evento.horasTrabajadasFormato)}
                                    </td>

                                    <td className="px-4 py-4 whitespace-nowrap">
                                        {evento.horaSalidaAlmuerzo && evento.horaEntradaAlmuerzo ? (
                                            <div className="flex flex-col text-xs text-gray-600">
                                                <span className="font-medium text-gray-800">
                                                    {evento.horaSalidaAlmuerzo} → {evento.horaEntradaAlmuerzo}
                                                </span>
                                                {evento.duracionAlmuerzo && (
                                                    <span className="text-gray-400">({evento.duracionAlmuerzo})</span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-xs text-gray-400 italic">Sin registro</span>
                                        )}
                                    </td>

                                    <td className="px-4 py-4 whitespace-nowrap">
                                        {getDepartamentoBadge(evento.campaña || 'Sin campaña')}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                )}
            </table>

            {!isLoading && totalPages > 1 && (
                <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 sm:px-6">
                    <div className="flex flex-col sm:flex-row items-center justify-between">
                        <div className="text-sm text-gray-700 mb-2 sm:mb-0">
                            Mostrando <span className="font-medium">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> a{' '}
                            <span className="font-medium">{Math.min(currentPage * ITEMS_PER_PAGE, eventos.length)}</span>{' '}
                            de <span className="font-medium">{eventos.length}</span> registros
                        </div>
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={setCurrentPage}
                        />
                    </div>
                </div>
            )}

            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css" />
        </div>
    );
}