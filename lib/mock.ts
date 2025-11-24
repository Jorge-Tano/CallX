export interface Usuario {
  id: number;
  nombre: string;
  empleadoId: string;
  hora: string;
  fecha: string;
  tipo: string;
  foto: string;
}

export const usuariosIniciales: Usuario[] = [
  {
    id: 1,
    nombre: "Juan Pérez",
    empleadoId: "EMP00123",
    hora: "08:15",
    fecha: "23/11/2025",
    tipo: "Entrada",
    foto: "https://picsum.photos/60"
  }
];
