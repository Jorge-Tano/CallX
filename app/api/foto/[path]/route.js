import { NextResponse } from 'next/server';
import DigestFetch from 'digest-fetch';
import https from 'https';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const CONFIG = {
  username: process.env.HIKUSER,
  password: process.env.HIKPASS,
  devices: [process.env.HIKVISION_IP1, process.env.HIKVISION_IP2].filter(Boolean)
};

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

export async function GET(request, { params }) {
  try {
    const { path } = await params;
    const pathSegments = Array.isArray(path) ? path : [path];
    const encodedPath = pathSegments.join('/');
    
    let decodedPath = decodeURIComponent(encodedPath);
    if (decodedPath.includes('%')) {
      decodedPath = decodeURIComponent(decodedPath);
    }
    
    for (const deviceIp of CONFIG.devices) {
      const url = `https://${deviceIp}/${decodedPath}`;
      const client = new DigestFetch(CONFIG.username, CONFIG.password);
      
      try {
        const response = await client.fetch(url, {
          agent: httpsAgent,
          timeout: 10000,
          headers: { 'Accept': 'image/*' }
        });
        
        if (response.ok) {
          const imageBuffer = await response.arrayBuffer();
          return new NextResponse(imageBuffer, {
            status: 200,
            headers: {
              'Content-Type': response.headers.get('content-type') || 'image/jpeg',
              'Cache-Control': 'public, max-age=3600'
            }
          });
        }
      } catch {
        continue;
      }
    }
    
    return NextResponse.json({
      error: 'No se pudo obtener la imagen'
    }, { status: 404 });
    
  } catch (error) {
    return NextResponse.json({
      error: 'Error interno'
    }, { status: 500 });
  }
}