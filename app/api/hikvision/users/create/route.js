// app/api/hikvision/users/create/route.js
import { NextResponse } from 'next/server';
import DigestFetch from 'digest-fetch';
import { query } from '@/lib/db/usuarios/database';
import { obtenerOCrearGroupIdPorNombre } from '@/lib/db/departamentos';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const DEVICES = [
  {
    ip: process.env.HIKVISION_IP1,
    username: process.env.HIKUSER,
    password: process.env.HIKPASS
  },
  {
    ip: process.env.HIKVISION_IP2,
    username: process.env.HIKUSER,
    password: process.env.HIKPASS
  }
].filter(device => device.ip);

// Guarda el usuario recién creado directamente en la base de datos.
// No dependemos de una llamada HTTP a nuestro propio servidor porque el puerto
// real (3005 en dev, 3001 en start) no coincide con el localhost:3000 asumido antes,
// lo que hacía que el insert nunca se ejecutara.
async function insertUserInDatabase(user) {
  const genero = user.genero === 'Femenino' ? 'Femenino' : (user.genero === 'Masculino' ? 'Masculino' : 'No especificado');

  const upsertQuery = `
    MERGE hikvision_users AS target
    USING (SELECT $1 AS employee_no) AS source
    ON target.employee_no = source.employee_no
    WHEN MATCHED THEN
      UPDATE SET
        nombre             = $2,
        departamento       = $3,
        genero             = $4,
        tipo_usuario       = $5,
        estado             = $6,
        fecha_modificacion = GETDATE()
    WHEN NOT MATCHED THEN
      INSERT (employee_no, nombre, departamento, genero, tipo_usuario, estado, fecha_creacion, fecha_modificacion)
      VALUES ($1, $2, $3, $4, $5, $6, GETDATE(), GETDATE());
  `;

  await query(upsertQuery, [
    user.numeroEmpleado.toString(),
    user.nombre,
    user.departamento,
    genero,
    'Normal',
    'Activo'
  ]);
}

// Función para crear un usuario en un dispositivo
async function createUserOnDevice(device, userData, departmentId) {
  const client = new DigestFetch(device.username, device.password, {
    disableRetry: false,
    algorithm: 'MD5'
  });

  let gender = 'male';
  if (userData.genero === 'Femenino') gender = 'female';

  const payload = {
    UserInfo: {
      employeeNo: userData.numeroEmpleado.toString(),
      name: userData.nombre,
      userType: "normal",
      groupId: departmentId,
      gender: gender,
      Valid: {
        enable: true,
        beginTime: "2025-11-15T00:00:00",
        endTime: "2036-12-31T23:59:59",
        timeType: "local"
      },
      doorRight: "1",
      RightPlan: [
        {
          doorNo: 1,
          planTemplateNo: "1"
        }
      ],
      checkUser: true,
      closeDelayEnabled: false
    }
  };

  const url = `https://${device.ip}/ISAPI/AccessControl/UserInfo/Record?format=json`;
  
  try {
    const response = await client.fetch(url, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    });

    const responseText = await response.text();

    if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
      return {
        success: false,
        error: `El dispositivo respondió con una página de error HTML`,
        deviceIp: device.ip
      };
    }

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseText);
    } catch (e) {
      return {
        success: false,
        error: `Respuesta no es JSON válido: ${responseText.substring(0, 200)}`,
        deviceIp: device.ip
      };
    }

    if (response.ok) {
      return {
        success: true,
        deviceIp: device.ip,
        response: parsedResponse
      };
    } else {
      return {
        success: false,
        error: `Error ${response.status}: ${responseText}`,
        deviceIp: device.ip,
        response: responseText
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      deviceIp: device.ip
    };
  }
}

// ---------------------------------------------------------------------------
// Foto de rostro
// ---------------------------------------------------------------------------
// Los terminales de reconocimiento facial guardan la cara en una biblioteca
// (FDLib) asociada al usuario por FPID = employeeNo. El usuario debe existir
// antes en el dispositivo, por eso se sube después de crear el UserInfo.
const FACE_MAX_BYTES = 200 * 1024;
const FACE_LIB_ID = process.env.HIKVISION_FACE_LIB_ID || '1';

// Convierte "data:image/jpeg;base64,..." en Buffer y valida tipo y tamaño.
function decodeFoto(foto) {
  if (!foto) return null;
  const match = /^data:image\/jpe?g;base64,([A-Za-z0-9+/=]+)$/.exec(foto);
  if (!match) {
    throw new Error('La foto debe ser una imagen JPEG');
  }
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length > FACE_MAX_BYTES) {
    throw new Error(`La foto pesa ${Math.round(buffer.length / 1024)} KB; el máximo es ${FACE_MAX_BYTES / 1024} KB`);
  }
  return buffer;
}

// El cuerpo multipart se arma como Buffer (no FormData) para que digest-fetch
// pueda reenviarlo tal cual tras el desafío 401 de la autenticación Digest.
function buildFaceMultipart(employeeNo, imageBuffer) {
  const boundary = `----CallXFace${Date.now().toString(16)}`;
  const metadata = JSON.stringify({
    faceLibType: 'blackFD',
    FDID: FACE_LIB_ID,
    FPID: employeeNo.toString()
  });
  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="FaceDataRecord"\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="img"; filename="face.jpg"\r\n` +
    `Content-Type: image/jpeg\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([head, imageBuffer, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

async function sendFace(client, url, method, employeeNo, imageBuffer) {
  const { body, contentType } = buildFaceMultipart(employeeNo, imageBuffer);
  const response = await client.fetch(url, {
    method,
    body,
    headers: { 'Content-Type': contentType, 'Accept': 'application/json' }
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* respuesta no JSON */ }
  const ok = response.ok && (!parsed || parsed.statusCode === undefined || parsed.statusCode === 1);
  return { ok, parsed, text, status: response.status };
}

async function uploadFaceToDevice(device, employeeNo, imageBuffer) {
  const client = new DigestFetch(device.username, device.password, {
    disableRetry: false,
    algorithm: 'MD5'
  });
  const base = `https://${device.ip}/ISAPI/Intelligent/FDLib`;

  try {
    let result = await sendFace(client, `${base}/FaceDataRecord?format=json`, 'POST', employeeNo, imageBuffer);

    // Si el usuario ya tenía una cara (p. ej. un reintento), se reemplaza.
    const sub = result.parsed?.subStatusCode || '';
    if (!result.ok && /exist/i.test(sub)) {
      result = await sendFace(client, `${base}/FDSetUp?format=json`, 'PUT', employeeNo, imageBuffer);
    }

    if (result.ok) {
      return { success: true };
    }

    const detalle = result.parsed
      ? `${result.parsed.subStatusCode || result.parsed.statusString || 'error'}${result.parsed.errorMsg ? ` (${result.parsed.errorMsg})` : ''}`
      : `HTTP ${result.status}: ${result.text.substring(0, 200)}`;
    return { success: false, error: describirErrorCara(detalle) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Traduce los códigos más comunes del dispositivo a algo entendible.
function describirErrorCara(detalle) {
  const d = detalle.toLowerCase();
  if (d.includes('modelingfailed') || d.includes('facemodel') || d.includes('lowscore')) {
    return `El equipo no reconoció un rostro válido en la foto (${detalle}). Usa una foto de frente y bien iluminada.`;
  }
  if (d.includes('picturesize') || d.includes('toolarge') || d.includes('oversize')) {
    return `La foto es demasiado grande para el equipo (${detalle}).`;
  }
  if (d.includes('notsupport') || d.includes('invalidoperation')) {
    return `El equipo no admite carga de rostros por esta vía (${detalle}).`;
  }
  return detalle;
}

export async function POST(request) {
  try {
    const data = await request.json();
    // No volcar la foto (base64) al log
    const resumenLog = (Array.isArray(data) ? data : [data]).map(({ foto, ...rest }) => ({ ...rest, foto: foto ? '(adjunta)' : undefined }));
    console.log('🔵 DATOS RECIBIDOS DEL FRONTEND:', resumenLog);

    // Verificar si es un array de usuarios o un solo usuario
    const users = Array.isArray(data) ? data : [data];
    console.log(`📋 PROCESANDO ${users.length} USUARIO(S)`);

    // Validar todos los usuarios
    const validationErrors = [];
    const validatedUsers = [];

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      
      if (!user.numeroEmpleado || !user.nombre || !user.departamento) {
        validationErrors.push(`Usuario ${i + 1}: numeroEmpleado, nombre y departamento son requeridos`);
        continue;
      }

      let fotoBuffer = null;
      try {
        fotoBuffer = decodeFoto(user.foto);
      } catch (fotoError) {
        validationErrors.push(`Usuario ${i + 1}: ${fotoError.message}`);
        continue;
      }

      validatedUsers.push({
        ...user,
        fotoBuffer,
        // Busca el grupo por nombre en la tabla de departamentos; si el nombre
        // es nuevo, se crea ahí mismo con un groupId propio (los dispositivos
        // no distinguen entre grupos por permisos, todos comparten el mismo
        // horario/puerta, así que crear uno nuevo es seguro).
        departmentId: await obtenerOCrearGroupIdPorNombre(user.departamento),
        index: i + 1
      });
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Errores de validación",
          details: validationErrors
        },
        { status: 400 }
      );
    }

    // Procesar cada usuario en cada dispositivo
    const results = [];
    const summary = {
      totalUsers: validatedUsers.length,
      totalDevices: DEVICES.length,
      successfulUsers: 0,
      failedUsers: 0
    };

    for (const user of validatedUsers) {
      const userResults = {
        userIndex: user.index,
        nombre: user.nombre,
        numeroEmpleado: user.numeroEmpleado,
        departamento: user.departamento,
        deviceResults: [],
        success: false
      };

      let deviceSuccessCount = 0;

      for (const device of DEVICES) {
        
        const deviceResult = await createUserOnDevice(device, user, user.departmentId);

        // La foto es opcional y su fallo no invalida la creación del usuario.
        let face;
        if (deviceResult.success && user.fotoBuffer) {
          face = await uploadFaceToDevice(device, user.numeroEmpleado, user.fotoBuffer);
        }

        userResults.deviceResults.push({
          deviceIp: device.ip,
          success: deviceResult.success,
          error: deviceResult.error,
          response: deviceResult.response,
          face
        });

        if (deviceResult.success) {
          deviceSuccessCount++;
        }
      }

      userResults.success = deviceSuccessCount === DEVICES.length;

      if (userResults.success) {
        summary.successfulUsers++;

        try {
          await insertUserInDatabase(user);
          userResults.savedToDatabase = true;
        } catch (dbError) {
          console.error(`💥 Error guardando usuario ${user.numeroEmpleado} en la base de datos:`, dbError);
          userResults.savedToDatabase = false;
          userResults.databaseError = dbError.message;
        }
      } else {
        summary.failedUsers++;
      }

      results.push(userResults);
    }

    const finalResult = {
      success: summary.failedUsers === 0,
      summary,
      results,
      message: summary.failedUsers === 0
        ? `✅ ${summary.successfulUsers} usuario(s) creado(s) exitosamente en todos los dispositivos`
        : `⚠️ ${summary.successfulUsers} exitoso(s), ${summary.failedUsers} fallido(s)`
    };

    console.log('🎯 RESULTADO FINAL:', finalResult);

    return NextResponse.json(finalResult);

  } catch (error) {
    console.error('💥 ERROR GENERAL EN ENDPOINT:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}