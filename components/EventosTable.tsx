interface TablaEventosProps {
  eventos: {
    nombre: string;
    empleadoId: string;
    hora: string;
    fecha: string;     // <<--- NUEVO
    tipo: string;
    foto: string;
  }[];
}

export default function EventosTable({ eventos }: TablaEventosProps) {
  return (
    <div className="overflow-x-auto rounded-lg shadow-lg bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
              Foto
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
              Nombre
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
              Documento
            </th>

            {/* NUEVA COLUMNA FECHA */}
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
              Fecha
            </th>

            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
              Hora
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
              Tipo
            </th>
          </tr>
        </thead>

        <tbody className="bg-white divide-y divide-gray-200">
          {eventos.map((evento, index) => (
            <tr key={index} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                {evento.foto ? (
                  <img
                    src={evento.foto}
                    alt="Foto acceso"
                    className="w-12 h-12 rounded-lg object-cover shadow-sm border"
                  />
                ) : (
                  <span className="text-gray-400 text-sm">Sin foto</span>
                )}
              </td>

              <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-800">
                {evento.nombre}
              </td>

              <td className="px-6 py-4 whitespace-nowrap text-gray-700">
                {evento.empleadoId}
              </td>

              {/* NUEVA COLUMNA FECHA */}
              <td className="px-6 py-4 whitespace-nowrap text-gray-700">
                {evento.fecha}
              </td>

              <td className="px-6 py-4 whitespace-nowrap text-gray-700">
                {new Date(evento.hora).toLocaleTimeString("es-CO")}
              </td>

              <td className="px-6 py-4 whitespace-nowrap">
                <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                  {evento.tipo}
                </span>
              </td>

            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
