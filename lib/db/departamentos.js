// lib/db/departamentos.js
// Los dispositivos Hikvision no exponen el nombre de un departamento por API,
// solo un número (groupId) por persona. Esta tabla guarda la traducción
// número -> nombre para que se pueda gestionar desde la app en vez de en el
// código fuente.
import { query } from '@/lib/db/usuarios/database';

const DEPARTAMENTOS_POR_DEFECTO = {
  1: 'TI',
  2: 'Teams Leaders',
  3: 'Campana 5757',
  4: 'Campana SAV',
  5: 'Campana REFI',
  6: 'Campana PL',
  7: 'Campana PARLO',
  8: 'Administrativo',
  9: 'Practicantes'
};

const ACENTOS = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' };

function normalizar(texto) {
  return texto.trim().toLowerCase().replace(/[áéíóúüñ]/g, letra => ACENTOS[letra]);
}

let tablaAsegurada = false;

export async function asegurarTablaDepartamentos() {
  if (tablaAsegurada) return;

  await query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'departamentos')
    CREATE TABLE departamentos (
      group_id INTEGER PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL,
      creado_en DATETIME2 DEFAULT GETDATE(),
      actualizado_en DATETIME2 DEFAULT GETDATE()
    )
  `);

  for (const [groupId, nombre] of Object.entries(DEPARTAMENTOS_POR_DEFECTO)) {
    await query(
      `IF NOT EXISTS (SELECT 1 FROM departamentos WHERE group_id = $1)
       INSERT INTO departamentos (group_id, nombre) VALUES ($1, $2)`,
      [groupId, nombre]
    );
  }

  tablaAsegurada = true;
}

// { 1: "TI", 2: "Teams Leaders", ... }
export async function obtenerMapaDepartamentos() {
  await asegurarTablaDepartamentos();
  const result = await query(`SELECT group_id, nombre FROM departamentos ORDER BY group_id ASC`);
  const mapa = {};
  result.rows.forEach(row => { mapa[row.group_id] = row.nombre; });
  return mapa;
}

// [{ groupId: 1, nombre: "TI" }, ...]
export async function obtenerListaDepartamentos() {
  await asegurarTablaDepartamentos();
  const result = await query(`SELECT group_id AS "groupId", nombre FROM departamentos ORDER BY group_id ASC`);
  return result.rows;
}

// Se llama cuando la sincronización ve un groupId que el dispositivo reporta
// pero que todavía no tiene nombre asignado. Lo registra con un nombre
// provisional para que un admin lo renombre después desde la app.
export async function registrarGroupIdSiNoExiste(groupId) {
  await asegurarTablaDepartamentos();
  await query(
    `IF NOT EXISTS (SELECT 1 FROM departamentos WHERE group_id = $1)
     INSERT INTO departamentos (group_id, nombre) VALUES ($1, $2)`,
    [groupId, `Grupo ${groupId}`]
  );
}

export async function renombrarDepartamento(groupId, nombre) {
  await asegurarTablaDepartamentos();
  const nombreLimpio = nombre.trim();
  if (!nombreLimpio) throw new Error('El nombre no puede estar vacío');

  await query(
    `IF EXISTS (SELECT 1 FROM departamentos WHERE group_id = $1)
       UPDATE departamentos SET nombre = $2, actualizado_en = GETDATE() WHERE group_id = $1
     ELSE
       INSERT INTO departamentos (group_id, nombre, actualizado_en) VALUES ($1, $2, GETDATE())`,
    [groupId, nombreLimpio]
  );
}

// Busca el groupId de un departamento por nombre (sin importar mayúsculas ni
// tildes). Si no existe todavía, crea uno nuevo con el siguiente número
// disponible y lo guarda con ese nombre.
export async function obtenerOCrearGroupIdPorNombre(nombre) {
  await asegurarTablaDepartamentos();
  const nombreLimpio = (nombre || '').trim();
  if (!nombreLimpio) throw new Error('El nombre del departamento es requerido');

  const existentes = await query(`SELECT group_id, nombre FROM departamentos`);
  const normalizado = normalizar(nombreLimpio);
  const coincidencia = existentes.rows.find(row => normalizar(row.nombre) === normalizado);
  if (coincidencia) {
    return coincidencia.group_id;
  }

  const maxResult = await query(`SELECT COALESCE(MAX(group_id), 0) AS max_id FROM departamentos`);
  const nuevoGroupId = Number(maxResult.rows[0].max_id) + 1;

  await query(
    `INSERT INTO departamentos (group_id, nombre) VALUES ($1, $2)`,
    [nuevoGroupId, nombreLimpio]
  );

  return nuevoGroupId;
}
