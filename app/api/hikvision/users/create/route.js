// app/api/hikvision/users/create/route.js
//
// Alta de usuarios en los terminales Hikvision, "todo o nada" por usuario:
//   1. Verifica que la cédula no exista en la base de datos ni en ningún equipo.
//   2. Crea el usuario en cada equipo y, si hay foto, sube el rostro.
//   3. Si algo falla en cualquier equipo, borra lo que se alcanzó a crear.
//   4. Solo si todo salió bien, lo guarda en la base de datos.
import { NextResponse } from 'next/server';
import { query } from '@/lib/db/usuarios/database';
import { obtenerOCrearGroupIdPorNombre } from '@/lib/db/departamentos';
import {
  DISPOSITIVOS, buscarUsuario, crearUsuario, subirRostro, borrarUsuario,
} from '@/lib/hikvision/dispositivos';

const FACE_MAX_BYTES = 200 * 1024;

// "data:image/jpeg;base64,..." -> Buffer, validando tipo y tamaño
function decodeFoto(foto) {
  if (!foto) return null;
  const match = /^data:image\/jpe?g;base64,([A-Za-z0-9+/=]+)$/.exec(foto);
  if (!match) throw new Error('La foto debe ser una imagen JPEG');
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length > FACE_MAX_BYTES) {
    throw new Error(`La foto pesa ${Math.round(buffer.length / 1024)} KB; el máximo es ${FACE_MAX_BYTES / 1024} KB`);
  }
  return buffer;
}

// ---------------------------------------------------------------------------
// Base de datos
// ---------------------------------------------------------------------------
let columnaFechaNacimiento = null; // null = sin verificar

async function asegurarColumnaFechaNacimiento() {
  if (columnaFechaNacimiento !== null) return columnaFechaNacimiento;
  try {
    await query(`
      IF COL_LENGTH('hikvision_users', 'fecha_nacimiento') IS NULL
        ALTER TABLE hikvision_users ADD fecha_nacimiento DATE NULL
    `);
    columnaFechaNacimiento = true;
  } catch (e) {
    console.warn('No se pudo agregar la columna fecha_nacimiento:', e.message);
    columnaFechaNacimiento = false;
  }
  return columnaFechaNacimiento;
}

async function buscarEnBaseDeDatos(employeeNo) {
  const r = await query(
    `SELECT TOP 1 employee_no, nombre, departamento FROM hikvision_users WHERE employee_no = $1`,
    [String(employeeNo)]
  );
  return r.rows[0] || null;
}

async function insertarEnBaseDeDatos(user) {
  const genero = ['Femenino', 'Masculino'].includes(user.genero) ? user.genero : 'No especificado';
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(user.fechaNacimiento || '') ? user.fechaNacimiento : null;
  const conFecha = fecha && await asegurarColumnaFechaNacimiento();

  await query(`
    MERGE hikvision_users AS target
    USING (SELECT $1 AS employee_no) AS source
    ON target.employee_no = source.employee_no
    WHEN MATCHED THEN
      UPDATE SET nombre = $2, departamento = $3, genero = $4, tipo_usuario = $5, estado = $6,
        ${conFecha ? 'fecha_nacimiento = $7,' : ''} fecha_modificacion = GETDATE()
    WHEN NOT MATCHED THEN
      INSERT (employee_no, nombre, departamento, genero, tipo_usuario, estado,
        ${conFecha ? 'fecha_nacimiento,' : ''} fecha_creacion, fecha_modificacion)
      VALUES ($1, $2, $3, $4, $5, $6, ${conFecha ? '$7,' : ''} GETDATE(), GETDATE());
  `, [
    String(user.numeroEmpleado), user.nombre, user.departamento, genero, 'Normal', 'Activo',
    ...(conFecha ? [fecha] : []),
  ]);
}

// ---------------------------------------------------------------------------
// Verificación previa (también la usa el formulario vía GET)
// ---------------------------------------------------------------------------
async function verificarExistencia(employeeNo) {
  const enBase = await buscarEnBaseDeDatos(employeeNo);
  const equipos = await Promise.all(DISPOSITIVOS.map(async d => ({ ip: d.ip, ...(await buscarUsuario(d, employeeNo)) })));
  return {
    enBase,
    enEquipos: equipos.filter(e => e.ok && e.existe),
    sinRespuesta: equipos.filter(e => !e.ok),
  };
}

function mensajeExistencia(employeeNo, v) {
  const partes = [];
  if (v.enBase) partes.push(`la base de datos (${v.enBase.nombre}${v.enBase.departamento ? `, ${v.enBase.departamento}` : ''})`);
  for (const e of v.enEquipos) partes.push(`el equipo ${e.ip}${e.nombre ? ` (${e.nombre})` : ''}`);
  return `La cédula ${employeeNo} ya está registrada en ${partes.join(' y ')}. Usa "Editar" en lugar de crear.`;
}

export async function GET(request) {
  const employeeNo = new URL(request.url).searchParams.get('employeeNo')?.trim();
  if (!employeeNo || !/^\d+$/.test(employeeNo)) {
    return NextResponse.json({ success: false, error: 'employeeNo inválido' }, { status: 400 });
  }
  try {
    const v = await verificarExistencia(employeeNo);
    const existe = !!v.enBase || v.enEquipos.length > 0;
    return NextResponse.json({
      success: true,
      existe,
      mensaje: existe ? mensajeExistencia(employeeNo, v) : null,
      sinRespuesta: v.sinRespuesta.map(e => e.ip),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Alta "todo o nada" de un usuario
// ---------------------------------------------------------------------------
async function crearTodoONada(user) {
  const resultado = {
    userIndex: user.index,
    nombre: user.nombre,
    numeroEmpleado: user.numeroEmpleado,
    departamento: user.departamento,
    deviceResults: [],
    success: false,
    error: null,
  };

  // 1. Verificación previa
  const v = await verificarExistencia(user.numeroEmpleado);
  if (v.sinRespuesta.length) {
    resultado.error = `No se pudo verificar en ${v.sinRespuesta.map(e => `${e.ip} (${e.error})`).join(', ')}. ` +
      'No se creó nada para no dejar el usuario a medias.';
    return resultado;
  }
  if (v.enBase || v.enEquipos.length) {
    resultado.error = mensajeExistencia(user.numeroEmpleado, v);
    return resultado;
  }

  // 2. Crear en cada equipo (+ rostro)
  const creados = [];
  let fallo = null;
  for (const device of DISPOSITIVOS) {
    const r = { deviceIp: device.ip, success: false };
    resultado.deviceResults.push(r);

    const alta = await crearUsuario(device, user, user.departmentId);
    if (!alta.ok) { r.error = alta.error; fallo = `${device.ip}: ${alta.error}`; break; }
    creados.push(device);

    if (user.fotoBuffer) {
      const rostro = await subirRostro(device, user.numeroEmpleado, user.fotoBuffer);
      r.face = rostro.ok ? { success: true } : { success: false, error: rostro.error };
      if (!rostro.ok) { r.error = `Foto: ${rostro.error}`; fallo = `${device.ip} (foto): ${rostro.error}`; break; }
    }
    r.success = true;
  }

  // 3. Deshacer si algo falló
  if (fallo) {
    const deshechos = await Promise.all(creados.map(async d => ({ ip: d.ip, ...(await borrarUsuario(d, user.numeroEmpleado)) })));
    const sinDeshacer = deshechos.filter(d => !d.ok);
    resultado.error = `No se creó el usuario. ${fallo}` +
      (sinDeshacer.length
        ? ` ATENCIÓN: no se pudo deshacer en ${sinDeshacer.map(d => d.ip).join(', ')}; revisa ese equipo y borra la cédula ${user.numeroEmpleado} a mano.`
        : creados.length ? ' Se deshizo lo creado en los demás equipos.' : '');
    return resultado;
  }

  // 4. Guardar en la base de datos
  resultado.success = true;
  try {
    await insertarEnBaseDeDatos(user);
    resultado.savedToDatabase = true;
  } catch (dbError) {
    console.error(`Error guardando ${user.numeroEmpleado} en la base de datos:`, dbError);
    resultado.savedToDatabase = false;
    resultado.databaseError = dbError.message;
  }
  return resultado;
}

export async function POST(request) {
  try {
    const data = await request.json();
    const users = Array.isArray(data) ? data : [data];
    console.log('🔵 Alta de usuarios:', users.map(({ foto, ...u }) => ({ ...u, foto: foto ? '(adjunta)' : undefined })));

    if (DISPOSITIVOS.length === 0) {
      return NextResponse.json({ success: false, error: 'No hay equipos configurados' }, { status: 500 });
    }

    const validationErrors = [];
    const validados = [];
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const numero = String(user.numeroEmpleado ?? '').trim();
      if (!numero || !user.nombre || !user.departamento) {
        validationErrors.push(`Usuario ${i + 1}: número de empleado, nombre y departamento son requeridos`);
        continue;
      }
      if (!/^\d+$/.test(numero)) {
        validationErrors.push(`Usuario ${i + 1}: el número de empleado (cédula) solo puede tener dígitos`);
        continue;
      }
      let fotoBuffer = null;
      try {
        fotoBuffer = decodeFoto(user.foto);
      } catch (e) {
        validationErrors.push(`Usuario ${i + 1}: ${e.message}`);
        continue;
      }
      validados.push({
        ...user,
        numeroEmpleado: numero,
        nombre: String(user.nombre).trim(),
        fotoBuffer,
        departmentId: await obtenerOCrearGroupIdPorNombre(user.departamento),
        index: i + 1,
      });
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Errores de validación', details: validationErrors },
        { status: 400 }
      );
    }

    const results = [];
    for (const user of validados) {
      results.push(await crearTodoONada(user));
    }

    const exitosos = results.filter(r => r.success).length;
    const fallidos = results.length - exitosos;
    return NextResponse.json({
      success: fallidos === 0,
      summary: { totalUsers: results.length, totalDevices: DISPOSITIVOS.length, successfulUsers: exitosos, failedUsers: fallidos },
      results,
      message: fallidos === 0
        ? `✅ ${exitosos} usuario(s) creado(s) en todos los equipos`
        : `⚠️ ${exitosos} creado(s), ${fallidos} sin crear`,
    });
  } catch (error) {
    console.error('💥 Error en alta de usuarios:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
