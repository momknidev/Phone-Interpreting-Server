import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import { AuthenticationError, UserInputError } from 'apollo-server';
import { db } from '../../config/postgres';
import uuidv4 from '../../utils/uuidv4';
import { PhoneMediation, mediator, Languages } from '../../models'; // Adjust import as needed
import { logger } from '../../config/logger';
import { alias } from 'drizzle-orm/pg-core';

const resolvers = {
  Query: {
    allPhoneMediation: async (_: any, __: any, context: any) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');
      try {
        const rows = await db.select().from(PhoneMediation);
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
            phone_mediation_no: PhoneMediation.phone_mediation_no,
            id: PhoneMediation.id,
            user_id: PhoneMediation.client_id,
            mediator_id: PhoneMediation.mediator_id,
            caller_phone: PhoneMediation.caller_phone,
            caller_code: PhoneMediation.caller_code,
            status: PhoneMediation.status,
            mediation_date: PhoneMediation.mediation_date,
            mediation_duration: PhoneMediation.mediation_duration,
            amount: PhoneMediation.amount,
            created_at: PhoneMediation.created_at,
            updated_at: PhoneMediation.updated_at,
            mediatorFirstName: mediator.first_name,
            mediatorLastName: mediator.last_name,
            source_language: sourceLang.language_name,
            target_language: targetLang.language_name
          })
          .from(PhoneMediation)
          .leftJoin(mediator, eq(PhoneMediation.mediator_id, mediator.id))
          .leftJoin(sourceLang, eq(PhoneMediation.source_language_id, sourceLang.id))
          .leftJoin(targetLang, eq(PhoneMediation.target_language_id, targetLang.id));

        // Filters
        const filters = [];
        if (search) filters.push(ilike(PhoneMediation.status, `%${search}%`));
        if (filters.length > 0) query.where(and(...filters));

        // Sorting
        if (orderBy && order) {
          const isAsc = order.toUpperCase() === 'ASC';
          const orderColumn = (() => {
            switch (orderBy) {
              case 'created_at':
                return isAsc ? asc(PhoneMediation.created_at) : desc(PhoneMediation.created_at);
              case 'mediationDate':
                return isAsc ? asc(PhoneMediation.mediation_date) : desc(PhoneMediation.mediation_date);
              default:
                return isAsc ? asc(PhoneMediation.created_at) : desc(PhoneMediation.created_at);
            }
          })();
          query.orderBy(orderColumn);
        }

        // Count
        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(PhoneMediation)
          .where(filters.length > 0 ? and(...filters) : undefined);

        const totalCount = countResult[0]?.count || 0;

        // Fetch paginated rows
        const rows = await query.limit(limit).offset(offset);

        return {
          phoneMediation: rows.map(row => ({
            id: row.id,
            user_id: row.user_id,
            mediator_id: row.mediator_id,
            caller_phone: row.caller_phone,
            phone_mediation_no: row.phone_mediation_no,
            caller_code: row.caller_code,
            status: row.status,
            mediation_date: row.mediation_date?.toISOString() || "",
            mediation_duration: row.mediation_duration,
            amount: row.amount,
            created_at: row.created_at?.toISOString() || '',
            updated_at: row.updated_at?.toISOString() || '',
            mediator: row.mediatorFirstName && row.mediatorLastName
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
        const rows = await db.select().from(PhoneMediation).where(eq(PhoneMediation.id, id));
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
          .from(PhoneMediation);
        const maxNo = maxResult[0]?.maxNo || 0;
        const nextNo = Number(maxNo) + 1;

        const data = {
          ...input,
          id: uuidv4(),
          mediation_date: new Date(input.mediation_date),
          client_id: context.user.id, // Assuming client_id is the user's ID
          created_at: new Date(),
          updated_at: new Date(),
          phone_mediation_no: nextNo,
        };
        const result = await db.insert(PhoneMediation).values(data).returning();
        return result[0];
      } catch (error: any) {
        throw new Error(error.message || 'Internal server error.');
      }
    },
    updatePhoneMediation: async (_: any, { id, input }: any, context: any) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');
      try {
        const rows = await db.select().from(PhoneMediation).where(eq(PhoneMediation.id, id));
        if (!rows[0]) throw new UserInputError('Phone mediation not found');
        await db.update(PhoneMediation).set({
          ...input, updated_at: new Date(),
          ...(input.mediation_date && { mediation_date: new Date(input.mediation_date) }),

        }).where(eq(PhoneMediation.id, id));
        const updated = await db.select().from(PhoneMediation).where(eq(PhoneMediation.id, id));
        return updated[0];
      } catch (error: any) {
        throw new Error(error.message || 'Internal server error.');
      }
    },
    deletePhoneMediation: async (_: any, { id }: any, context: any) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');
      try {
        const rows = await db.select().from(PhoneMediation).where(eq(PhoneMediation.id, id));
        if (!rows[0]) throw new UserInputError('Phone mediation not found');
        await db.delete(PhoneMediation).where(eq(PhoneMediation.id, id));
        return true;
      } catch (error: any) {
        throw new Error(error.message || 'Internal server error.');
      }
    },
  },

};

export default resolvers;
