"use client";

import { useState } from "react";
import { Usuario } from "@/lib/mockUsers";

export default function UsuarioCreate({ onCreate }: { onCreate: (u: Usuario) => void }) {
  const [form, setForm] = useState({
    nombre: "",
    empleadoId: "",
    hora: "",
    fecha: "",
    tipo: "",
    foto: ""
  });

  const handleChange = (e: any) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const crear = (e: any) => {
    e.preventDefault();
    const nuevo: Usuario = {
      id: Date.now(),
      ...form
    };
    onCreate(nuevo);
    setForm({ nombre: "", empleadoId: "", hora: "", fecha: "", tipo: "", foto: "" });
  };

  return (
    <form onSubmit={crear} className="bg-white shadow-md rounded-lg p-5 mt-4 grid grid-cols-2 gap-4">
      <h2 className="col-span-2 text-xl font-semibold mb-2">Crear Usuario</h2>

      {["nombre", "empleadoId", "hora", "fecha", "tipo", "foto"].map((field) => (
        <input
          key={field}
          name={field}
          placeholder={field}
          value={(form as any)[field]}
          onChange={handleChange}
          className="border p-2 rounded-md focus:ring-2 focus:ring-blue-400"
          required
        />
      ))}

      <button
        className="col-span-2 bg-green-500 text-white py-2 rounded-md hover:bg-green-600"
      >
        Crear
      </button>
    </form>
  );
}
