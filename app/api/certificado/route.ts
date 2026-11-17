// app/api/certificado/route.ts
//
// Entrega el certificado HTTPS de CallX para instalarlo en los PCs, de modo que
// el navegador confíe en https://<servidor>:3643 y permita usar la cámara.
//
//   GET /api/certificado               -> { disponible, httpsUrl }
//   GET /api/certificado?formato=bat   -> instalador para Windows (doble clic)
//   GET /api/certificado?formato=cer   -> el certificado solo
//
// Una página web no puede instalar certificados por sí sola; el instalador usa
// "certutil -user", que no requiere administrador y muestra la confirmación
// de Windows antes de instalar.
import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function rutaCertificado(): string | null {
  const candidatos = [
    process.env.HTTPS_CER_FILE,
    process.env.HTTPS_PFX_FILE?.replace(/\.pfx$/i, ".cer"),
    path.join(process.cwd(), "certs", "callx.cer"),
  ].filter((p): p is string => !!p);
  return candidatos.find(p => existsSync(p)) ?? null;
}

function urlHttps(request: NextRequest): string {
  const host = (request.headers.get("host") || "localhost").replace(/:\d+$/, "");
  return `https://${host}:${process.env.HTTPS_PORT || 3643}`;
}

// El .cer exportado por Windows es DER (binario); se pasa a PEM para el .bat
function aPem(der: Buffer): string[] {
  const texto = der.toString("latin1");
  if (texto.startsWith("-----BEGIN CERTIFICATE-----")) {
    return texto.trim().split(/\r?\n/);
  }
  const b64 = der.toString("base64").match(/.{1,64}/g) ?? [];
  return ["-----BEGIN CERTIFICATE-----", ...b64, "-----END CERTIFICATE-----"];
}

function instaladorBat(pem: string[], destino: string): string {
  const lineas = [
    "@echo off",
    "chcp 65001 >nul",
    "title Instalar certificado de CallX",
    "echo.",
    "echo  Se instalara el certificado de CallX para este usuario de Windows.",
    "echo  Windows mostrara una advertencia de seguridad: responde SI.",
    "echo.",
    'set "CERT=%TEMP%\\callx.cer"',
    ...pem.map((l, i) => `echo ${l}${i === 0 ? '> "%CERT%"' : '>> "%CERT%"'}`),
    'certutil -user -addstore Root "%CERT%" >nul',
    "if errorlevel 1 (",
    "  echo.",
    // Sin paréntesis: dentro de un bloque if los cerraría
    "  echo  No se instalo el certificado: se cancelo o hubo un error.",
    '  del "%CERT%" >nul 2>&1',
    "  pause",
    "  exit /b 1",
    ")",
    'del "%CERT%" >nul 2>&1',
    "echo.",
    "echo  Listo. Cierra el navegador por completo y vuelve a abrirlo.",
    `echo  Luego entra a ${destino}`,
    "echo.",
    "pause",
    `start "" "${destino}"`,
  ];
  return lineas.join("\r\n") + "\r\n";
}

export async function GET(request: NextRequest) {
  const formato = request.nextUrl.searchParams.get("formato");
  const ruta = rutaCertificado();
  const httpsUrl = urlHttps(request);

  if (!formato) {
    return NextResponse.json({ disponible: !!ruta, httpsUrl });
  }
  if (!ruta) {
    return NextResponse.json({ error: "HTTPS no está configurado en el servidor" }, { status: 404 });
  }

  const der = readFileSync(ruta);
  if (formato === "cer") {
    return new NextResponse(new Uint8Array(der), {
      headers: {
        "Content-Type": "application/x-x509-ca-cert",
        "Content-Disposition": 'attachment; filename="callx.cer"',
      },
    });
  }
  if (formato === "bat") {
    const destino = `${httpsUrl}/users`;
    return new NextResponse(instaladorBat(aPem(der), destino), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="instalar-certificado-callx.bat"',
      },
    });
  }
  return NextResponse.json({ error: "formato no válido (bat | cer)" }, { status: 400 });
}
