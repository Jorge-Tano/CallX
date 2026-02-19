import { query, getClient } from '@/lib/db/usuarios/database';

export async function syncUsersFromHikvision(users) {
    console.log(`🔄 Sincronizando ${users.length} usuarios...`);

    const results = {
        created: 0,
        updated: 0,
        errors: 0
    };

    if (!Array.isArray(users) || users.length === 0) {
        console.log('⚠️ No hay usuarios para sincronizar');
        return results;
    }

    const client = await getClient();

    try {
        await client.query('BEGIN');

        for (let i = 0; i < users.length; i++) {
            const userData = users[i];

            try {
                const employeeNo = userData.employeeNo?.toString()?.trim();

                if (!employeeNo) {
                    results.errors++;
                    continue;
                }

                // SOLO ESTOS LOGS - como pediste
                console.log(`--- Procesando usuario ${i + 1}/${users.length}: ${employeeNo} ---`);
                console.log(`📋 Datos procesados para ${employeeNo}:`);
                console.log(`  Nombre: ${userData.nombre || 'Sin nombre'}`);
                // FIN DE LOGS

                // Preparar datos
                const nombre = (userData.nombre?.toString().trim() || 'Sin nombre').substring(0, 255);

                let tipoUsuario = 'Desconocido';
                if (userData.tipoUsuario) {
                    const rawType = userData.tipoUsuario.toString().toLowerCase();
                    if (rawType === 'normal' || rawType === '0') tipoUsuario = 'Normal';
                    else if (rawType === 'administrador' || rawType === '1') tipoUsuario = 'Administrador';
                    else if (rawType === 'supervisor' || rawType === '2') tipoUsuario = 'Supervisor';
                    else tipoUsuario = userData.tipoUsuario.toString().substring(0, 100);
                }

                let estado = 'Desconocido';
                if (userData.estado) {
                    const rawEstado = userData.estado.toString().toLowerCase();
                    if (rawEstado.includes('activo') || rawEstado === 'true') estado = 'Activo';
                    else if (rawEstado.includes('inactivo') || rawEstado === 'false') estado = 'Inactivo';
                    else estado = userData.estado.toString().substring(0, 50);
                }

                const departamento = (userData.departamento?.toString() || 'No asignado').substring(0, 100);
                const genero = (userData.genero?.toString() || 'No especificado').substring(0, 20);

                // Procesar fechas
                let fechaCreacion = null;
                let fechaModificacion = null;

                if (userData.fechaCreacion) {
                    try {
                        if (typeof userData.fechaCreacion === 'string' && userData.fechaCreacion.length >= 10) {
                            fechaCreacion = userData.fechaCreacion.substring(0, 10);
                        } else {
                            const date = new Date(userData.fechaCreacion);
                            if (!isNaN(date.getTime())) {
                                fechaCreacion = date.toISOString().split('T')[0];
                            }
                        }
                    } catch (e) {
                        // Sin log de advertencia
                    }
                }

                if (userData.fechaModificacion) {
                    try {
                        if (typeof userData.fechaModificacion === 'string' && userData.fechaModificacion.length >= 10) {
                            fechaModificacion = userData.fechaModificacion.substring(0, 10);
                        } else {
                            const date = new Date(userData.fechaModificacion);
                            if (!isNaN(date.getTime())) {
                                fechaModificacion = date.toISOString().split('T')[0];
                            }
                        }
                    } catch (e) {
                        // Sin log de advertencia
                    }
                }

                // Procesar fotoPath
                let fotoPath = userData.fotoPath || null;
                if (fotoPath && typeof fotoPath === 'string') {
                    fotoPath = fotoPath.substring(0, 1000);
                }

                // Query
                const upsertQuery = `
                    INSERT INTO usuarios_hikvision (
                        employee_no, 
                        nombre, 
                        tipo_usuario, 
                        fecha_creacion, 
                        fecha_modificacion, 
                        estado, 
                        departamento, 
                        genero, 
                        foto_path
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    ON CONFLICT (employee_no) DO UPDATE SET
                        nombre = EXCLUDED.nombre,
                        tipo_usuario = EXCLUDED.tipo_usuario,
                        fecha_creacion = EXCLUDED.fecha_creacion,
                        fecha_modificacion = EXCLUDED.fecha_modificacion,
                        estado = EXCLUDED.estado,
                        departamento = EXCLUDED.departamento,
                        genero = EXCLUDED.genero,
                        foto_path = EXCLUDED.foto_path
                    RETURNING id, (xmax = 0) as inserted
                `;

                const queryValues = [
                    employeeNo,
                    nombre,
                    tipoUsuario,
                    fechaCreacion,
                    fechaModificacion,
                    estado,
                    departamento,
                    genero,
                    fotoPath
                ];

                const upsertResult = await client.query(upsertQuery, queryValues);
                const wasInserted = upsertResult.rows[0]?.inserted;

                if (wasInserted) {
                    results.created++;
                } else {
                    results.updated++;
                }

            } catch (userError) {
                results.errors++;
                // Sin log de error por usuario
            }
        }

        await client.query('COMMIT');

        // Solo resumen final
        console.log(`\n✅ Sincronización completada`);
        console.log(`📊 Creados: ${results.created}`);
        console.log(`📊 Actualizados: ${results.updated}`);
        console.log(`📊 Errores: ${results.errors}`);

    } catch (transactionError) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            // Sin log
        }
        throw transactionError;
    } finally {
        try {
            client.release();
        } catch (releaseError) {
            // Sin log
        }
    }

    return results;
}

export async function createSyncLog(syncData) {
    try {
        // Crear tabla si no existe (sin log)
        try {
            await query(`
                CREATE TABLE IF NOT EXISTS sync_logs (
                    id SERIAL PRIMARY KEY,
                    sync_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    total_devices INTEGER,
                    successful_devices INTEGER,
                    devices_with_errors INTEGER,
                    total_users INTEGER,
                    new_users INTEGER,
                    updated_users INTEGER,
                    sync_duration_ms INTEGER,
                    status VARCHAR(50),
                    error_message TEXT
                )
            `);
        } catch (createError) {
            // Sin log
        }

        const result = await query(
            `
                INSERT INTO sync_logs 
                (sync_date, total_devices, successful_devices, devices_with_errors, 
                 total_users, new_users, updated_users, sync_duration_ms, status, error_message)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id
            `,
            [
                new Date(),
                syncData.totalDevices || 0,
                syncData.successfulDevices || 0,
                syncData.devicesWithErrors || 0,
                syncData.totalUsers || 0,
                syncData.newUsers || 0,
                syncData.updatedUsers || 0,
                syncData.durationMs || 0,
                syncData.status || 'completed',
                syncData.error_message || null
            ]
        );

        console.log(`📝 Log creado: ${result.rows[0].id}`);
        return result.rows[0].id;
        
    } catch (error) {
        console.error('❌ Error creando log:', error.message);
        throw error;
    }
}

export async function getStats() {
    try {
        const statsQuery = `
            SELECT 
                COUNT(*) as total_usuarios,
                COUNT(DISTINCT departamento) as total_departamentos,
                COUNT(CASE WHEN estado = 'Activo' THEN 1 END) as usuarios_activos,
                COUNT(CASE WHEN estado = 'Inactivo' THEN 1 END) as usuarios_inactivos,
                COUNT(CASE WHEN estado = 'Desconocido' THEN 1 END) as usuarios_desconocidos,
                COUNT(CASE WHEN foto_path IS NOT NULL AND foto_path != '' THEN 1 END) as usuarios_con_foto
            FROM usuarios_hikvision
        `;

        const statsResult = await query(statsQuery);
        const stats = statsResult.rows[0];

        return {
            general: {
                totalUsuarios: parseInt(stats.total_usuarios) || 0,
                totalDepartamentos: parseInt(stats.total_departamentos) || 0,
                usuariosActivos: parseInt(stats.usuarios_activos) || 0,
                usuariosInactivos: parseInt(stats.usuarios_inactivos) || 0,
                usuariosDesconocidos: parseInt(stats.usuarios_desconocidos) || 0,
                usuariosConFoto: parseInt(stats.usuarios_con_foto) || 0
            }
        };

    } catch (error) {
        console.error('❌ Error obteniendo estadísticas:', error.message);
        throw error;
    }
}