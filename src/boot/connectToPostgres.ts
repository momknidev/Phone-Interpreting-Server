import { db } from '../config/postgres';
import { logger } from '../config/logger';

export const connectToPostgres = async () => {
  try {
    logger.info('postgres:connecting:start');

    const result = await db.execute('select 1');

    if (result) {
      logger.info('postgres:connecting:completed');
    }

    return db;
  } catch (error) {
    logger.error(`postgres:connecting:failed - ${error}`);
    throw error;
  }
};
