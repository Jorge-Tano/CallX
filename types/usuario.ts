// types/usuario.ts
export interface Usuario {
  id: string;
  nombre: string;
  numeroEmpleado: string;
  employeeNo: string; // Campo requerido
  departamento?: string;
  campana?: string;
  correo?: string;
  telefono?: string;
  fechaCreacion?: string;
  fechaModificacion?: string;
  estado?: string;
  dispositivo?: string;
  cedula?: string;
  genero?: string;
  foto?: string;
  deviceIp:string;
  tipoUsuario?: string;
  department_id?: number;
  fotoPath?: string;
  fotoDeviceIp?: string;
  groupId?: number;
}