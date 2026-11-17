// lib/hikvision/dispositivos.js
//
// Operaciones sobre los terminales Hikvision usadas al crear usuarios:
// buscar si existe, crear, subir rostro y borrar (para deshacer).
import DigestFetch from 'digest-fetch';

// Los terminales usan certificados autofirmados (igual que el resto de rutas
// que hablan con ellos).
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export const DISPOSITIVOS = [
  { ip: process.env.HIKVISION_IP1, username: process.env.HIKUSER, password: process.env.HIKPASS },
  { ip: process.env.HIKVISION_IP2, username: process.env.HIKUSER, password: process.env.HIKPASS },
].filter(d => d.ip);

const FACE_LIB_ID = process.env.HIKVISION_FACE_LIB_ID || '1';

function cliente(device) {
  return new DigestFetch(device.username, device.password, { disableRetry: false, algorithm: 'MD5' });
}

async function pedir(device, path, { method = 'POST', json, body, contentType } = {}) {
  const url = `https://${device.ip}${path}`;
  const response = await cliente(device).fetch(url, {
    method,
    body: json ? JSON.stringify(json) : body,
    headers: {
      'Content-Type': json ? 'application/json' : contentType,
      Accept: 'application/json',
    },
  });
  const texto = await response.text();
  let datos = null;
  try { datos = JSON.parse(texto); } catch { /* respuesta no JSON */ }
  const ok = response.ok && (!datos || datos.statusCode === undefined || datos.statusCode === 1);
  return { ok, status: response.status, datos, texto };
}

// ---------------------------------------------------------------------------
// Mensajes entendibles para los códigos de error más comunes
// ---------------------------------------------------------------------------
const MENSAJES = {
  employeeNoAlreadyExist: 'Esta cédula ya está registrada en el equipo.',
  alreadyExistThisFace: 'Este rostro ya está registrado en el equipo para otra persona (posible duplicado).',
  deviceUserAlreadyExistFace: 'El usuario ya tiene un rostro registrado en el equipo.',
  faceLibraryNotExist: 'El equipo no tiene la biblioteca de rostros configurada.',
  modelingFailed: 'El equipo no reconoció un rostro válido en la foto. Usa una foto de frente y bien iluminada.',
  faceModelingFailed: 'El equipo no reconoció un rostro válido en la foto. Usa una foto de frente y bien iluminada.',
  lowScore: 'La foto no tiene calidad suficiente para el reconocimiento facial.',
  pictureSizeExceedLimit: 'La foto es demasiado grande para el equipo.',
  notSupport: 'El equipo no admite esta operación.',
};

export function describirError(resultado) {
  if (!resultado) return 'Error desconocido';
  if (resultado.excepcion) return `Sin conexión con el equipo (${resultado.excepcion}).`;
  const d = resultado.datos;
  if (d) {
    const codigo = d.subStatusCode || '';
    for (const [clave, mensaje] of Object.entries(MENSAJES)) {
      if (codigo.toLowerCase().includes(clave.toLowerCase())) return mensaje;
    }
    return `${d.statusString || 'Error'}${codigo ? ` (${codigo})` : ''}${d.errorMsg ? `: ${d.errorMsg}` : ''}`;
  }
  return `El equipo respondió HTTP ${resultado.status}.`;
}

async function seguro(fn) {
  try { return await fn(); } catch (e) { return { ok: false, excepcion: e.message }; }
}

// ---------------------------------------------------------------------------
// Buscar / crear / rostro / borrar
// ---------------------------------------------------------------------------
export async function buscarUsuario(device, employeeNo) {
  const r = await seguro(() => pedir(device, '/ISAPI/AccessControl/UserInfo/Search?format=json', {
    json: {
      UserInfoSearchCond: {
        searchID: `callx-${Date.now()}`,
        searchResultPosition: 0,
        maxResults: 1,
        EmployeeNoList: [{ employeeNo: String(employeeNo) }],
      },
    },
  }));
  if (!r.ok) return { ok: false, error: describirError(r) };
  // Se compara el número por si algún firmware ignora el filtro EmployeeNoList
  const usuario = (r.datos?.UserInfoSearch?.UserInfo || [])
    .find(u => String(u.employeeNo) === String(employeeNo));
  return { ok: true, existe: !!usuario, nombre: usuario?.name ?? null };
}

export async function crearUsuario(device, user, groupId) {
  const payload = {
    UserInfo: {
      employeeNo: String(user.numeroEmpleado),
      name: user.nombre,
      userType: 'normal',
      groupId,
      gender: user.genero === 'Femenino' ? 'female' : 'male',
      Valid: {
        enable: true,
        beginTime: '2025-11-15T00:00:00',
        endTime: '2036-12-31T23:59:59',
        timeType: 'local',
      },
      doorRight: '1',
      RightPlan: [{ doorNo: 1, planTemplateNo: '1' }],
      checkUser: true,
      closeDelayEnabled: false,
    },
  };
  const r = await seguro(() => pedir(device, '/ISAPI/AccessControl/UserInfo/Record?format=json', { json: payload }));
  return r.ok ? { ok: true } : { ok: false, error: describirError(r) };
}

// El cuerpo multipart se arma como Buffer (no FormData) para que digest-fetch
// pueda reenviarlo tal cual tras el desafío 401 de la autenticación Digest.
function multipartRostro(employeeNo, imagen) {
  const boundary = `----CallXFace${Date.now().toString(16)}`;
  const meta = JSON.stringify({ faceLibType: 'blackFD', FDID: FACE_LIB_ID, FPID: String(employeeNo) });
  const cabecera = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="FaceDataRecord"\r\n` +
    `Content-Type: application/json\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="img"; filename="face.jpg"\r\n` +
    `Content-Type: image/jpeg\r\n\r\n`
  );
  return {
    body: Buffer.concat([cabecera, imagen, Buffer.from(`\r\n--${boundary}--\r\n`)]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

export async function subirRostro(device, employeeNo, imagen) {
  const { body, contentType } = multipartRostro(employeeNo, imagen);
  const r = await seguro(() => pedir(device, '/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json', { body, contentType }));
  return r.ok ? { ok: true } : { ok: false, error: describirError(r) };
}

// Borra el usuario y su rostro. Se usa para deshacer una creación incompleta.
export async function borrarUsuario(device, employeeNo) {
  await seguro(() => pedir(device,
    `/ISAPI/Intelligent/FDLib/FDSearch/Delete?format=json&FDID=${FACE_LIB_ID}&faceLibType=blackFD`,
    { method: 'PUT', json: { FPID: [{ value: String(employeeNo) }] } }));
  const r = await seguro(() => pedir(device, '/ISAPI/AccessControl/UserInfo/Delete?format=json', {
    method: 'PUT',
    json: { UserInfoDelCond: { EmployeeNoList: [{ employeeNo: String(employeeNo) }] } },
  }));
  return r.ok ? { ok: true } : { ok: false, error: describirError(r) };
}
