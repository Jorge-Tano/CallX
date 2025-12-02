import { NextResponse } from 'next/server';
import DigestFetch from 'digest-fetch';
import https from 'https';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const CONFIG = {
  username: "admin",
  password: "Tattered3483",
  deviceIps: ["172.31.0.165", "172.31.0.164"]
};

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

export async function GET(request, { params }) {
  try {
    // Desestructurar params con await (Next.js 13.4+)
    const { path } = await params;
    const { searchParams } = new URL(request.url);
    
    if (!path) {
      return NextResponse.json(
        { error: 'Ruta de foto no especificada' },
        { status: 400 }
      );
    }

    console.log(`📸 Procesando solicitud de foto: ${path}`);
    
    // Decodificar el path
    const decodedPath = decodeURIComponent(path);
    
    // Obtener parámetros adicionales
    const deviceIp = searchParams.get('deviceIp') || CONFIG.deviceIps[0];
    
    console.log(`🖥️ Usando dispositivo: ${deviceIp}`);
    console.log(`📁 Ruta decodificada: ${decodedPath}`);
    
    // Función para probar una ruta específica
    const probarRuta = async (rutaCompleta) => {
      try {
        const client = new DigestFetch(CONFIG.username, CONFIG.password, {
          disableRetry: false,
          algorithm: 'MD5'
        });
        
        console.log(`🔍 Probando ruta: ${rutaCompleta}`);
        
        const response = await client.fetch(rutaCompleta, {
          agent: httpsAgent,
          timeout: 10000,
          headers: {
            'Accept': 'image/jpeg,image/png,*/*'
          }
        });
        
        console.log(`📊 Status: ${response.status}`);
        
        if (response.ok) {
          const imageBuffer = await response.arrayBuffer();
          
          if (imageBuffer.byteLength > 100) { // Mínimo 100 bytes para ser imagen
            console.log(`✅ Foto obtenida (${imageBuffer.byteLength} bytes)`);
            
            // Detectar tipo de imagen
            const firstBytes = new Uint8Array(imageBuffer.slice(0, 4));
            const isJpeg = firstBytes[0] === 0xFF && firstBytes[1] === 0xD8;
            const isPng = firstBytes[0] === 0x89 && firstBytes[1] === 0x50;
            
            return {
              success: true,
              buffer: imageBuffer,
              contentType: isJpeg ? 'image/jpeg' : isPng ? 'image/png' : 'application/octet-stream'
            };
          }
        }
      } catch (error) {
        console.log(`❌ Error con ruta: ${error.message}`);
      }
      return { success: false };
    };
    
    // Si parece ser una ruta completa (contiene /), probarla primero
    if (decodedPath.includes('/')) {
      const rutaCompleta = `https://${deviceIp}/${decodedPath}`;
      const resultado = await probarRuta(rutaCompleta);
      
      if (resultado.success) {
        return new NextResponse(resultado.buffer, {
          status: 200,
          headers: {
            'Content-Type': resultado.contentType,
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    }
    
    // Si no es una ruta completa o falló, asumir que es employeeNo y probar rutas comunes
    const employeeNo = decodedPath;
    console.log(`👤 Interpretando como employeeNo: ${employeeNo}`);
    
    // Rutas a probar (basadas en next.config.js y rutas comunes)
    const rutasAlternativas = [
      `LOCALS/pic/enrlFace/0/${employeeNo}.jpg`,
      `LOCALS/pic/enrlFace/0/${employeeNo}`,
      `ISAPI/Intelligent/FDLib/FDImage?faceLibType=blackFD&ID=${employeeNo}`,
      `ISAPI/Intelligent/FDLib/FPImage?faceLibType=blackFD&ID=${employeeNo}`,
      `ISAPI/ContentMgmt/Streaming/tracks/101/@Face?employeeNo=${employeeNo}`,
      `Streaming/tracks/101/@Face?employeeNo=${employeeNo}`,
    ];
    
    // Probar en todos los dispositivos
    for (const ip of CONFIG.deviceIps) {
      console.log(`\n🔎 Probando dispositivo: ${ip}`);
      
      for (const ruta of rutasAlternativas) {
        const rutaCompleta = `https://${ip}/${ruta}`;
        const resultado = await probarRuta(rutaCompleta);
        
        if (resultado.success) {
          console.log(`🎉 ¡Foto encontrada en: ${ruta}`);
          return new NextResponse(resultado.buffer, {
            status: 200,
            headers: {
              'Content-Type': resultado.contentType,
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }
      }
    }
    
    // Si ninguna ruta funcionó
    console.log(`\n❌ No se encontró foto para: ${employeeNo}`);
    return NextResponse.json(
      { 
        error: 'Foto no encontrada',
        employeeNo: employeeNo,
        attemptedDevices: CONFIG.deviceIps,
        message: 'Se probaron múltiples rutas sin éxito'
      },
      { status: 404 }
    );
    
  } catch (error) {
    console.error('❌ Error en endpoint de foto:', error);
    return NextResponse.json(
      { 
        error: 'Error interno del servidor',
        details: error.message 
      },
      { status: 500 }
    );
  }
}