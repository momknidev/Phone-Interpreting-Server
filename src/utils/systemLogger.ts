import { db } from '../config/postgres';
import { systemLogs } from '../models/system_logs_table';
import uuidv4 from './uuidv4';

interface SystemLogInput {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT';
  client_id?: string;
  phone_number_id: string;
  ip?: string;
  browser?: string;
  changes?: any;
  description: string;
}

export const createSystemLog = async (input: SystemLogInput) => {
  try {
    // Generate UUID for the new log
    const id = uuidv4();
    const [created] = await db
      .insert(systemLogs)
      .values({
        id,
        ...input,
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Error creating system log:', error);
    // Don't throw the error as logging should not break the main operation
    return null;
  }
};

export const getClientInfo = (context: any) => {
  return {
    ip: context?.req?.ip || context?.connection?.remoteAddress,
    browser: context?.req?.headers?.['user-agent'],
  };
};
