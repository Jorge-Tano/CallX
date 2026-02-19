import { UserRepository } from '../db/repositories/userRepository';
import { HikvisionService } from './hikvisionService';

export class AutoSyncService {
  constructor() {
    this.userRepo = new UserRepository();
    this.hikvisionService = new HikvisionService();
    this.lastSyncTime = null;
    this.syncInProgress = false;
  }

  /**
   * Sincronización inteligente que solo actualiza cambios
   */
  async intelligentSync() {
    if (this.syncInProgress) {
      console.log('Sincronización ya en progreso...');
      return { 
        success: true, 
        skipped: true, 
        reason: 'Sync already running',
        timestamp: new Date().toISOString()
      };
    }

    this.syncInProgress = true;

    try {
      // 1. Obtener usuarios existentes en BD
      const existingUsers = await this.userRepo.getAllUsers();
      const existingUserMap = new Map(
        existingUsers.map(user => [user.employeeNo, user])
      );

      // 2. Obtener usuarios actuales de Hikvision
      console.log('Obteniendo usuarios de Hikvision...');
      const hikvisionUsers = await this.hikvisionService.getAllUsersWithPagination();
      
      // 3. Identificar cambios
      const changes = this.calculateChanges(existingUserMap, hikvisionUsers);

      console.log(`Cambios detectados: ${changes.toCreate.length} nuevos, ${changes.toUpdate.length} actualizados, ${changes.toDelete.length} eliminados, ${changes.unchanged.length} sin cambios`);

      // 4. Aplicar cambios en lote
      const results = {
        created: 0,
        updated: 0,
        deleted: 0,
        unchanged: changes.unchanged.length
      };

      if (changes.toCreate.length > 0) {
        const created = await this.userRepo.createUsers(changes.toCreate);
        results.created = created.length;
      }

      if (changes.toUpdate.length > 0) {
        const updated = await this.userRepo.updateUsers(changes.toUpdate);
        results.updated = updated.length;
      }

      if (changes.toDelete.length > 0) {
        const deleted = await this.userRepo.deleteUsers(
          changes.toDelete.map(u => u.employeeNo)
        );
        results.deleted = deleted;
      }

      this.lastSyncTime = new Date();

      return {
        success: true,
        ...results,
        total: hikvisionUsers.length,
        timestamp: this.lastSyncTime.toISOString()
      };

    } catch (error) {
      console.error('Error en sincronización inteligente:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Calcula diferencias entre BD y Hikvision
   */
  calculateChanges(existingUserMap, hikvisionUsers) {
    const toCreate = [];
    const toUpdate = [];
    const toDelete = new Map(existingUserMap);
    const unchanged = [];

    for (const hikUser of hikvisionUsers) {
      const existingUser = existingUserMap.get(hikUser.employeeNo);
      
      if (!existingUser) {
        // Usuario nuevo
        toCreate.push(this.transformForDatabase(hikUser));
        toDelete.delete(hikUser.employeeNo);
      } else {
        // Verificar si hay cambios
        if (this.hasChanges(existingUser, hikUser)) {
          toUpdate.push(this.transformForDatabase(hikUser));
        } else {
          unchanged.push(existingUser);
        }
        toDelete.delete(hikUser.employeeNo);
      }
    }

    return {
      toCreate,
      toUpdate,
      toDelete: Array.from(toDelete.values()),
      unchanged
    };
  }

  /**
   * Detecta cambios significativos en los datos
   */
  hasChanges(existingUser, hikvisionUser) {
    const fieldsToCheck = [
      'name', 'userType', 'email', 'phone', 'deptName', 'userVerifyMode'
    ];

    return fieldsToCheck.some(field => {
      const existingValue = existingUser[field];
      const newValue = hikvisionUser[field];
      
      // Manejar valores null/undefined
      if (existingValue === null || existingValue === undefined) {
        return newValue !== null && newValue !== undefined;
      }
      
      if (newValue === null || newValue === undefined) {
        return true;
      }
      
      return existingValue.toString() !== newValue.toString();
    });
  }

  transformForDatabase(hikvisionUser) {
    return {
      employeeNo: hikvisionUser.employeeNo || '',
      name: hikvisionUser.name || 'Sin nombre',
      userType: hikvisionUser.userType || 'Desconocido',
      email: hikvisionUser.email || '',
      phone: hikvisionUser.phone || '',
      createTime: hikvisionUser.createTime ? new Date(hikvisionUser.createTime) : null,
      modifyTime: hikvisionUser.modifyTime ? new Date(hikvisionUser.modifyTime) : null,
      userVerifyMode: hikvisionUser.userVerifyMode || 0,
      deptName: hikvisionUser.deptName || 'No asignado',
      status: this.mapUserStatus(hikvisionUser.userVerifyMode)
    };
  }

  mapUserStatus(userVerifyMode) {
    if (userVerifyMode === 0) return 'Activo';
    if (userVerifyMode === 1) return 'Inactivo';
    return 'Desconocido';
  }

  /**
   * Obtiene estado de la sincronización
   */
  getSyncStatus() {
    return {
      lastSyncTime: this.lastSyncTime,
      syncInProgress: this.syncInProgress,
      nextSyncTime: this.lastSyncTime ? 
        new Date(this.lastSyncTime.getTime() + 30 * 60 * 1000) : // 30 minutos después
        null
    };
  }

  /**
   * Sincronización forzada (para uso manual)
   */
  async forceSync() {
    return await this.intelligentSync();
  }
}