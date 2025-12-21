// app/api/hikvision/users/route.js
import { NextResponse } from 'next/server';
import DigestFetch from 'digest-fetch';

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
];

// Mapeo de departamentos a IDs según la imagen
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

// Función para obtener el ID del departamento
function getDepartmentId(departmentName) {
  return DEPARTMENTS[departmentName] || null;
}

export async function POST(request) {
  try {
    const userData = await request.json();
    console.log('🔵 DATOS RECIBIDOS DEL FRONTEND:', userData);

    // Validaciones básicas
    if (!userData.numeroEmpleado || !userData.nombre || !userData.departamento) {
      return NextResponse.json(
        {
          success: false,
          error: "numeroEmpleado, nombre y departamento son requeridos"
        },
        { status: 400 }
      );
    }

    // Obtener el department_id automáticamente del nombre del departamento
    const departmentId = getDepartmentId(userData.departamento);
    if (!departmentId) {
      return NextResponse.json(
        {
          success: false,
          error: `Departamento "${userData.departamento}" no válido. Departamentos permitidos: ${Object.keys(DEPARTMENTS).join(', ')}`
        },
        { status: 400 }
      );
    }

    const results = [];
    let successCount = 0;

    for (const device of DEVICES) {
      try {
        console.log(`🔄 PROCESANDO DISPOSITIVO: ${device.ip}`);

        const client = new DigestFetch(device.username, device.password, {
          disableRetry: false,
          algorithm: 'MD5'
        });

        // Mapeo de género
        let gender = 'male';
        if (userData.genero === 'Femenino') gender = 'female';

        const payload = {
          UserInfo: {
            employeeNo: userData.numeroEmpleado.toString(),
            name: userData.nombre,
            userType: "normal",
            groupId: departmentId, // Usar el ID numérico del departamento
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

        console.log(`📤 PAYLOAD PARA ${device.ip}:`, JSON.stringify(payload, null, 2));

        const url = `https://${device.ip}/ISAPI/AccessControl/UserInfo/Record?format=json`;
        const response = await client.fetch(url, {
          method: "POST",
          body: JSON.stringify(payload),
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          }
        });

        const responseText = await response.text();

        console.log(`📥 RESPUESTA CRUDA DE ${device.ip}:`, {
          status: response.status,
          statusText: response.statusText,
          body: responseText
        });

        // Verificar si la respuesta es HTML (error)
        if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
          console.log(`❌ HIKVISION RESPONDIÓ CON HTML (ERROR) EN ${device.ip}`);
          results.push({
            deviceIp: device.ip,
            success: false,
            error: `El dispositivo respondió con una página de error HTML. Verifica la URL y autenticación.`
          });
          continue;
        }

        // Intentar parsear la respuesta como JSON
        let parsedResponse;
        try {
          parsedResponse = JSON.parse(responseText);
          console.log(`✅ RESPUESTA JSON DE ${device.ip}:`, parsedResponse);
        } catch (e) {
          console.log(`⚠️ RESPUESTA NO ES JSON DE ${device.ip}:`, responseText.substring(0, 500));
          results.push({
            deviceIp: device.ip,
            success: false,
            error: `Respuesta no es JSON válido: ${responseText.substring(0, 200)}`
          });
          continue;
        }

        if (response.ok) {
          successCount++;
          results.push({
            deviceIp: device.ip,
            success: true,
            message: "Usuario creado exitosamente",
            response: parsedResponse
          });

          console.log(`✅ USUARIO CREADO EN ${device.ip}`);
        } else {
          results.push({
            deviceIp: device.ip,
            success: false,
            error: `Error ${response.status}: ${responseText}`,
            response: responseText
          });

          console.log(`❌ ERROR EN ${device.ip}: ${response.status} - ${responseText}`);
        }

      } catch (error) {
        console.error(`💥 ERROR CRÍTICO EN ${device.ip}:`, error);
        results.push({
          deviceIp: device.ip,
          success: false,
          error: error.message
        });
      }
    }

    const allSuccess = successCount === DEVICES.length;

    const finalResult = {
      success: allSuccess,
      message: allSuccess
        ? "Usuario creado en todos los dispositivos"
        : `Usuario creado en ${successCount} de ${DEVICES.length} dispositivos`,
      results: results,
      userData: {
        ...userData,
        department_id: departmentId // Incluir el ID del departamento en la respuesta
      }
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