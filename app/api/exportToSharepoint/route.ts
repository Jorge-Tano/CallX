import { NextResponse } from 'next/server';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { ClientSecretCredential } from '@azure/identity';

const siteHostname = '2callspa.sharepoint.com';
const sitePath = '/sites/CallComunicados';
const filePath = '/BD Convenios/BD Ejecutivos Activos.xlsx';
const sheetName = 'Usuarios Activos';
const COLS = 6;
const FILAS_LIMPIAR = 500;

export async function POST(request: Request) {
  const tenantId = process.env.SHAREPOINT_TENANT_ID;
  const clientId = process.env.SHAREPOINT_CLIENT_ID;
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    return NextResponse.json({ error: 'Configuración incompleta' }, { status: 500 });
  }

  try {
    const { usuarios } = await request.json();
    if (!usuarios || !Array.isArray(usuarios)) {
      return NextResponse.json({ error: 'Se requiere lista de usuarios' }, { status: 400 });
    }

    console.log(`📤 Exportando ${usuarios.length} usuarios...`);

    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ['https://graph.microsoft.com/.default'],
    });
    const graphClient = Client.initWithMiddleware({ authProvider });

    // Obtener sitio y archivo
    const site = await graphClient.api(`/sites/${siteHostname}:${sitePath}`).get();
    const fileItem = await graphClient
      .api(`/sites/${site.id}/drive/root:${filePath}`)  // ✅ sin encodeURIComponent
      .get();
    const { driveId } = fileItem.parentReference;
    const { id: itemId } = fileItem;

    // Preparar matriz 2D
    const headers = ['employeeNo', 'nombre', 'departamento', 'campana', 'rol', 'email'];
    const dataRows = usuarios.map((u: any) => [
      String(u.employeeNo || ''),
      String(u.nombre || ''),
      String(u.departamento || ''),
      String(u.campana || ''),
      String(u.rol || ''),
      String(u.email || ''),
    ]);

    const allRows = [headers, ...dataRows];
    const lastRow = allRows.length;

    // ✅ Escribir datos en una sola llamada
    await graphClient
      .api(`/drives/${driveId}/items/${itemId}/workbook/worksheets/${sheetName}/range(address='A1:F${lastRow}')`)
      .patch({ values: allRows });

    // ✅ Limpiar filas sobrantes — matriz exactamente FILAS_LIMPIAR × COLS
    const clearStart = lastRow + 1;
    const clearEnd = clearStart + FILAS_LIMPIAR - 1;
    await graphClient
      .api(`/drives/${driveId}/items/${itemId}/workbook/worksheets/${sheetName}/range(address='A${clearStart}:F${clearEnd}')`)
      .patch({
        values: Array.from({ length: FILAS_LIMPIAR }, () => Array(COLS).fill('')),
      });

    console.log(`✅ Exportación completada (${dataRows.length} filas)`);
    return NextResponse.json({ success: true, message: `Exportados ${usuarios.length} usuarios` });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error desconocido';
    console.error('❌ Error exportando:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}