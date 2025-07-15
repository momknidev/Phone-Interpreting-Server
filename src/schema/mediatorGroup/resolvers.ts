// Add imports for the new Group model
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { AuthenticationError, UserInputError } from 'apollo-server';
import { db } from '../../config/postgres';
import uuidv4 from '../../utils/uuidv4';
import { mediatorGroup } from '../../models'; // Make sure this exists in your models folder

// Add to existing resolvers
const resolvers = {
  // Keep existing resolvers
  Query: {
    // Keep existing query resolvers

    // Add new query resolvers for Group
    groupByID: async (_: any, { id }: { id: string }): Promise<any> => {
      try {
        const groups = await db
          .select()
          .from(mediatorGroup)
          .where(eq(mediatorGroup.id, id));

        const group = groups[0];

        if (!group) {
          throw new UserInputError('Group not found!');
        }

        return {
          ...group,
          createdAt: group.createdAt?.toISOString() || '',
          updatedAt: group.updatedAt?.toISOString() || '',
        };
      } catch (error: any) {
        console.error('Error fetching group by ID:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },

    groupsPaginatedList: async (
      _: any,
      {
        offset = 0,
        limit = 10,
        order = 'DESC',
        orderBy = 'createdAt',
        name = '',
      }: {
        offset?: number;
        limit?: number;
        order?: string;
        orderBy?: string;
        name?: string;
      },
      context: any
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }
      try {
        let query = db.select().from(mediatorGroup);

        const filters = [];

        if (name) {
          filters.push(ilike(mediatorGroup.groupName, '%' + name + '%'));
        }

        if (filters.length > 0) {
          query.where(and(...filters));
        }

        // Apply sorting
        if (orderBy && order) {
          const isValidColumn = orderBy in mediatorGroup && typeof mediatorGroup[orderBy as keyof typeof mediatorGroup] === 'object';
          if (isValidColumn) {
            const sortColumn = mediatorGroup[orderBy as keyof typeof mediatorGroup] as any;
            query.orderBy(
              order.toUpperCase() === 'ASC' ? asc(sortColumn) : desc(sortColumn)
            );
          } else {
            // Default to createdAt if invalid column provided
            query.orderBy(order.toUpperCase() === 'ASC' ? asc(mediatorGroup.createdAt) : desc(mediatorGroup.createdAt));
          }
        }

        // Get total count for pagination
        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(mediatorGroup)
          .where(filters.length > 0 ? and(...filters) : undefined);

        const totalCount = countResult[0]?.count || 0;

        // Apply pagination
        const groups = await query.limit(limit).offset(offset);

        return {
          groups,
          filteredCount: totalCount,
        };
      } catch (error: any) {
        console.error('Error fetching groups paginated list:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },
  },

  Mutation: {
    // Keep existing mutation resolvers

    // Add new mutation resolvers for Group
    addGroup: async (_: any, { groupInput }: { groupInput: any }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }
      try {
        const groupData = {
          id: uuidv4(),
          groupName: groupInput.groupName,
          status: groupInput.status,
          userID: context.user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        console.log('Creating group with data:', groupData);
        const result = await db.insert(mediatorGroup).values(groupData).returning();
        if (result) {
          return result[0];
        } else {
          throw new Error('Group creation failed. No result returned.');
        }
      } catch (error: any) {
        console.error('Error creating group:', error);
        throw new Error('Error: ' + error.message);
      }
    },

    editGroup: async (_: any, { id, groupInput }: { id: string, groupInput: any }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }
      try {
        // Fetch the existing group details
        const groups = await db.select().from(mediatorGroup).where(eq(mediatorGroup.id, id));
        const existingGroup = groups[0];

        if (!existingGroup) {
          throw new UserInputError('Group not found');
        }

        // Prepare the updated group data
        const updatedData = {
          groupName: groupInput.groupName || existingGroup.groupName,
          status: groupInput.status || existingGroup.status,
        };

        // Update group details in the database
        await db.update(mediatorGroup).set(updatedData).where(eq(mediatorGroup.id, id));

        // Fetch the updated group details
        const updatedGroups = await db.select().from(mediatorGroup).where(eq(mediatorGroup.id, id));
        const updatedGroup = updatedGroups[0];

        if (updatedGroup) {
          return updatedGroup;
        } else {
          throw new Error('Group update failed. No updated group returned.');
        }
      } catch (error: any) {
        console.error('Error updating group:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },

    changeGroupStatus: async (_: any, { id, status }: { id: string, status: string }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        // Fetch the existing group details
        const groups = await db.select().from(mediatorGroup).where(eq(mediatorGroup.id, id));
        const existingGroup = groups[0];

        if (!existingGroup) {
          throw new UserInputError('Group not found');
        }

        // Update the group's status
        await db.update(mediatorGroup).set({ status }).where(eq(mediatorGroup.id, id));

        // Fetch the updated group details
        const updatedGroups = await db.select().from(mediatorGroup).where(eq(mediatorGroup.id, id));
        const updatedGroup = updatedGroups[0];

        if (updatedGroup) {
          return updatedGroup;
        } else {
          throw new Error('Group status update failed. No updated group returned.');
        }
      } catch (error: any) {
        console.error('Error updating group status:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },
  },
};

export default resolvers;
