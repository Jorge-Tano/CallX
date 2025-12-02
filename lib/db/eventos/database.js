import { Pool } from 'pg';

// ---------------------------------------------------------
// CONFIGURACIÓN DEL POOL DE CONEXIÓN
// ---------------------------------------------------------
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || "5432"),
});

// ---------------------------------------------------------
// SERVICIO PRINCIPAL DE BASE DE DATOS
// ---------------------------------------------------------
export class DatabaseService {
  // -------------------------------------------------------
  // NORMALIZACIÓN DE HORAS (FORMATO 24H HH:mm:ss)
  // -------------------------------------------------------
  static normalizarHoraDefinitiva(horaString) {
    if (!horaString) return null;

    try {
      if (horaString.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
        const partes = horaString.split(':');
        if (partes.length === 2) {
          return `${partes[0].padStart(2, '0')}:${partes[1].padStart(2, '0')}:00`;
        }
        return `${partes[0].padStart(2, '0')}:${partes[1].padStart(2, '0')}:${partes[2].padStart(2, '0')}`;
      }

      if (horaString.includes("T")) {
        const fecha = new Date(horaString);
        if (!isNaN(fecha.getTime())) {
          const hh = fecha.getHours().toString().padStart(2, '0');
          const mm = fecha.getMinutes().toString().padStart(2, '0');
          const ss = fecha.getSeconds().toString().padStart(2, '0');
          return `${hh}:${mm}:${ss}`;
        }
      }

      const ampm = horaString.toLowerCase();
      const tieneAM = ampm.includes("am");
      const tienePM = ampm.includes("pm");

      if (tieneAM || tienePM) {
        const nums = horaString.match(/\d+/g);
        if (nums?.length >= 2) {
          let h = parseInt(nums[0]);
          const m = nums[1];
          const s = nums[2] || "00";

          if (tienePM && h < 12) h += 12;
          if (tieneAM && h === 12) h = 0;

          return `${h.toString().padStart(2, '0')}:${m.padStart(2, '0')}:${s.padStart(2, '0')}`;
        }
      }

      const simple = horaString.match(/^(\d{1,2}):(\d{2})$/);
      if (simple) {
        return `${simple[1].padStart(2, '0')}:${simple[2]}:00`;
      }

      return null;
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------
  // GUARDAR EVENTOS (OPTIMIZADO - COMPLETO)
  // -------------------------------------------------------
  static async guardarEventosAutomatico(eventos) {
    if (!eventos.length) {
      return { guardados: 0, nuevos: 0, actualizados: 0, omitidos: 0, errores: 0 };
    }

    const client = await pool.connect();

    let nuevos = 0;
    let actualizados = 0;
    let omitidos = 0;
    let errores = 0;

    try {
      await client.query('BEGIN');

      for (const evento of eventos) {
        try {
          if (!evento.fecha) {
            omitidos++;
            continue;
          }

          let documento = evento.documento;
          if (!documento || documento === "N/A" || documento === "Sin documento") {
            if (evento.nombre && evento.nombre !== "Sin nombre") {
              documento = `tmp_${Buffer.from(evento.nombre).toString("hex").substring(0, 20)}`;
            } else {
              omitidos++;
              continue;
            }
          }

          const hEntrada = this.normalizarHoraDefinitiva(evento.hora_entrada);
          const hSalida = this.normalizarHoraDefinitiva(evento.hora_salida);

          let tipo =
            hEntrada && hSalida ? "Entrada/Salida" :
            hEntrada ? "Solo Entrada" :
            hSalida ? "Solo Salida" : "Evento";

          const existe = await client.query(
            `SELECT id FROM eventos_acceso WHERE documento = $1 AND fecha = $2`,
            [documento, evento.fecha]
          );

          if (existe.rows.length > 0) {
            // ---------------------------
            // ACTUALIZACIÓN
            // ---------------------------
            const id = existe.rows[0].id;

            await client.query(
              `
                UPDATE eventos_acceso
                SET 
                  hora_entrada = COALESCE($1, hora_entrada),
                  hora_salida = COALESCE($2, hora_salida),
                  tipo_evento = $3,
                  dispositivo_ip = $4,
                  imagen = COALESCE($5, imagen)
                WHERE id = $6
              `,
              [
                hEntrada,
                hSalida,
                tipo,
                evento.dispositivo_ip || "Desconocido",
                evento.imagen || null,
                id
              ]
            );

            actualizados++;
          } else {
            // ---------------------------
            // INSERCIÓN
            // ---------------------------
            if (!hEntrada && !hSalida) {
              omitidos++;
              continue;
            }

            await client.query(
              `
                INSERT INTO eventos_acceso
                (documento, nombre, fecha, hora_entrada, hora_salida, tipo_evento, dispositivo_ip, imagen)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              `,
              [
                documento,
                evento.nombre || "Sin nombre",
                evento.fecha,
                hEntrada,
                hSalida,
                tipo,
                evento.dispositivo_ip || "Desconocido",
                evento.imagen || null
              ]
            );

            nuevos++;
          }
        } catch (err) {
          console.error("Error procesando evento:", err);
          errores++;
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error BD:", err);
      throw err;
    } finally {
      client.release();
    }

    return {
      guardados: nuevos + actualizados,
      nuevos,
      actualizados,
      omitidos,
      errores
    };
  }

  // -------------------------------------------------------
  // OBTENER EVENTOS DESDE BD
  // -------------------------------------------------------
  static async obtenerEventosDesdeBD({ rango, fechaInicio, fechaFin }) {
    const client = await pool.connect();

    try {
      let query = `
        SELECT
          documento AS "empleadoId",
          nombre,
          fecha,
          hora_entrada AS "horaEntrada",
          hora_salida AS "horaSalida",
          tipo_evento AS tipo,
          dispositivo_ip AS dispositivo,
          imagen AS foto
        FROM eventos_acceso
        WHERE 1=1
      `;

      const params = [];

      if (rango === "hoy") {
        query += ` AND fecha = CURRENT_DATE`;
      } else if (rango === "7dias") {
        query += ` AND fecha >= CURRENT_DATE - INTERVAL '7 days'`;
      } else if (rango === "30dias") {
        query += ` AND fecha >= CURRENT_DATE - INTERVAL '30 days'`;
      } else if (rango === "personalizado" && fechaInicio && fechaFin) {
        params.push(fechaInicio, fechaFin);
        query += ` AND fecha BETWEEN $1 AND $2`;
      }

      query += ` ORDER BY fecha DESC, COALESCE(hora_entrada, hora_salida) DESC`;

      const result = await client.query(query, params);
      return result.rows;
    } catch (err) {
      console.error("Error obteniendo eventos:", err);
      return [];
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------
  // VERIFICAR CONEXIÓN BD
  // -------------------------------------------------------
  static async verificarConexion() {
    try {
      await pool.query("SELECT NOW()");
      return true;
    } catch {
      return false;
    }
  }
}
