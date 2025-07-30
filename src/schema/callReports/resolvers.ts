import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import { AuthenticationError, UserInputError } from 'apollo-server';
import { db } from '../../config/postgres';
import uuidv4 from '../../utils/uuidv4';
import { CallReports, interpreter, Languages } from '../../models'; // Adjust import as needed
import { logger } from '../../config/logger';
import { alias } from 'drizzle-orm/pg-core';

const resolvers = {
  Query: {
    allPhoneMediation: async (_: any, __: any, context: any) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');
      try {
        const rows = await db.select().from(CallReports);
        return rows.map(row => ({
          ...row,
          created_at: row.created_at?.toISOString() || '',
          updated_at: row.updated_at?.toISOString() || '',
        }));
      } catch (error: any) {
        throw new Error(error.message || 'Internal server error.');
      }
    },
    phoneMediationPaginatedList: async (
      _: any,
      { offset = 0, limit = 10, order = 'DESC', orderBy = 'created_at', search = '' }: any,
      context: any
    ) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');

      try {
        const sourceLang = alias(Languages, 'source_lang');
        const targetLang = alias(Languages, 'target_lang');

        // Base query
        let query = db
          .select({
            phone_mediation_no: CallReports.phone_mediation_no,
            id: CallReports.id,
            user_id: CallReports.client_id,
            mediator_id: CallReports.mediator_id,
            caller_phone: CallReports.caller_phone,
            caller_code: CallReports.caller_code,
            status: CallReports.status,
            call_date: CallReports.call_date,
            call_duration: CallReports.call_duration,
            amount: CallReports.amount,
            created_at: CallReports.created_at,
            updated_at: CallReports.updated_at,
            mediatorFirstName: interpreter.first_name,
            mediatorLastName: interpreter.last_name,
            source_language: sourceLang.language_name,
            target_language: targetLang.language_name
          })
          .from(CallReports)
          .leftJoin(interpreter, eq(CallReports.mediator_id, interpreter.id))
          .leftJoin(sourceLang, eq(CallReports.source_language_id, sourceLang.id))
          .leftJoin(targetLang, eq(CallReports.target_language_id, targetLang.id));

        // Filters
        const filters = [];
        if (search) filters.push(ilike(CallReports.status, `%${search}%`));
        if (filters.length > 0) query.where(and(...filters));

        // Sorting
        if (orderBy && order) {
          const isAsc = order.toUpperCase() === 'ASC';
          const orderColumn = (() => {
            switch (orderBy) {
              case 'created_at':
                return isAsc ? asc(CallReports.created_at) : desc(CallReports.created_at);
              case 'mediationDate':
                return isAsc ? asc(CallReports.call_date) : desc(CallReports.call_date);
              default:
                return isAsc ? asc(CallReports.created_at) : desc(CallReports.created_at);
            }
          })();
          query.orderBy(orderColumn);
        }

        // Count
        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(CallReports)
          .where(filters.length > 0 ? and(...filters) : undefined);

        const totalCount = countResult[0]?.count || 0;

        // Fetch paginated rows
        const rows = await query.limit(limit).offset(offset);

        return {
          callReports: rows.map(row => ({
            id: row.id,
            user_id: row.user_id,
            mediator_id: row.mediator_id,
            caller_phone: row.caller_phone,
            phone_mediation_no: row.phone_mediation_no,
            caller_code: row.caller_code,
            status: row.status,
            call_date: row.call_date?.toISOString() || "",
            call_duration: row.call_duration,
            amount: row.amount,
            created_at: row.created_at?.toISOString() || '',
            updated_at: row.updated_at?.toISOString() || '',
            interpreter: row.mediatorFirstName && row.mediatorLastName
              ? `${row.mediatorFirstName} ${row.mediatorLastName}`
              : null,
            source_language: row.source_language || null,
            target_language: row.target_language || null,
          })),
          filteredCount: totalCount,
        };
      } catch (error: any) {
        throw new Error(error.message || 'Internal server error.');
      }
    },

    PhoneMediationByID: async (_: any, { id }: { id: string }, context: any) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');
      try {
        const rows = await db.select().from(CallReports).where(eq(CallReports.id, id));
        const row = rows[0];
        if (!row) throw new UserInputError('Phone mediation not found');
        return {
          ...row,
          created_at: row.created_at?.toISOString() || '',
          updated_at: row.updated_at?.toISOString() || '',
        };
      } catch (error: any) {
        throw new Error(error.message || 'Internal server error.');
      }
    },
  },
  Mutation: {
    createPhoneMediation: async (_: any, { input }: any, context: any) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');
      try {
        // Get the current max phone_mediation_no
        const maxResult = await db
          .select({ maxNo: sql<number>`MAX(phone_mediation_no)` })
          .from(CallReports);
        const maxNo = maxResult[0]?.maxNo || 0;
        const nextNo = Number(maxNo) + 1;

        const data = {
          ...input,
          id: uuidv4(),
          call_date: new Date(input.call_date),
          client_id: context.user.id, // Assuming client_id is the user's ID
          created_at: new Date(),
          updated_at: new Date(),
          phone_mediation_no: nextNo,
        };
        const result = await db.insert(CallReports).values(data).returning();
        return result[0];
      } catch (error: any) {
        throw new Error(error.message || 'Internal server error.');
      }
    },
    updatePhoneMediation: async (_: any, { id, input }: any, context: any) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');
      try {
        const rows = await db.select().from(CallReports).where(eq(CallReports.id, id));
        if (!rows[0]) throw new UserInputError('Phone mediation not found');
        await db.update(CallReports).set({
          ...input, updated_at: new Date(),
          ...(input.call_date && { call_date: new Date(input.call_date) }),

        }).where(eq(CallReports.id, id));
        const updated = await db.select().from(CallReports).where(eq(CallReports.id, id));
        return updated[0];
      } catch (error: any) {
        throw new Error(error.message || 'Internal server error.');
      }
    },
    deletePhoneMediation: async (_: any, { id }: any, context: any) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');
      try {
        const rows = await db.select().from(CallReports).where(eq(CallReports.id, id));
        if (!rows[0]) throw new UserInputError('Phone mediation not found');
        await db.delete(CallReports).where(eq(CallReports.id, id));
        return true;
      } catch (error: any) {
        throw new Error(error.message || 'Internal server error.');
      }
    },
  },

};

export default resolvers;
