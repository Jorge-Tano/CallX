import { Usuario } from "@/lib/mockUsers";

export default function UsuarioDelete({
  usuario,
  onCancel,
  onConfirm
}: {
  usuario: Usuario | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!usuario) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow-md text-center w-80">
        <h3 className="text-lg font-semibold">¿Eliminar usuario?</h3>
        <p className="mt-2 text-gray-600">{usuario.nombre}</p>

        <div className="mt-4 flex justify-center gap-3">
          <button
            onClick={onConfirm}
            className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600"
          >
            Eliminar
          </button>

          <button
            onClick={onCancel}
            className="bg-gray-300 px-4 py-2 rounded-md hover:bg-gray-400"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
