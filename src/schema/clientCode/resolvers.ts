import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import { AuthenticationError, UserInputError } from 'apollo-server';
import { db } from '../../config/postgres';
import uuidv4 from '../../utils/uuidv4';
import { ClientCode } from '../../models'; // Assuming ClientCode model exists
import { logger } from '../../config/logger';
import { createSystemLog, getClientInfo } from '../../utils/systemLogger';

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
        phone_number_id = '',
      }: {
        offset?: number;
        limit?: number;
        order?: string;
        orderBy?: string;
        search?: string;
        phone_number_id?: string;
      },
      context: any,
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        let query = db.select().from(ClientCode);

        const filters = [];
        filters.push(eq(ClientCode.client_id, context?.user?.id)); // Ensure only the current user's codes are fetched
        filters.push(eq(ClientCode.phone_number_id, phone_number_id));
        if (search) {
          filters.push(ilike(ClientCode.code_label, `%${search}%`)); // Search by code_label
        }

        if (filters.length > 0) {
          query.where(and(...filters));
        }

        // Apply sorting
        if (orderBy && order) {
          const isValidColumn =
            orderBy in ClientCode &&
            typeof ClientCode[orderBy as keyof typeof ClientCode] === 'object';
          if (isValidColumn) {
            const sortColumn = ClientCode[
              orderBy as keyof typeof ClientCode
            ] as any;
            query.orderBy(
              order.toUpperCase() === 'ASC'
                ? asc(sortColumn)
                : desc(sortColumn),
            );
          } else {
            // Default to created_at if invalid column provided
            query.orderBy(
              order.toUpperCase() === 'ASC'
                ? asc(ClientCode.created_at)
                : desc(ClientCode.created_at),
            );
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
        console.error(
          'Error fetching user codes paginated list:',
          error.message,
        );
        throw new Error(error.message || 'Internal server error.');
      }
    },

    allClientCodes: async (_: any, __: any, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const userCodes = await db
          .select()
          .from(ClientCode)
          .where(eq(ClientCode.client_id, context.user.id));
        return userCodes;
      } catch (error: any) {
        console.error('Error fetching all user codes:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },

    clientCode: async (
      _: any,
      { id, phone_number_id }: { id: string; phone_number_id: string },
      context: any,
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const userCode = await db
          .select()
          .from(ClientCode)
          .where(
            and(
              eq(ClientCode.id, id),
              eq(ClientCode.client_id, context.user.id),
              eq(ClientCode.phone_number_id, phone_number_id),
            ),
          );

        if (!userCode.length) {
          logger.warn(
            `Client Code not found for ID: ${id} and Phone Number: ${phone_number_id}`,
          );
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
      {
        input,
      }: {
        input: {
          client_code: number;
          code_label: string;
          status: string;
          phone_number_id: string;
          credits: number;
        };
      },
      context: any,
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }
      logger.info(`Creating ClientCode with input: ${JSON.stringify(input)}`);
      try {
        const userCodeData = {
          id: uuidv4(),
          client_code: Number(input.client_code),
          code_label: input.code_label,
          client_id: context.user.id,
          phone_number_id: input.phone_number_id,
          status: input.status || 'active', // Default status to 'active'
          credits: input.credits || 0, // Default credits to 0
          created_at: new Date(),
          updated_at: new Date(),
        };

        const [created] = await db
          .insert(ClientCode)
          .values(userCodeData)
          .returning();

        if (created) {
          // Log the creation with new values
          const clientInfo = getClientInfo(context);
          await createSystemLog({
            action: 'CREATE',
            client_id: context.user.id,
            phone_number_id: input.phone_number_id,
            ip: clientInfo.ip,
            browser: clientInfo.browser,
            changes: {
              id: created.id,
              client_code: { new: created.client_code },
              code_label: { new: created.code_label },
              status: { new: created.status },
              credits: { new: created.credits },
            },
            description: `Created new client code ${input.client_code} with label ${input.code_label}`,
          });

          return created;
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
      {
        id,
        input,
      }: {
        id: string;
        input: {
          status: string;
          client_code: number;
          code_label: string;
          phone_number_id: string;
          credits: number;
        };
      },
      context: any,
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const userCode = await db
          .select()
          .from(ClientCode)
          .where(
            and(
              eq(ClientCode.id, id),
              eq(ClientCode.client_id, context.user.id),
            ),
          );

        if (!userCode.length) {
          throw new UserInputError('ClientCode not found');
        }

        const updatedData = {
          client_code: input.client_code
            ? Number(input.client_code)
            : userCode[0].client_code,
          code_label: input.code_label
            ? input.code_label
            : userCode[0].code_label,
          phone_number_id: userCode[0].phone_number_id,
          status: input.status || userCode[0].status,
          updated_at: new Date(),
          credits: !isNaN(input.credits)
            ? Number(input.credits)
            : userCode[0].credits,
        };

        await db
          .update(ClientCode)
          .set(updatedData)
          .where(eq(ClientCode.id, id));

        const updatedUserCode = await db
          .select()
          .from(ClientCode)
          .where(eq(ClientCode.id, id));

        // Log the update with specific field changes
        const clientInfo = getClientInfo(context);
        const changes = {
          id: updatedUserCode[0].id,
          client_code:
            userCode[0].client_code !== updatedUserCode[0].client_code
              ? {
                  old: userCode[0].client_code,
                  new: updatedUserCode[0].client_code,
                }
              : undefined,
          code_label:
            userCode[0].code_label !== updatedUserCode[0].code_label
              ? {
                  old: userCode[0].code_label,
                  new: updatedUserCode[0].code_label,
                }
              : undefined,
          status:
            userCode[0].status !== updatedUserCode[0].status
              ? { old: userCode[0].status, new: updatedUserCode[0].status }
              : undefined,
          credits:
            userCode[0].credits !== updatedUserCode[0].credits
              ? { old: userCode[0].credits, new: updatedUserCode[0].credits }
              : undefined,
        };

        // Remove undefined fields
        (Object.keys(changes) as (keyof typeof changes)[]).forEach(
          (key) => changes[key] === undefined && delete changes[key],
        );

        await createSystemLog({
          action: 'UPDATE',
          client_id: context.user.id,
          phone_number_id: updatedUserCode[0].phone_number_id,
          ip: clientInfo.ip,
          browser: clientInfo.browser,
          changes,
          description: `Updated client code ${updatedUserCode[0].client_code}`,
        });

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
        const userCode = await db
          .select()
          .from(ClientCode)
          .where(
            and(
              eq(ClientCode.id, id),
              eq(ClientCode.client_id, context.user.id),
            ),
          );

        if (!userCode.length) {
          throw new UserInputError('ClientCode not found');
        }

        // Log the deletion
        const clientInfo = getClientInfo(context);
        await createSystemLog({
          action: 'DELETE',
          client_id: context.user.id,
          phone_number_id: userCode[0].phone_number_id,
          ip: clientInfo.ip,
          browser: clientInfo.browser,
          changes: {
            id: userCode[0].id,
          },
          description: `Deleted client code ${userCode[0].client_code}`,
        });

        await db.delete(ClientCode).where(eq(ClientCode.id, id));
        return true;
      } catch (error: any) {
        console.error('Error deleting ClientCode:', error);
        if (
          error?.code === '23503' &&
          error?.constraint?.includes('client_code')
        ) {
          // Foreign key violation: referenced in another table (e.g., call_reports)
          throw new Error(
            'Cannot delete ClientCode: It is referenced in other records .',
          );
        }
        throw new Error(error.message || 'Internal server error.');
      }
    },
    changeClientCodeStatus: async (
      _: any,
      { id, status }: { id: string; status: string },
      context: any,
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const userCode = await db
          .select()
          .from(ClientCode)
          .where(
            and(
              eq(ClientCode.id, id),
              eq(ClientCode.client_id, context.user.id),
            ),
          );

        if (!userCode.length) {
          throw new UserInputError('ClientCode not found');
        }

        await db
          .update(ClientCode)
          .set({ status, updated_at: new Date() })
          .where(eq(ClientCode.id, id));

        const updatedUserCode = await db
          .select()
          .from(ClientCode)
          .where(eq(ClientCode.id, id));

        // Log the status change
        const clientInfo = getClientInfo(context);
        await createSystemLog({
          action: 'UPDATE',
          client_id: context.user.id,
          phone_number_id: userCode[0].phone_number_id,
          ip: clientInfo.ip,
          browser: clientInfo.browser,
          changes: {
            id: updatedUserCode[0].id,
            status: { old: userCode[0].status, new: status },
          },
          description: `Changed client code ${userCode[0].client_code} status to ${status}`,
        });

        return updatedUserCode[0];
      } catch (error: any) {
        console.error('Error changing ClientCode status:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },
  },
};

export default resolvers;
