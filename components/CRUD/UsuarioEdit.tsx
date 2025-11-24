"use client";

import { useState } from "react";
import { Usuario } from "@/lib/mockUsers";

export default function UsuarioEdit({ usuario, onEdit, onCancel }: {
  usuario: Usuario;
  onEdit: (u: Usuario) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(usuario);

  const handleChange = (e: any) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const guardar = (e: any) => {
    e.preventDefault();
    onEdit(form);
  };

  return (
    <form onSubmit={guardar} className="bg-white shadow-md rounded-lg p-5 mt-6 grid grid-cols-2 gap-4">
      <h2 className="col-span-2 text-xl font-semibold">Editar Usuario</h2>

      {["nombre", "empleadoId", "hora", "fecha", "tipo", "foto"].map((field) => (
        <input
          key={field}
          name={field}
          value={(form as any)[field]}
          onChange={handleChange}
          className="border p-2 rounded-md focus:ring-2 focus:ring-blue-400"
        />
      ))}

      <div className="col-span-2 flex gap-3">
        <button className="bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600">
          Guardar
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="bg-gray-300 py-2 px-4 rounded-md hover:bg-gray-400"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
