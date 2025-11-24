import { pgTable, varchar, timestamp, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: varchar('id').primaryKey(),
  employeeNo: varchar('employee_no').notNull().unique(),
  name: varchar('name').notNull(),
  userType: varchar('user_type'),
  email: varchar('email'),
  phone: varchar('phone'),
  createTime: timestamp('create_time'),
  modifyTime: timestamp('modify_time'),
  userVerifyMode: integer('user_verify_mode'),
  deptName: varchar('dept_name'),
  status: varchar('status'),
  lastSyncAt: timestamp('last_sync_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Para JavaScript, podemos exportar esquemas de validación si es necesario
export const userSchema = {
  id: 'string',
  employeeNo: 'string',
  name: 'string',
  userType: 'string',
  email: 'string',
  phone: 'string',
  createTime: 'date',
  modifyTime: 'date',
  userVerifyMode: 'number',
  deptName: 'string',
  status: 'string',
  lastSyncAt: 'date',
  createdAt: 'date',
  updatedAt: 'date'
};