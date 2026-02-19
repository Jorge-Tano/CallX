import { useState, useEffect } from "react";
import { Evento } from "@/app/eventos/page";
import { Pagination } from "@/components/Pagination";

interface TablaEventosProps {
  eventos: Evento[];
  isLoading: boolean;
}

// ¡MANTÉN EXACTAMENTE LOS COLORES QUE TENÍAS ANTES!
const getDepartamentoDisplay = (departamento: string | undefined) => {
  if (!departamento || departamento === 'No asignado') {
    return <span className="text-gray-400 text-sm">No asignado</span>;
  }

  // ¡TUS COLORES ORIGINALES!
  const coloresDepartamentos: Record<string, string> = {
    "Campana 5757": "bg-emerald-100 text-emerald-800 border border-emerald-200",
    "Campana SAV": "bg-yellow-100 text-yellow-800 border border-yellow-200",
    "Campana REFI": "bg-red-100 text-red-800 border border-red-200",
    "Campana PL": "bg-indigo-100 text-indigo-800 border border-indigo-200",
    "Campana PARLO": "bg-pink-100 text-pink-800 border border-pink-200",
    "TI": "bg-pink-100 text-purple-800 border-purple-200",
    "Teams Leaders": "bg-blue-100 text-blue-800 border-blue-200",
    "Administrativo": "bg-gray-100 text-gray-800 border border-gray-200"
    
  };

  const estilo = coloresDepartamentos[departamento] || "bg-gray-100 text-gray-800 border border-gray-200";

  return (
    <span className={`px-2.5 py-1 ${estilo} rounded-lg text-xs font-medium whitespace-nowrap`}>
      {departamento}
    </span>
  );
};

// Componente para mostrar SOLO la información del almuerzo
function InformacionAlmuerzo({ evento }: { evento: Evento }) {
  // Manejo seguro de propiedades que podrían no existir
  const horaSalidaAlmuerzo = evento.horaSalidaAlmuerzo || null;
  const horaEntradaAlmuerzo = evento.horaEntradaAlmuerzo || null;
  const duracionAlmuerzo = evento.duracionAlmuerzo || null;

  const tieneSalidaAlmuerzo = horaSalidaAlmuerzo && horaSalidaAlmuerzo !== '--:--' && horaSalidaAlmuerzo !== '';
  const tieneEntradaAlmuerzo = horaEntradaAlmuerzo && horaEntradaAlmuerzo !== '--:--' && horaEntradaAlmuerzo !== '';

  // Si no hay ningún registro de almuerzo
  if (!tieneSalidaAlmuerzo && !tieneEntradaAlmuerzo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60px]">
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          <i className="bi bi-dash-circle mr-1.5"></i>
          Sin almuerzo
        </span>
      </div>
    );
  }

  // Si tiene almuerzo completo
  if (tieneSalidaAlmuerzo && tieneEntradaAlmuerzo && horaSalidaAlmuerzo && horaEntradaAlmuerzo) {
    // Calcular duración si no está incluida
    let duracion = duracionAlmuerzo;
    if (!duracion) {
      try {
        const [h1, m1] = horaSalidaAlmuerzo.split(':').map(Number);
        const [h2, m2] = horaEntradaAlmuerzo.split(':').map(Number);
        const minutosSalida = h1 * 60 + m1;
        const minutosEntrada = h2 * 60 + m2;
        const duracionMin = minutosEntrada - minutosSalida;

        if (duracionMin >= 0) {
          const horas = Math.floor(duracionMin / 60);
          const minutos = duracionMin % 60;
          duracion = horas > 0 ? `${horas}h ${minutos}m` : `${minutos}m`;
        } else {
          duracion = "--";
        }
      } catch {
        duracion = "--";
      }
    }

    return (
      <div className="flex flex-col items-center min-h-[60px] justify-center">
        <div className="flex items-center mb-1">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <i className="bi bi-check-circle mr-1.5"></i>
            Almuerzo completo
          </span>
        </div>
        <div className="text-xs text-gray-600 text-center">
          <div className="font-medium">
            {horaSalidaAlmuerzo} → {horaEntradaAlmuerzo}
          </div>
          {duracion && duracion !== "--" && (
            <div className="text-gray-500 mt-0.5">
              Duración: {duracion}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Si solo tiene salida de almuerzo
  if (tieneSalidaAlmuerzo && horaSalidaAlmuerzo) {
    return (
      <div className="flex flex-col items-center min-h-[60px] justify-center">
        <div className="flex items-center mb-1">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
            <i className="bi bi-arrow-right-circle mr-1.5"></i>
            Salió a almorzar
          </span>
        </div>
        <div className="text-xs text-gray-600 text-center">
          <div className="font-medium">
            Salida: {horaSalidaAlmuerzo}
          </div>
          <div className="text-gray-500 mt-0.5">
            Sin registro de entrada
          </div>
        </div>
      </div>
    );
  }

  // Si solo tiene entrada de almuerzo
  if (tieneEntradaAlmuerzo && horaEntradaAlmuerzo) {
    return (
      <div className="flex flex-col items-center min-h-[60px] justify-center">
        <div className="flex items-center mb-1">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            <i className="bi bi-arrow-left-circle mr-1.5"></i>
            Regresó de almuerzo
          </span>
        </div>
        <div className="text-xs text-gray-600 text-center">
          <div className="font-medium">
            Entrada: {horaEntradaAlmuerzo}
          </div>
          <div className="text-gray-500 mt-0.5">
            Sin registro de salida
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60px]">
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        <i className="bi bi-dash-circle mr-1.5"></i>
        Sin datos
      </span>
    </div>
  );
}

export function EventosTable({ eventos, isLoading }: TablaEventosProps) {
  const ITEMS_PER_PAGE = 8;
  const [currentPage, setCurrentPage] = useState(1);
  const [paginatedEventos, setPaginatedEventos] = useState<Evento[]>([]);
  const totalPages = Math.ceil(eventos.length / ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [eventos]);

  useEffect(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    setPaginatedEventos(eventos.slice(startIndex, endIndex));
  }, [currentPage, eventos]);

  const formatFecha = (fechaStr: string) => {
    if (!fechaStr) return '-';
    try {
      if (fechaStr.includes('T')) {
        const fecha = new Date(fechaStr);
        if (isNaN(fecha.getTime())) return '-';
        const day = fecha.getDate().toString().padStart(2, '0');
        const month = (fecha.getMonth() + 1).toString().padStart(2, '0');
        const year = fecha.getFullYear();
        return `${day}-${month}-${year}`;
      }

      if (fechaStr.includes('-') && fechaStr.length === 10) {
        const [year, month, day] = fechaStr.split('-');
        return `${day}-${month}-${year}`;
      }

      const fecha = new Date(fechaStr);
      if (isNaN(fecha.getTime())) return '-';
      const day = fecha.getDate().toString().padStart(2, '0');
      const month = (fecha.getMonth() + 1).toString().padStart(2, '0');
      const year = fecha.getFullYear();
      return `${day}-${month}-${year}`;
    } catch (error) {
      return '-';
    }
  };

  return (
    <div className="overflow-x-auto rounded-lg shadow-lg bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gradient-to-r from-slate-700 to-slate-800 text-white text-sm">
          <tr>
            <th className="py-2.5 px-3 text-left font-semibold">ID</th>
            <th className="py-2.5 px-3 text-left font-semibold">Nombre</th>
            <th className="py-2.5 px-3 text-left font-semibold">Fecha</th>
            <th className="py-2.5 px-3 text-left font-semibold">Entrada</th>
            <th className="py-2.5 px-3 text-left font-semibold">Salida</th>
            <th className="py-2.5 px-3 text-left font-semibold">Almuerzo</th>
            <th className="py-2.5 px-3 text-left font-semibold">Campaña</th>
          </tr>
        </thead>

        {isLoading ? (
          <tbody>
            <tr>
              <td colSpan={7} className="text-center py-10 text-gray-500">
                <div className="flex flex-col items-center gap-2">
                  <div className="h-8 w-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                  <span>Cargando eventos...</span>
                </div>
              </td>
            </tr>
          </tbody>
        ) : (
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedEventos.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-gray-500">
                  <div className="flex flex-col items-center gap-2">
                    <i className="bi bi-calendar-x text-3xl text-gray-400"></i>
                    <span>No hay eventos para mostrar</span>
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
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-8 w-8">
                        {evento.foto ? (
                          <img
                            className="h-8 w-8 rounded-full object-cover"
                            src={evento.foto}
                            alt={evento.nombre}
                            onError={(e) => {
                              e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(evento.nombre)}&background=random&color=fff&bold=true`;
                            }}
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-center text-white text-xs font-bold">
                            {evento.nombre.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">
                          {evento.nombre}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                    {formatFecha(evento.fecha)}
                  </td>

                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 font-medium">
                      {evento.horaEntrada || '-'}
                    </div>
                  </td>

                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 font-medium">
                      {evento.horaSalida || '-'}
                    </div>
                  </td>

                  <td className="px-4 py-4 whitespace-nowrap">
                    <InformacionAlmuerzo evento={evento} />
                  </td>

                  <td className="px-4 py-4 whitespace-nowrap">
                    {/* AQUÍ USAMOS EXACTAMENTE TU FUNCIÓN ORIGINAL */}
                    {getDepartamentoDisplay(evento.campaña || 'No asignado')}
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
              Mostrando <span className="font-medium">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> a{" "}
              <span className="font-medium">
                {Math.min(currentPage * ITEMS_PER_PAGE, eventos.length)}
              </span>{" "}
              de <span className="font-medium">{eventos.length}</span> eventos
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={(page) => setCurrentPage(page)}
            />
          </div>
        </div>
      )}

      {/* Bootstrap Icons */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css"
      />
    </div>
  );
}