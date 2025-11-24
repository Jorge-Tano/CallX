"use client";

import { useState } from "react";
import { Usuario, usuariosIniciales } from "@/lib/mock";
// import UsuariosList from "@/components/CRUD/UsuariosList";
// import UsuarioCreate from "@/components/CRUD/UsuarioCreate";
// import UsuarioEdit from "@/components/CRUD/UsuarioEdit";
// import UsuarioDelete from "@/components/CRUD/UsuarioDelete";

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>(usuariosIniciales);
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);
  const [usuarioAEliminar, setUsuarioAEliminar] = useState<Usuario | null>(null);

  const crearUsuario = (user: Usuario) => {
    setUsuarios([...usuarios, user]);
  };

  const actualizarUsuario = (user: Usuario) => {
    setUsuarios(usuarios.map(u => (u.id === user.id ? user : u)));
  };

  const eliminarUsuario = () => {
    if (!usuarioAEliminar) return;
    setUsuarios(usuarios.filter(u => u.id !== usuarioAEliminar.id));
    setUsuarioAEliminar(null);
  };

  return (
    <div style={{ padding: "25px" }}>
      <h1>CRUD de Usuarios</h1>

      <UsuarioCreate onCreate={crearUsuario} />

      {usuarioEditando && (
        <UsuarioEdit
          usuario={usuarioEditando}
          onEdit={actualizarUsuario}
          onCancel={() => setUsuarioEditando(null)}
        />
      )}

      <UsuariosList
        usuarios={usuarios}
        onEdit={u => setUsuarioEditando(u)}
        onDelete={u => setUsuarioAEliminar(u)}
      />

      <UsuarioDelete
        usuario={usuarioAEliminar}
        onCancel={() => setUsuarioAEliminar(null)}
        onConfirm={eliminarUsuario}
      />
    </div>
  );
}
