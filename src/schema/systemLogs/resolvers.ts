import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import { systemLogs } from '../../models/system_logs';
import { db } from '../../config/postgres';

export const systemLogsResolvers = {
  Query: {
    systemLogsPaginated: async (
      _: any,
      {
        offset = 0,
        limit = 10,
        order = 'DESC',
        orderBy = 'createdAt',
        search,
        phone_number_id,
      }: {
        offset?: number;
        limit?: number;
        order?: 'ASC' | 'DESC';
        orderBy?: string;
        search?: string;
        phone_number_id: string;
      },
    ) => {
      const conditions = [eq(systemLogs.phone_number_id, phone_number_id)];
      if (search) {
        conditions.push(ilike(systemLogs.description, `%${search}%`));
      }

      const filteredCount = await db
        .select({ count: sql`count(*)::int` })
        .from(systemLogs)
        .where(and(...conditions))
        .then((result) => result[0].count);

      let orderField;
      switch (orderBy) {
        case 'action':
          orderField = systemLogs.action;
          break;
        case 'createdAt':
        default:
          orderField = systemLogs.createdAt;
      }

      const logs = await db
        .select()
        .from(systemLogs)
        .where(and(...conditions))
        .orderBy(order === 'DESC' ? desc(orderField) : orderField)
        .offset(offset)
        .limit(limit);

      return {
        filteredCount,
        systemLogs: logs,
      };
    },

    allSystemLogs: async () => {
      return db.select().from(systemLogs);
    },

    systemLog: async (
      _: any,
      { id, phone_number_id }: { id: string; phone_number_id: string },
    ) => {
      const result = await db
        .select()
        .from(systemLogs)
        .where(
          and(
            eq(systemLogs.id, id),
            eq(systemLogs.phone_number_id, phone_number_id),
          ),
        );
      return result[0] || null;
    },
  },

  Mutation: {
    createSystemLog: async (_: any, { input }: { input: any }) => {
      const [created] = await db.insert(systemLogs).values(input).returning();
      return created;
    },

    updateSystemLog: async (
      _: any,
      { id, input }: { id: string; input: any },
    ) => {
      const [updated] = await db
        .update(systemLogs)
        .set(input)
        .where(eq(systemLogs.id, id))
        .returning();
      return updated;
    },

    deleteSystemLog: async (_: any, { id }: { id: string }) => {
      const result = await db
        .delete(systemLogs)
        .where(eq(systemLogs.id, id))
        .returning();
      return result.length > 0;
    },
  },
};
