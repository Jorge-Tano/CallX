import { NextResponse } from 'next/server';
import DigestFetch from 'digest-fetch';
import https from 'https';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const CONFIG = {
  username: process.env.HIKUSER,
  password: process.env.HIKPASS,
  devices: [/*process.env.HIKVISION_IP1,*/ process.env.HIKVISION_IP2].filter(Boolean)
};

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

export async function GET(request, { params }) {
  try {
    const { path } = await params;
    const pathSegments = Array.isArray(path) ? path : [path];
    const encodedPath = pathSegments.join('/');

    let decodedPath = decodeURIComponent(encodedPath);
    if (decodedPath.includes('%')) {
      try { decodedPath = decodeURIComponent(decodedPath); } catch { }
    }

    const { searchParams } = new URL(request.url);
    const deviceIpParam = searchParams.get('device');
    const devicesToTry = deviceIpParam ? [deviceIpParam] : CONFIG.devices;

    console.log(`🖼️ Foto: ${decodedPath} | device: ${deviceIpParam || 'fallback'}`);

    for (const deviceIp of devicesToTry) {
      if (!deviceIp) continue;
      const url = `https://${deviceIp}/${decodedPath}`;
      const client = new DigestFetch(CONFIG.username, CONFIG.password);
      try {
        const response = await client.fetch(url, {
          method: 'GET',
          agent: httpsAgent,
          timeout: 8000,
          headers: { 'Accept': 'image/jpeg, image/*, */*' }
        });
        if (!response.ok) continue;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json') || contentType.includes('text/')) continue;
        const imageBuffer = await response.arrayBuffer();
        if (imageBuffer.byteLength < 100) continue;
        return new NextResponse(imageBuffer, {
          status: 200,
          headers: {
            'Content-Type': contentType.includes('image') ? contentType : 'image/jpeg',
            'Cache-Control': 'public, max-age=3600',
            'ETag': `"${Buffer.from(`${deviceIp}/${decodedPath}`).toString('base64').substring(0, 32)}"`
          }
        });
      } catch { continue; }
    }

    return NextResponse.json({ error: 'Foto no encontrada' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}