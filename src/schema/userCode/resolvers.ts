import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import { AuthenticationError, UserInputError } from 'apollo-server';
import { db } from '../../config/postgres';
import uuidv4 from '../../utils/uuidv4';
import { UserCode } from '../../models'; // Assuming UserCode model exists

const resolvers = {
  Query: {
    userCodesPaginated: async (
      _: any,
      {
        offset = 0,
        limit = 10,
        order = 'DESC',
        orderBy = 'created_at',
        search = '',
      }: {
        offset?: number;
        limit?: number;
        order?: string;
        orderBy?: string;
        search?: string;
      },
      context: any
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        let query = db.select().from(UserCode);

        const filters = [];
        filters.push(eq(UserCode.userID, context?.user?.id)); // Ensure only the current user's codes are fetched

        if (search) {
          filters.push(ilike(UserCode.user_name, `%${search}%`)); // Search by user_name
        }

        if (filters.length > 0) {
          query.where(and(...filters));
        }

        // Apply sorting
        if (orderBy && order) {
          const isValidColumn = orderBy in UserCode && typeof UserCode[orderBy as keyof typeof UserCode] === 'object';
          if (isValidColumn) {
            const sortColumn = UserCode[orderBy as keyof typeof UserCode] as any;
            query.orderBy(order.toUpperCase() === 'ASC' ? asc(sortColumn) : desc(sortColumn));
          } else {
            // Default to created_at if invalid column provided
            query.orderBy(order.toUpperCase() === 'ASC' ? asc(UserCode.created_at) : desc(UserCode.created_at));
          }
        }

        // Get total count for pagination
        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(UserCode)
          .where(filters.length > 0 ? and(...filters) : undefined);

        const totalCount = countResult[0]?.count || 0;

        // Apply pagination
        const userCodes = await query.limit(limit).offset(offset);

        return {
          userCodes,
          filteredCount: totalCount,
        };
      } catch (error: any) {
        console.error('Error fetching user codes paginated list:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },

    allUserCodes: async (_: any, __: any, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const userCodes = await db.select().from(UserCode).where(eq(UserCode.userID, context.user.id));
        return userCodes;
      } catch (error: any) {
        console.error('Error fetching all user codes:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },

    userCode: async (_: any, { id }: { id: string }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const userCode = await db
          .select()
          .from(UserCode)
          .where(and(eq(UserCode.id, id), eq(UserCode.userID, context.user.id)));

        if (!userCode.length) {
          throw new UserInputError('UserCode not found!');
        }

        return userCode[0];
      } catch (error: any) {
        console.error('Error fetching user code by ID:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },
  },

  Mutation: {
    createUserCode: async (
      _: any,
      { input }: { input: { user_code: number; user_name: string } },
      context: any
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const userCodeData = {
          id: uuidv4(),
          user_code: Number(input.user_code),
          user_name: input.user_name,
          userID: context.user.id,
          created_at: new Date(),
          updated_at: new Date(),
          status: 'active',
        };

        const result = await db.insert(UserCode).values(userCodeData).returning();

        if (result && result[0]) {
          return result[0];
        } else {
          throw new Error('UserCode creation failed.');
        }
      } catch (error: any) {
        console.error('Error creating UserCode:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },

    updateUserCode: async (
      _: any,
      { id, input }: { id: string; input: { user_code: number; user_name: string } },
      context: any
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const userCode = await db.select().from(UserCode).where(and(eq(UserCode.id, id), eq(UserCode.userID, context.user.id)));

        if (!userCode.length) {
          throw new UserInputError('UserCode not found');
        }

        const updatedData = {
          user_code: input.user_code,
          user_name: input.user_name,
          updated_at: new Date(),
        };

        await db.update(UserCode).set(updatedData).where(eq(UserCode.id, id));

        const updatedUserCode = await db.select().from(UserCode).where(eq(UserCode.id, id));

        return updatedUserCode[0];
      } catch (error: any) {
        console.error('Error updating UserCode:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },

    deleteUserCode: async (_: any, { id }: { id: string }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const userCode = await db.select().from(UserCode).where(and(eq(UserCode.id, id), eq(UserCode.userID, context.user.id)));

        if (!userCode.length) {
          throw new UserInputError('UserCode not found');
        }

        await db.delete(UserCode).where(eq(UserCode.id, id));
        return true;
      } catch (error: any) {
        console.error('Error deleting UserCode:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },
  },
};

export default resolvers;
