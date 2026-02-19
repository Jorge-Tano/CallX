import { NextResponse } from 'next/server';
import { query } from '@/lib/db/usuarios/database';

// VALIDADOR DE SEGURIDAD (similar al de Hikvision)
class SecurityValidator {
  static validateDeleteRequest(employeeNo, requestBody) {
    if (!requestBody || typeof requestBody !== 'object') {
      return { valid: false, error: "Estructura de solicitud inválida" };
    }

    if (Array.isArray(requestBody)) {
      return { valid: false, error: "No se permiten arrays" };
    }

    const keys = Object.keys(requestBody);
    if (keys.length !== 1 || !keys.includes('employeeNo')) {
      return { 
        valid: false, 
        error: "Solo se permite el campo 'employeeNo'",
        code: "INVALID_BODY_STRUCTURE"
      };
    }

    if (employeeNo === undefined || employeeNo === null) {
      return { valid: false, error: "employeeNo es requerido" };
    }

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

    if (!/^\d+$/.test(employeeStr)) {
      return { 
        valid: false, 
        error: "employeeNo debe contener solo números",
        code: "INVALID_FORMAT"
      };
    }

    return { valid: true, employeeNo: employeeStr };
  }
}

// RATE LIMITER
class RateLimiter {
  static requests = new Map();
  
  static isRateLimited(ip, employeeNo) {
    const key = `${ip}_${employeeNo}`;
    const now = Date.now();
    const lastRequest = this.requests.get(key);
    
    if (lastRequest && (now - lastRequest) < 5000) return true;
    
    this.requests.set(key, now);
    setTimeout(() => this.requests.delete(key), 60000);
    
    return false;
  }
}

// FUNCIÓN PARA ELIMINAR DE LA BASE DE DATOS
async function deleteUserFromDatabase(employeeNo) {
  console.log(`🗄️ Eliminando usuario ${employeeNo} de la base de datos...`);
  
  try {
    // 1. Primero verificar si el usuario existe
    const checkQuery = `
      SELECT employee_no, nombre 
      FROM usuarios_hikvision 
      WHERE employee_no = $1
    `;
    
    const checkResult = await query(checkQuery, [employeeNo]);
    
    if (checkResult.rowCount === 0) {
      return {
        success: true,
        message: "Usuario no encontrado en la base de datos (posiblemente ya fue eliminado)",
        warning: true,
        employeeNo: employeeNo
      };
    }
    
    const user = checkResult.rows[0];
    console.log(`📋 Usuario encontrado: ${user.employee_no} - ${user.nombre}`);
    
    // 2. Eliminar el usuario
    const deleteQuery = `
      DELETE FROM usuarios_hikvision 
      WHERE employee_no = $1 
      RETURNING employee_no, nombre
    `;
    
    const deleteResult = await query(deleteQuery, [employeeNo]);
    
    if (deleteResult.rowCount === 0) {
      throw new Error("No se pudo eliminar el usuario");
    }
    
    const deletedUser = deleteResult.rows[0];
    
    // 3. Registrar en tabla de eliminaciones (opcional, para auditoría)
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS usuarios_eliminados_audit (
          id SERIAL PRIMARY KEY,
          employee_no VARCHAR(50) NOT NULL,
          nombre VARCHAR(255),
          fecha_eliminacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          eliminado_por VARCHAR(100) DEFAULT 'sistema'
        )
      `);
      
      await query(`
        INSERT INTO usuarios_eliminados_audit (employee_no, nombre)
        VALUES ($1, $2)
      `, [deletedUser.employee_no, deletedUser.nombre]);
    } catch (auditError) {
      // Solo log, no interrumpir el flujo principal
      console.log("⚠️ No se pudo registrar en auditoría:", auditError.message);
    }
    
    return {
      success: true,
      message: "Usuario eliminado de la base de datos exitosamente",
      employeeNo: deletedUser.employee_no,
      nombre: deletedUser.nombre,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`💥 ERROR en eliminación de DB:`, error);
    
    return {
      success: false,
      error: error.message || 'Error al eliminar de la base de datos',
      employeeNo: employeeNo,
      databaseError: true
    };
  }
}

// ENDPOINT POST PRINCIPAL
export async function POST(request) {
  try {
    if (request.method !== 'POST') {
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

    if (Array.isArray(body)) {
      return NextResponse.json({ 
        success: false, 
        error: 'No se permiten eliminaciones masivas. Solo un employeeNo por solicitud.',
        code: 'BULK_DELETE_NOT_ALLOWED'
      }, { status: 400 });
    }

    const { employeeNo } = body;
    const validation = SecurityValidator.validateDeleteRequest(employeeNo, body);
    
    if (!validation.valid) {
      return NextResponse.json({ 
        success: false, 
        error: validation.error,
        code: validation.code || 'VALIDATION_ERROR'
      }, { status: 400 });
    }

    const validatedEmployeeNo = validation.employeeNo;
    const ip = request.headers.get('x-forwarded-for') || 'N/A';
    const userAgent = request.headers.get('user-agent');
    
    if (RateLimiter.isRateLimited(ip, validatedEmployeeNo)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Demasiadas solicitudes. Por favor, espere 5 segundos.',
        code: 'RATE_LIMITED'
      }, { status: 429 });
    }
    
    console.log(`🔴 SOLICITUD DE ELIMINACIÓN EN DB PARA EMPLEADO: ${validatedEmployeeNo}`);
    console.log(`📡 Origen: IP ${ip}, User-Agent: ${userAgent?.substring(0, 50)}`);

    // Procesar eliminación en base de datos
    const result = await deleteUserFromDatabase(validatedEmployeeNo);
    
    console.log(`🎯 RESULTADO ELIMINACIÓN DB:`, {
      success: result.success,
      message: result.message,
      employeeNo: result.employeeNo
    });
    
    return NextResponse.json(result);

  } catch (error) {
    console.error('💥 ERROR GENERAL EN ENDPOINT DB:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}

// ENDPOINT GET PARA INFORMACIÓN
export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Endpoint de eliminación de usuarios en base de datos funcionando",
    security: {
      singleUserOnly: true,
      bulkDeletePrevention: true,
      rateLimiting: true
    },
    usage: {
      method: "POST",
      body: "{ employeeNo: 'numeroEmpleado' }",
      note: "Elimina físicamente el usuario de la tabla usuarios_hikvision"
    }
  });
}