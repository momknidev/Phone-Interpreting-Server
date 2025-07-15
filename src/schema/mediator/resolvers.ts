// Update imports
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { AuthenticationError, UserInputError } from 'apollo-server';
import { db } from '../../config/postgres';
import uuidv4 from '../../utils/uuidv4';
import { mediator } from '../../models'; // Ensure this exists in your models folder

const resolvers = {
  Query: {
    mediatorList: async (_: any, __: any, context: any): Promise<any> => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const mediators = await db.select().from(mediator).
          where(eq(mediator.userID, context.user.id))
        return mediators;
      } catch (error: any) {
        console.error('Error fetching mediators:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },

    mediatorById: async (_: any, { id }: { id: string }, context: any): Promise<any> => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const mediators = await db
          .select()
          .from(mediator)
          .where(and(eq(mediator.id, id), eq(mediator.userID, context.user.id)));

        const mediatorFound = mediators[0];

        if (!mediatorFound) {
          throw new UserInputError('Mediator not found!');
        }

        return {
          ...mediatorFound,
          createdAt: mediatorFound.createdAt?.toISOString() || '',
          updatedAt: mediatorFound.updatedAt?.toISOString() || '',
        };
      } catch (error: any) {
        console.error('Error fetching mediator by ID:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },

    mediatorsPaginatedList: async (
      _: any,
      {
        offset = 0,
        limit = 10,
        order = 'DESC',
        orderBy = 'createdAt',
        name = '',
        targetLanguage = '',
        status,
      }: {
        offset?: number;
        limit?: number;
        order?: string;
        orderBy?: string;
        name?: string;
        targetLanguage?: string;
        status?: string;
      },
      context: any
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        let query = db.select().from(mediator);

        const filters = [];
        filters.push(eq(mediator.userID, context.user.id));
        if (name) {
          filters.push(
            or(
              ilike(mediator.firstName, '%' + name + '%'),
              ilike(mediator.lastName, '%' + name + '%')
            )
          );
        }

        if (targetLanguage) {
          filters.push(
            or(
              ilike(mediator.targetLanguage1, '%' + targetLanguage + '%'),
              ilike(mediator.targetLanguage2, '%' + targetLanguage + '%'),
              ilike(mediator.targetLanguage3, '%' + targetLanguage + '%'),
              ilike(mediator.targetLanguage4, '%' + targetLanguage + '%')
            )
          );
        }

        if (status) {
          filters.push(ilike(mediator.status, status));
        }

        if (filters.length > 0) {
          query.where(and(...filters));
        }

        // Apply sorting
        if (orderBy && order) {
          const isValidColumn = orderBy in mediator && typeof mediator[orderBy as keyof typeof mediator] === 'object';
          if (isValidColumn) {
            const sortColumn = mediator[orderBy as keyof typeof mediator] as any;
            query.orderBy(
              order.toUpperCase() === 'ASC' ? asc(sortColumn) : desc(sortColumn)
            );
          } else {
            query.orderBy(order.toUpperCase() === 'ASC' ? asc(mediator.createdAt) : desc(mediator.createdAt));
          }
        }

        // Get total count for pagination
        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(mediator)
          .where(filters.length > 0 ? and(...filters) : undefined);

        const totalCount = countResult[0]?.count || 0;

        // Apply pagination
        const mediators = await query.limit(limit).offset(offset);

        return {
          mediators,
          filteredCount: totalCount,
        };
      } catch (error: any) {
        console.error('Error fetching mediators paginated list:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },
  },

  Mutation: {
    addMediator: async (_: any, { mediatorData }: { mediatorData: any }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const mediatorEntry = {
          id: uuidv4(),
          userID: context.user.id,
          firstName: mediatorData.firstName,
          lastName: mediatorData.lastName,
          email: mediatorData.email,
          phone: mediatorData.phone,
          IBAN: mediatorData.IBAN || null,
          sourceLanguage1: mediatorData.sourceLanguage1 || null,
          targetLanguage1: mediatorData.targetLanguage1 || null,
          sourceLanguage2: mediatorData.sourceLanguage2 || null,
          targetLanguage2: mediatorData.targetLanguage2 || null,
          sourceLanguage3: mediatorData.sourceLanguage3 || null,
          targetLanguage3: mediatorData.targetLanguage3 || null,
          sourceLanguage4: mediatorData.sourceLanguage4 || null,
          targetLanguage4: mediatorData.targetLanguage4 || null,
          status: mediatorData.status || true,
          monday_time_slots: mediatorData.monday_time_slots || null,
          tuesday_time_slots: mediatorData.tuesday_time_slots || null,
          wednesday_time_slots: mediatorData.wednesday_time_slots || null,
          thursday_time_slots: mediatorData.thursday_time_slots || null,
          friday_time_slots: mediatorData.friday_time_slots || null,
          saturday_time_slots: mediatorData.saturday_time_slots || null,
          sunday_time_slots: mediatorData.sunday_time_slots || null,
          availableForEmergencies: mediatorData.availableForEmergencies || false,
          availableOnHolidays: mediatorData.availableOnHolidays || false,
          priority: mediatorData.priority || 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        console.log('Creating mediator with data:', mediatorEntry);
        const result = await db.insert(mediator).values(mediatorEntry).returning();

        if (result && result[0]) {
          return result[0];
        } else {
          throw new Error('Mediator creation failed. No result returned.');
        }
      } catch (error: any) {
        console.error('Error creating mediator:', error);
        throw new Error('Error: ' + error.message);
      }
    },

    updateMediator: async (_: any, { id, mediatorData }: { id: string, mediatorData: any }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        // Fetch the existing mediator details
        const mediators = await db.select().from(mediator).where(eq(mediator.id, id));
        const existingMediator = mediators[0];

        if (!existingMediator) {
          throw new UserInputError('Mediator not found');
        }

        // Prepare the updated mediator data
        const updatedData = {
          firstName: mediatorData.firstName || existingMediator.firstName,
          lastName: mediatorData.lastName || existingMediator.lastName,
          email: mediatorData.email || existingMediator.email,
          phone: mediatorData.phone || existingMediator.phone,
          IBAN: mediatorData.IBAN !== undefined ? mediatorData.IBAN : existingMediator.IBAN,
          sourceLanguage1: mediatorData.sourceLanguage1 !== undefined ? mediatorData.sourceLanguage1 : existingMediator.sourceLanguage1,
          targetLanguage1: mediatorData.targetLanguage1 !== undefined ? mediatorData.targetLanguage1 : existingMediator.targetLanguage1,
          sourceLanguage2: mediatorData.sourceLanguage2 !== undefined ? mediatorData.sourceLanguage2 : existingMediator.sourceLanguage2,
          targetLanguage2: mediatorData.targetLanguage2 !== undefined ? mediatorData.targetLanguage2 : existingMediator.targetLanguage2,
          sourceLanguage3: mediatorData.sourceLanguage3 !== undefined ? mediatorData.sourceLanguage3 : existingMediator.sourceLanguage3,
          targetLanguage3: mediatorData.targetLanguage3 !== undefined ? mediatorData.targetLanguage3 : existingMediator.targetLanguage3,
          sourceLanguage4: mediatorData.sourceLanguage4 !== undefined ? mediatorData.sourceLanguage4 : existingMediator.sourceLanguage4,
          targetLanguage4: mediatorData.targetLanguage4 !== undefined ? mediatorData.targetLanguage4 : existingMediator.targetLanguage4,
          status: mediatorData.status !== undefined ? mediatorData.status : existingMediator.status,
          monday_time_slots: mediatorData.monday_time_slots !== undefined ? mediatorData.monday_time_slots : existingMediator.monday_time_slots,
          tuesday_time_slots: mediatorData.tuesday_time_slots !== undefined ? mediatorData.tuesday_time_slots : existingMediator.tuesday_time_slots,
          wednesday_time_slots: mediatorData.wednesday_time_slots !== undefined ? mediatorData.wednesday_time_slots : existingMediator.wednesday_time_slots,
          thursday_time_slots: mediatorData.thursday_time_slots !== undefined ? mediatorData.thursday_time_slots : existingMediator.thursday_time_slots,
          friday_time_slots: mediatorData.friday_time_slots !== undefined ? mediatorData.friday_time_slots : existingMediator.friday_time_slots,
          saturday_time_slots: mediatorData.saturday_time_slots !== undefined ? mediatorData.saturday_time_slots : existingMediator.saturday_time_slots,
          sunday_time_slots: mediatorData.sunday_time_slots !== undefined ? mediatorData.sunday_time_slots : existingMediator.sunday_time_slots,
          availableForEmergencies: mediatorData.availableForEmergencies !== undefined ? mediatorData.availableForEmergencies : existingMediator.availableForEmergencies,
          availableOnHolidays: mediatorData.availableOnHolidays !== undefined ? mediatorData.availableOnHolidays : existingMediator.availableOnHolidays,
          priority: mediatorData.priority !== undefined ? mediatorData.priority : existingMediator.priority,
          updatedAt: new Date(),
        };

        // Update mediator details in the database
        await db.update(mediator).set(updatedData).where(eq(mediator.id, id));

        // Fetch the updated mediator details
        const updatedMediators = await db.select().from(mediator).where(eq(mediator.id, id));
        const updatedMediator = updatedMediators[0];

        if (updatedMediator) {
          return updatedMediator;
        } else {
          throw new Error('Mediator update failed. No updated mediator returned.');
        }
      } catch (error: any) {
        console.error('Error updating mediator:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },

    deleteMediator: async (_: any, { id }: { id: string }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const mediators = await db.select().from(mediator).where(
          and(eq(mediator.id, id), eq(mediator.userID, context.user.id)));

        if (!mediators.length) {
          throw new UserInputError('Mediator not found');
        }

        await db.delete(mediator).where(eq(mediator.id, id));
        return true;
      } catch (error: any) {
        console.error('Error deleting mediator:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },

    updateMediatorStatus: async (_: any, { id, status }: { id: string, status: string }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        // Fetch the existing mediator details
        const mediators = await db.select().from(mediator).where(eq(mediator.id, id));
        const existingMediator = mediators[0];

        if (!existingMediator) {
          throw new UserInputError('Mediator not found');
        }

        // Convert string status to boolean (assuming 'active'/'inactive' or similar)

        // Update the mediator's status
        await db.update(mediator).set({ status }).where(eq(mediator.id, id));

        // Fetch the updated mediator details
        const updatedMediators = await db.select().from(mediator).where(eq(mediator.id, id));
        const updatedMediator = updatedMediators[0];

        if (updatedMediator) {
          return updatedMediator;
        } else {
          throw new Error('Mediator status update failed. No updated mediator returned.');
        }
      } catch (error: any) {
        console.error('Error updating mediator status:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },
  },
};

export default resolvers;
