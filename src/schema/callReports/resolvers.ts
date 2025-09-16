import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import { AuthenticationError, UserInputError } from 'apollo-server';
import { db } from '../../config/postgres';
import uuidv4 from '../../utils/uuidv4';
import {
  CallReports,
  ClientCode,
  interpreter,
  Languages,
  LanguagesTarget,
} from '../../models'; // Adjust import as needed
import { logger } from '../../config/logger';
import { alias } from 'drizzle-orm/pg-core';

const resolvers = {
  Query: {
    allPhoneMediation: async (_: any, __: any, context: any) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');
      try {
        const rows = await db.select().from(CallReports);
        return rows.map((row) => ({
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
      {
        offset = 0,
        limit = 10,
        order = 'DESC',
        orderBy = 'created_at',
        search = '',
        phone_number_id = '',
      }: any,
      context: any,
    ) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');
      try {
        const sourceLang = alias(Languages, 'source_lang');
        const targetLang = alias(LanguagesTarget, 'target_lang');

        // Base query
        let query = db
          .select({
            serial_no: CallReports.serial_no,
            id: CallReports.id,
            user_id: CallReports.client_id,
            interpreter_id: CallReports.interpreter_id,
            caller_phone: CallReports.caller_phone,
            phone_number_id: CallReports.phone_number_id,
            // client_code: CallReports.client_code,
            status: CallReports.status,
            call_date: CallReports.call_date,
            call_duration: CallReports.call_duration,
            amount: CallReports.amount,
            created_at: CallReports.created_at,
            updated_at: CallReports.updated_at,
            used_credits: CallReports.used_credits,
            response_time: CallReports.response_time,
            mediatorFirstName: interpreter.first_name ?? null,
            mediatorLastName: interpreter.last_name ?? null,
            source_language: sourceLang.language_name ?? null,
            target_language: targetLang.language_name ?? null,
            clientCodeLabel: ClientCode.code_label ?? null,
            client_code: ClientCode.code_label ?? null,
          })
          .from(CallReports)
          .leftJoin(interpreter, eq(CallReports.interpreter_id, interpreter.id))
          .leftJoin(
            sourceLang,
            eq(CallReports.source_language_id, sourceLang.id),
          )
          .leftJoin(
            targetLang,
            eq(CallReports.target_language_id, targetLang.id),
          )
          .leftJoin(ClientCode, eq(CallReports.client_code, ClientCode.id));

        // Filters
        const filters = [];
        if (search) filters.push(ilike(CallReports.status, `%${search}%`));
        filters.push(eq(CallReports.phone_number_id, phone_number_id));
        if (filters.length > 0) query.where(and(...filters));

        // Sorting
        if (orderBy && order) {
          const isAsc = order.toUpperCase() === 'ASC';
          const orderColumn = (() => {
            switch (orderBy) {
              case 'created_at':
                return isAsc
                  ? asc(CallReports.created_at)
                  : desc(CallReports.created_at);
              case 'mediationDate':
                return isAsc
                  ? asc(CallReports.call_date)
                  : desc(CallReports.call_date);
              default:
                return isAsc
                  ? asc(CallReports.created_at)
                  : desc(CallReports.created_at);
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
          callReports: rows.map((row) => ({
            ...row,
            id: row.id,
            user_id: row.user_id,
            interpreter_id: row.interpreter_id,
            caller_phone: row.caller_phone,
            phone_number_id: row.phone_number_id,
            serial_no: row.serial_no,
            client_code: row.client_code,
            status: row.status,
            call_date: row.call_date?.toISOString() || '',
            call_duration: row.call_duration,
            amount: row.amount,
            created_at: row.created_at?.toISOString() || '',
            updated_at: row.updated_at?.toISOString() || '',
            used_credits: row.used_credits,
            response_time: row.response_time,
            interpreter:
              row.mediatorFirstName && row.mediatorLastName
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

    phoneMediationByID: async (
      _: any,
      { id, phone_number_id }: { id?: string; phone_number_id?: string },
      context: any,
    ) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');
      try {
        let query = db.select().from(CallReports);

        const filters = [];
        if (id) filters.push(eq(CallReports.id, id));
        if (phone_number_id)
          filters.push(eq(CallReports.phone_number_id, phone_number_id));

        if (filters.length === 0) {
          throw new UserInputError(
            'Either id or phone_number_id must be provided',
          );
        }

        const rows = await query.where(and(...filters));
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
        // Get the current max serial_no
        const maxResult = await db
          .select({ maxNo: sql<number>`MAX(serial_no)` })
          .from(CallReports);
        const maxNo = maxResult[0]?.maxNo || 0;
        const nextNo = Number(maxNo) + 1;

        const data = {
          ...input,
          id: uuidv4(),
          call_date: new Date(input.call_date),
          client_id: context.user.id, // Assuming client_id is the user's ID
          ...(input.phone_number_id && {
            phone_number_id: input.phone_number_id,
          }),
          created_at: new Date(),
          updated_at: new Date(),
          serial_no: nextNo,
        };
        delete data.phone_number_id;
        const result = await db.insert(CallReports).values(data).returning();
        return result[0];
      } catch (error: any) {
        throw new Error(error.message || 'Internal server error.');
      }
    },
    updatePhoneMediation: async (_: any, { id, input }: any, context: any) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');
      try {
        const rows = await db
          .select()
          .from(CallReports)
          .where(eq(CallReports.id, id));
        if (!rows[0]) throw new UserInputError('Phone mediation not found');

        const updateData = {
          ...input,
          updated_at: new Date(),
          ...(input.call_date && { call_date: new Date(input.call_date) }),
          // If phone_number_id is provided in input, use it as phone_number_id
          ...(input.phone_number_id && {
            phone_number_id: input.phone_number_id,
          }),
        };

        // Remove the phone_number_id field if it exists since we're using phone_number_id
        delete updateData.phone_number_id;

        await db
          .update(CallReports)
          .set(updateData)
          .where(eq(CallReports.id, id));
        const updated = await db
          .select()
          .from(CallReports)
          .where(eq(CallReports.id, id));
        return updated[0];
      } catch (error: any) {
        throw new Error(error.message || 'Internal server error.');
      }
    },
    deletePhoneMediation: async (_: any, { id }: any, context: any) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');
      try {
        const rows = await db
          .select()
          .from(CallReports)
          .where(eq(CallReports.id, id));
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
