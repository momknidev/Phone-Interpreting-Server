import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import { AuthenticationError, UserInputError } from 'apollo-server';
import { db } from '../../config/postgres';
import uuidv4 from '../../utils/uuidv4';
import { ClientCode } from '../../models'; // Assuming ClientCode model exists

const resolvers = {
  Query: {
    clientCodesPaginated: async (
      _: any,
      {
        offset = 0,
        limit = 10,
        order = 'DESC',
        orderBy = 'created_at',
        search = '',
        phone_number = ''
      }: {
        offset?: number;
        limit?: number;
        order?: string;
        orderBy?: string;
        search?: string;
        phone_number?: string
      },
      context: any
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        let query = db.select().from(ClientCode);

        const filters = [];
        filters.push(eq(ClientCode.client_id, context?.user?.id)); // Ensure only the current user's codes are fetched
        filters.push(eq(ClientCode.phone_number, phone_number))
        if (search) {
          filters.push(ilike(ClientCode.code_label, `%${search}%`)); // Search by code_label
        }

        if (filters.length > 0) {
          query.where(and(...filters));
        }

        // Apply sorting
        if (orderBy && order) {
          const isValidColumn = orderBy in ClientCode && typeof ClientCode[orderBy as keyof typeof ClientCode] === 'object';
          if (isValidColumn) {
            const sortColumn = ClientCode[orderBy as keyof typeof ClientCode] as any;
            query.orderBy(order.toUpperCase() === 'ASC' ? asc(sortColumn) : desc(sortColumn));
          } else {
            // Default to created_at if invalid column provided
            query.orderBy(order.toUpperCase() === 'ASC' ? asc(ClientCode.created_at) : desc(ClientCode.created_at));
          }
        }

        // Get total count for pagination
        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(ClientCode)
          .where(filters.length > 0 ? and(...filters) : undefined);

        const totalCount = countResult[0]?.count || 0;

        // Apply pagination
        const userCodes = await query.limit(limit).offset(offset);

        return {
          clientCodes: userCodes,
          filteredCount: totalCount,
        };
      } catch (error: any) {
        console.error('Error fetching user codes paginated list:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },

    allClientCodes: async (_: any, __: any, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const userCodes = await db.select().from(ClientCode).where(eq(ClientCode.client_id, context.user.id));
        return userCodes;
      } catch (error: any) {
        console.error('Error fetching all user codes:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },

    clientCode: async (_: any, { id, phone_number }: { id: string, phone_number: string }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const userCode = await db
          .select()
          .from(ClientCode)
          .where(and(eq(ClientCode.id, id), eq(ClientCode.client_id, context.user.id), eq(ClientCode.phone_number, phone_number)));

        if (!userCode.length) {
          throw new UserInputError('Client Code not found!');
        }

        return userCode[0];
      } catch (error: any) {
        console.error('Error fetching user code by ID:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },
  },

  Mutation: {
    createClientCode: async (
      _: any,
      { input }: { input: { client_code: number; code_label: string, status: string, phone_number: string } },
      context: any
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const userCodeData = {
          id: uuidv4(),
          client_code: Number(input.client_code),
          code_label: input.code_label,
          client_id: context.user.id,
          phone_number: input.phone_number,
          status: input.status || 'active', // Default status to 'active'
          created_at: new Date(),
          updated_at: new Date(),
        };

        const result = await db.insert(ClientCode).values(userCodeData).returning();

        if (result && result[0]) {
          return result[0];
        } else {
          throw new Error('ClientCode creation failed.');
        }
      } catch (error: any) {
        console.error('Error creating ClientCode:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },

    updateClientCode: async (
      _: any,
      { id, input }: { id: string; input: { status: string, client_code: number; code_label: string, phone_number: string } },
      context: any
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const userCode = await db.select().from(ClientCode).where(and(eq(ClientCode.id, id), eq(ClientCode.client_id, context.user.id)));

        if (!userCode.length) {
          throw new UserInputError('ClientCode not found');
        }

        const updatedData = {
          client_code: input.client_code ? Number(input.client_code) : userCode[0].client_code,
          code_label: input.code_label ? input.code_label : userCode[0].code_label,
          phone_number: input.phone_number ? input.phone_number : userCode[0].phone_number,
          status: input.status || userCode[0].status, // Keep existing status if not provided
          updated_at: new Date(),
        };

        await db.update(ClientCode).set(updatedData).where(eq(ClientCode.id, id));

        const updatedUserCode = await db.select().from(ClientCode).where(eq(ClientCode.id, id));

        return updatedUserCode[0];
      } catch (error: any) {
        console.error('Error updating ClientCode:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },

    deleteClientCode: async (_: any, { id }: { id: string }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const userCode = await db.select().from(ClientCode).where(and(eq(ClientCode.id, id), eq(ClientCode.client_id, context.user.id)));

        if (!userCode.length) {
          throw new UserInputError('ClientCode not found');
        }

        await db.delete(ClientCode).where(eq(ClientCode.id, id));
        return true;
      } catch (error: any) {
        console.error('Error deleting ClientCode:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },
    changeClientCodeStatus: async (
      _: any,
      { id, status }: { id: string; status: string },
      context: any
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const userCode = await db.select().from(ClientCode).where(and(eq(ClientCode.id, id), eq(ClientCode.client_id, context.user.id)));

        if (!userCode.length) {
          throw new UserInputError('ClientCode not found');
        }

        await db.update(ClientCode).set({ status, updated_at: new Date() }).where(eq(ClientCode.id, id));

        const updatedUserCode = await db.select().from(ClientCode).where(eq(ClientCode.id, id));

        return updatedUserCode[0];
      } catch (error: any) {
        console.error('Error changing ClientCode status:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    }
  },
};

export default resolvers;
