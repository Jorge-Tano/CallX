// app/api/hikvision/users/edit/route.js
import { NextResponse } from 'next/server';
import { query } from '@/lib/db/usuarios/database';

// CONFIGURACIÓN DE DISPOSITIVOS
const DEVICES = [
  { 
    ip: process.env.HIKVISION_IP1, 
    username: process.env.HIKUSER, 
    password: process.env.HIKPASS,
    port: 443,
    protocol: 'https'
  },
  { 
    ip: process.env.HIKVISION_IP2 , 
    username: process.env.HIKUSER, 
    password: process.env.HIKPASS,
    port: 80,
    protocol: 'http'
  }
].filter(device => device.ip);

// Mapeo de departamentos (según sincronización)
const DEPARTMENTS = {
  'TI': 1,
  'Teams Leaders': 2,
  'Campana 5757': 3,
  'Campana SAV': 4,
  'Campana REFI': 5,
  'Campana PL': 6,
  'Campana PARLO': 7,
  'Administrativo': 8,
  'No asignado': 8,
  // Mapeos alternativos
  'Campaña 5757': 3,
  'Campaña SAV': 4,
  'Campaña REFI': 5,
  'Campaña PL': 6,
  'Campaña PARLO': 7
};

function getDepartmentId(departmentName) {
  if (!departmentName) return 8; // Default: Administrativo
  
  // Normalizar "Campaña" a "Campana"
  const normalized = departmentName.replace('Campaña', 'Campana');
  return DEPARTMENTS[normalized] || DEPARTMENTS[departmentName] || 8;
}

// VALIDADOR DE SEGURIDAD
class SecurityValidator {
  static validateEditRequest(body) {
    if (!body || typeof body !== 'object') {
      return { valid: false, error: "Estructura de solicitud inválida" };
    }

    if (Array.isArray(body)) {
      return { valid: false, error: "No se permiten arrays" };
    }

    const requiredFields = ['employeeNo', 'nombre'];
    const missingFields = requiredFields.filter(field => !body[field]);
    
    if (missingFields.length > 0) {
      return { 
        valid: false, 
        error: `Campos requeridos: ${missingFields.join(', ')}`,
        code: "MISSING_FIELDS"
      };
    }

    const { employeeNo } = body;
    const type = typeof employeeNo;
    
    if (type !== 'string' && type !== 'number') {
      return { 
        valid: false, 
        error: "employeeNo debe ser string o number",
        code: "INVALID_TYPE"
      };
    }

    const employeeStr = employeeNo.toString().trim();
    
    if (employeeStr.length === 0) {
      return { valid: false, error: "employeeNo no puede estar vacío" };
    }

    // Validar que solo contenga números (permitir letras para compatibilidad)
    if (!/^[a-zA-Z0-9]+$/.test(employeeStr)) {
      return { 
        valid: false, 
        error: "employeeNo debe contener solo letras y números",
        code: "INVALID_FORMAT"
      };
    }

    // Validar nombre
    if (body.nombre && body.nombre.trim().length === 0) {
      return { 
        valid: false, 
        error: "Nombre no puede estar vacío",
        code: "INVALID_NAME"
      };
    }

    return { 
      valid: true, 
      employeeNo: employeeStr,
      data: {
        ...body,
        employeeNo: employeeStr,
        nombre: (body.nombre || '').trim(),
        departamento: body.departamento || 'No asignado',
        genero: body.genero || 'Masculino',
        estado: body.estado || 'Activo'
        // Nota: NO incluimos numeroEmpleado porque no existe en la tabla
      }
    };
  }

  static logEditAttempt(employeeNo, ip, userAgent) {
    const timestamp = new Date().toISOString();
    console.log(`🔐 LOG EDICIÓN - ${timestamp}:
      • EmployeeNo: ${employeeNo}
      • IP: ${ip || 'N/A'}
      • User-Agent: ${userAgent?.substring(0, 50) || 'N/A'}
      • Dispositivos: ${DEVICES.map(d => `${d.protocol}://${d.ip}:${d.port}`).join(', ')}
    `);
  }
}

// FUNCIÓN PARA ACTUALIZAR EN HIKVISION
async function updateUserInHikvision(device, userData) {
  console.log(`🔄 Actualizando usuario ${userData.employeeNo} en ${device.protocol}://${device.ip}:${device.port}`);
  
  try {
    const DigestFetch = (await import('digest-fetch')).default;
    const client = new DigestFetch(device.username, device.password, {
      disableRetry: false,
      algorithm: 'MD5'
    });

    // Deshabilitar verificación SSL para HTTPS (solo desarrollo)
    const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    if (device.protocol === 'https') {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    // Obtener department_id
    const departmentId = getDepartmentId(userData.departamento);
    
    // Determinar gender
    let gender = 'male';
    if (userData.genero === 'Femenino') gender = 'female';
    
    // Determinar enable
    const enable = userData.estado === 'Activo';
    
    // Payload para Hikvision
    const payload = {
      UserInfo: {
        employeeNo: userData.employeeNo.toString(),
        name: userData.nombre,
        userType: "normal",
        groupId: departmentId,
        gender: gender,
        Valid: {
          enable: enable,
          beginTime: "2025-01-01T00:00:00",
          endTime: enable ? "2036-12-31T23:59:59" : "2024-01-01T00:00:00",
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

    const url = `${device.protocol}://${device.ip}:${device.port}/ISAPI/AccessControl/UserInfo/Modify?format=json`;
    
    console.log(`📤 URL: ${url}`);
    
    const response = await client.fetch(url, {
      method: "PUT",
      body: JSON.stringify(payload),
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      signal: AbortSignal.timeout(15000)
    });

    const responseText = await response.text();
    
    // Restaurar verificación SSL
    if (device.protocol === 'https') {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
    }
    
    console.log(`📥 Respuesta de ${device.ip}:`, {
      status: response.status,
      statusText: response.statusText
    });

    if (response.ok) {
      return {
        success: true,
        message: "Usuario actualizado exitosamente",
        deviceIp: device.ip,
        devicePort: device.port,
        deviceProtocol: device.protocol
      };
    } else if (response.status === 404) {
      return {
        success: false,
        error: "Usuario no encontrado en el dispositivo",
        deviceIp: device.ip,
        devicePort: device.port,
        deviceProtocol: device.protocol,
        notFound: true
      };
    } else {
      return {
        success: false,
        error: `Error ${response.status}: ${responseText.substring(0, 200)}`,
        deviceIp: device.ip,
        devicePort: device.port,
        deviceProtocol: device.protocol,
        statusCode: response.status
      };
    }

  } catch (error) {
    console.error(`💥 ERROR GENERAL EN ${device.ip}:`, error);
    
    // Restaurar verificación SSL si hubo error
    if (device.protocol === 'https') {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
    }
    
    return {
      success: false,
      error: error.message || 'Error de conexión',
      deviceIp: device.ip,
      devicePort: device.port,
      deviceProtocol: device.protocol,
      networkError: true
    };
  }
}

// FUNCIÓN PARA ACTUALIZAR EN BASE DE DATOS
// USANDO SOLO LAS COLUMNAS QUE EXISTEN EN usuarios_hikvision
async function updateUserInDatabase(userData) {
  try {
    console.log(`🗄️ Actualizando en base de datos: ${userData.employeeNo}`);
    
    // Buscar si el usuario ya existe
    const searchQuery = `
      SELECT id FROM usuarios_hikvision 
      WHERE employee_no = $1 
      LIMIT 1
    `;
    
    const searchResult = await query(searchQuery, [userData.employeeNo]);
    
    let dbAction = 'updated';
    let queryResult;
    
    if (searchResult.rows.length === 0) {
      // Crear nuevo usuario - solo con columnas existentes
      const insertQuery = `
        INSERT INTO usuarios_hikvision (
          employee_no, 
          nombre, 
          departamento, 
          genero, 
          estado,
          fecha_creacion,
          fecha_modificacion,
          tipo_usuario
        ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6)
        RETURNING *
      `;
      
      queryResult = await query(insertQuery, [
        userData.employeeNo,
        userData.nombre,
        userData.departamento || 'No asignado',
        userData.genero || 'Masculino',
        userData.estado || 'Activo',
        'Normal' // tipo_usuario por defecto
      ]);
      dbAction = 'created';
    } else {
      // Actualizar usuario existente - solo columnas existentes
      const updateQuery = `
        UPDATE usuarios_hikvision 
        SET 
          nombre = $1,
          departamento = $2,
          genero = $3,
          estado = $4,
          fecha_modificacion = NOW(),
          tipo_usuario = $5
        WHERE employee_no = $6
        RETURNING *
      `;
      
      queryResult = await query(updateQuery, [
        userData.nombre,
        userData.departamento || 'No asignado',
        userData.genero || 'Masculino',
        userData.estado || 'Activo',
        'Normal', // tipo_usuario
        userData.employeeNo
      ]);
    }
    
    return {
      success: true,
      action: dbAction,
      data: queryResult.rows[0] || null,
      message: `Usuario ${dbAction === 'created' ? 'creado' : 'actualizado'} en base de datos`
    };
    
  } catch (error) {
    console.error(`💥 Error en base de datos:`, error.message);
    return {
      success: false,
      error: error.message,
      action: 'error'
    };
  }
}

// RATE LIMITER
class RateLimiter {
  static requests = new Map();
  
  static isRateLimited(ip, employeeNo) {
    const key = `${ip}_${employeeNo}`;
    const now = Date.now();
    const lastRequest = this.requests.get(key);
    
    if (lastRequest && (now - lastRequest) < 3000) return true;
    
    this.requests.set(key, now);
    setTimeout(() => this.requests.delete(key), 30000);
    
    return false;
  }
}

// ENDPOINT PUT PRINCIPAL
export async function PUT(request) {
  try {
    if (request.method !== 'PUT') {
      return NextResponse.json({ 
        success: false, 
        error: 'Método no permitido' 
      }, { status: 405 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ 
        success: false, 
        error: 'Cuerpo de solicitud inválido' 
      }, { status: 400 });
    }

    const validation = SecurityValidator.validateEditRequest(body);
    
    if (!validation.valid) {
      return NextResponse.json({ 
        success: false, 
        error: validation.error,
        code: validation.code
      }, { status: 400 });
    }

    const userData = validation.data;
    const ip = request.headers.get('x-forwarded-for') || 'N/A';
    const userAgent = request.headers.get('user-agent');
    
    if (RateLimiter.isRateLimited(ip, userData.employeeNo)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Demasiadas solicitudes. Por favor, espere 3 segundos.',
        code: 'RATE_LIMITED'
      }, { status: 429 });
    }
    
    SecurityValidator.logEditAttempt(userData.employeeNo, ip, userAgent);
    console.log(`🔵 SOLICITUD DE EDICIÓN PARA EMPLEADO: ${userData.employeeNo}`);
    console.log('📤 Datos recibidos:', userData);

    // 1. Actualizar en base de datos primero
    console.log('🗄️ Actualizando en base de datos...');
    const dbResult = await updateUserInDatabase(userData);
    
    if (!dbResult.success) {
      return NextResponse.json({
        success: false,
        error: `Error en base de datos: ${dbResult.error}`,
        database: dbResult
      }, { status: 500 });
    }

    // 2. Actualizar en dispositivos Hikvision
    console.log('📡 Actualizando en dispositivos Hikvision...');
    const hikvisionResults = [];
    let successCount = 0;

    for (const device of DEVICES) {
      console.log(`⚙️ Procesando dispositivo: ${device.protocol}://${device.ip}:${device.port}`);
      const result = await updateUserInHikvision(device, userData);
      hikvisionResults.push(result);
      
      if (result.success) {
        successCount++;
      }
      
      // Pequeña pausa entre dispositivos
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const hikvisionSuccess = successCount > 0;
    const allSuccess = successCount === DEVICES.length;
    
    // 3. Preparar respuesta final
    const finalResult = {
      success: hikvisionSuccess || dbResult.success,
      message: allSuccess 
        ? "Usuario actualizado en base de datos y todos los dispositivos" 
        : hikvisionSuccess
          ? `Usuario actualizado en base de datos y ${successCount} de ${DEVICES.length} dispositivos`
          : "Usuario actualizado en base de datos pero error en dispositivos Hikvision",
      timestamp: new Date().toISOString(),
      employeeNo: userData.employeeNo,
      database: {
        success: dbResult.success,
        action: dbResult.action,
        message: dbResult.message,
        data: dbResult.data
      },
      hikvision: {
        totalDevices: DEVICES.length,
        successfulDevices: successCount,
        devicesWithErrors: DEVICES.length - successCount,
        results: hikvisionResults
      }
    };

    console.log('🎯 RESULTADO FINAL DE EDICIÓN:', JSON.stringify(finalResult, null, 2));
    
    return NextResponse.json(finalResult);

  } catch (error) {
    console.error('💥 ERROR GENERAL EN ENDPOINT:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Error interno del servidor',
      details: error.message 
    }, { status: 500 });
  }
}

// También soportar POST para compatibilidad
export async function POST(request) {
  console.log('📨 Llamada POST recibida, redirigiendo a PUT');
  return PUT(request);
}

// Método GET para información del endpoint
export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Endpoint de edición de usuarios Hikvision",
    endpoint: "/api/hikvision/users/edit",
    methods: ["PUT", "POST"],
    security: {
      validation: true,
      rateLimiting: true,
      logging: true
    },
    devices: DEVICES.map(d => ({ 
      ip: d.ip, 
      port: d.port, 
      protocol: d.protocol,
      url: `${d.protocol}://${d.ip}:${d.port}`
    })),
    departments: DEPARTMENTS,
    usage: {
      method: "PUT",
      body: {
        employeeNo: "string (requerido)",
        nombre: "string (requerido)",
        departamento: "string (opcional)",
        genero: "string (opcional, 'Masculino'/'Femenino')",
        estado: "string (opcional, 'Activo'/'Inactivo')"
      },
      note: "Nota: La tabla usuarios_hikvision no tiene columna 'numero_empleado'"
    }
  });
}