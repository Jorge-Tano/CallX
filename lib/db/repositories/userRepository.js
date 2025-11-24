import { db } from '../index';
import { users } from '../../models/users';
import { eq, inArray } from 'drizzle-orm';

export class UserRepository {
  /**
   * Inserta o actualiza usuarios en lote
   */
  async upsertUsers(userList) {
    if (!userList.length) return [];

    try {
      const usersWithIds = userList.map(user => ({
        ...user,
        id: user.id || `hik_${user.employeeNo}`,
        createdAt: user.createdAt || new Date(),
        updatedAt: new Date()
      }));

      const result = await db
        .insert(users)
        .values(usersWithIds)
        .onConflictDoUpdate({
          target: users.employeeNo,
          set: {
            name: users.name,
            userType: users.userType,
            email: users.email,
            phone: users.phone,
            modifyTime: users.modifyTime,
            userVerifyMode: users.userVerifyMode,
            deptName: users.deptName,
            status: users.status,
            lastSyncAt: new Date(),
            updatedAt: new Date(),
          }
        })
        .returning();

      return result;
    } catch (error) {
      console.error('Error en upsertUsers:', error);
      throw error;
    }
  }

  /**
   * Crear múltiples usuarios
   */
  async createUsers(userList) {
    if (!userList.length) return [];

    const usersWithIds = userList.map(user => ({
      ...user,
      id: `hik_${user.employeeNo}`,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    try {
      const result = await db
        .insert(users)
        .values(usersWithIds)
        .returning();

      return result;
    } catch (error) {
      console.error('Error en createUsers:', error);
      throw error;
    }
  }

  /**
   * Actualizar múltiples usuarios
   */
  async updateUsers(userList) {
    if (!userList.length) return [];

    const results = [];
    
    for (const user of userList) {
      try {
        const result = await db
          .update(users)
          .set({
            name: user.name,
            userType: user.userType,
            email: user.email,
            phone: user.phone,
            modifyTime: user.modifyTime,
            userVerifyMode: user.userVerifyMode,
            deptName: user.deptName,
            status: user.status,
            lastSyncAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.employeeNo, user.employeeNo))
          .returning();

        if (result.length > 0) {
          results.push(result[0]);
        }
      } catch (error) {
        console.error(`Error actualizando usuario ${user.employeeNo}:`, error);
      }
    }

    return results;
  }

  /**
   * Eliminar usuarios por employeeNo
   */
  async deleteUsers(employeeNos) {
    if (!employeeNos.length) return 0;

    try {
      const result = await db
        .delete(users)
        .where(inArray(users.employeeNo, employeeNos));

      return result.rowCount || 0;
    } catch (error) {
      console.error('Error en deleteUsers:', error);
      throw error;
    }
  }

  /**
   * Obtener todos los usuarios
   */
  async getAllUsers(filters = {}) {
    try {
      let query = db.select().from(users);
      
      // Aplicar filtros si existen
      if (filters.status) {
        // En Drizzle, necesitarías usar where con eq
        // Por simplicidad, filtramos después
        const allUsers = await query;
        return allUsers
          .filter(user => user.status === filters.status)
          .sort((a, b) => a.name.localeCompare(b.name));
      }

      const result = await query;
      return result.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Error en getAllUsers:', error);
      throw error;
    }
  }

  /**
   * Buscar usuarios por término
   */
  async searchUsers(searchTerm) {
    const allUsers = await this.getAllUsers();
    const term = searchTerm.toLowerCase();
    
    return allUsers.filter(user => 
      user.name.toLowerCase().includes(term) ||
      (user.employeeNo && user.employeeNo.toLowerCase().includes(term)) ||
      (user.email && user.email.toLowerCase().includes(term))
    );
  }

  /**
   * Obtener estadísticas de usuarios
   */
  async getUserStats() {
    const allUsers = await this.getAllUsers();
    
    const byDepartment = allUsers.reduce((acc, user) => {
      const dept = user.deptName || 'No asignado';
      acc[dept] = (acc[dept] || 0) + 1;
      return acc;
    }, {});

    const lastSync = allUsers.length > 0 
      ? new Date(Math.max(...allUsers.map(u => new Date(u.lastSyncAt || u.updatedAt)))) 
      : null;

    return {
      total: allUsers.length,
      active: allUsers.filter(u => u.status === 'Activo').length,
      inactive: allUsers.filter(u => u.status === 'Inactivo').length,
      unknown: allUsers.filter(u => !u.status || u.status === 'Desconocido').length,
      byDepartment,
      lastSync
    };
  }

  /**
   * Obtener usuario por employeeNo
   */
  async getUserByEmployeeNo(employeeNo) {
    try {
      const result = await db
        .select()
        .from(users)
        .where(eq(users.employeeNo, employeeNo))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error('Error en getUserByEmployeeNo:', error);
      throw error;
    }
  }

  /**
   * Obtener usuarios modificados después de una fecha
   */
  async getUsersModifiedAfter(date) {
    const allUsers = await this.getAllUsers();
    return allUsers.filter(user => 
      new Date(user.updatedAt) > date || 
      new Date(user.lastSyncAt) > date
    );
  }
}