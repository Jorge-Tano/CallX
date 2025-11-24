import { Usuario } from "@/lib/mockUsers";

export default function UsuariosList({
  usuarios,
  onEdit,
  onDelete
}: {
  usuarios: Usuario[];
  onEdit: (u: Usuario) => void;
  onDelete: (u: Usuario) => void;
}) {
  return (
    <div className="overflow-x-auto mt-6">
      <table className="min-w-full bg-white shadow-md rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-gray-100 text-gray-700 text-left">
            <th className="p-3">Foto</th>
            <th className="p-3">Nombre</th>
            <th className="p-3">Empleado ID</th>
            <th className="p-3">Hora</th>
            <th className="p-3">Fecha</th>
            <th className="p-3">Tipo</th>
            <th className="p-3 text-center">Acciones</th>
          </tr>
        </thead>

        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id} className="border-b last:border-none hover:bg-gray-50">
              <td className="p-3">
                <img src={u.foto} className="w-10 h-10 rounded-full" />
              </td>
              <td className="p-3">{u.nombre}</td>
              <td className="p-3">{u.empleadoId}</td>
              <td className="p-3">{u.hora}</td>
              <td className="p-3">{u.fecha}</td>
              <td className="p-3">{u.tipo}</td>

              <td className="p-3 flex gap-2 justify-center">
                <button
                  onClick={() => onEdit(u)}
                  className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  Editar
                </button>

                <button
                  onClick={() => onDelete(u)}
                  className="px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600"
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
