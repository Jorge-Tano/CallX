// app/api/hikvision/users/create/route.js
import { NextResponse } from 'next/server';
import DigestFetch from 'digest-fetch';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const DEVICES = [
  // {
  //   ip: process.env.HIKVISION_IP1,
  //   username: process.env.HIKUSER,
  //   password: process.env.HIKPASS
  // },
  {
    ip: process.env.HIKVISION_IP2,
    username: process.env.HIKUSER,
    password: process.env.HIKPASS
  }
];

const DEPARTMENTS = {
  'TI': 1,
  'Teams Leaders': 2,
  'Campana 5757': 3,
  'Campana SAV': 4,
  'Campana REFI': 5,
  'Campana PL': 6,
  'Campana PARLO': 7,
  'Administrativo': 8
};

function getDepartmentId(departmentName) {
  return DEPARTMENTS[departmentName] || null;
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

export async function POST(request) {
  try {
    const data = await request.json();
    console.log('🔵 DATOS RECIBIDOS DEL FRONTEND:', data);

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

      const departmentId = getDepartmentId(user.departamento);
      if (!departmentId) {
        validationErrors.push(`Usuario ${i + 1}: Departamento "${user.departamento}" no válido`);
        continue;
      }

      validatedUsers.push({
        ...user,
        departmentId,
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
        
        userResults.deviceResults.push({
          deviceIp: device.ip,
          success: deviceResult.success,
          error: deviceResult.error,
          response: deviceResult.response
        });

        if (deviceResult.success) {
          deviceSuccessCount++;
        }
      }

      userResults.success = deviceSuccessCount === DEVICES.length;
      
      if (userResults.success) {
        summary.successfulUsers++;
      } else {
        summary.failedUsers++;
      }

      results.push(userResults);
    }

    // Sincronizar con la base de datos
    let syncResult = null;
    try {
      const syncResponse = await fetch('http://localhost:3000/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      syncResult = await syncResponse.json();
    } catch (syncError) {
      console.warn('⚠️ Error en sincronización:', syncError);
    }

    const finalResult = {
      success: summary.failedUsers === 0,
      summary,
      results,
      syncResult,
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