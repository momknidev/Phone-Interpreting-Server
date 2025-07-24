// Add imports for the new Group model
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { AuthenticationError, UserInputError } from 'apollo-server';
import { db } from '../../config/postgres';
import uuidv4 from '../../utils/uuidv4';
import { mediator, mediatorGroup, mediatorGroupRelation } from '../../models'; // Make sure this exists in your models folder
import { logger } from '../../config/logger';

// Add to existing resolvers
const resolvers = {
  Query: {
    groupByID: async (_: any, { id }: { id: string }): Promise<any> => {
      try {
        // Step 1: Fetch group info
        const groups = await db
          .select({
            id: mediatorGroup.id,
            groupName: mediatorGroup.groupName,
            status: mediatorGroup.status,
            userID: mediatorGroup.userID,
            createdAt: mediatorGroup.createdAt,
            updatedAt: mediatorGroup.updatedAt,
          })
          .from(mediatorGroup)
          .where(eq(mediatorGroup.id, id));

        const group = groups[0];

        if (!group) {
          throw new UserInputError('Group not found!');
        }

        // Step 2: Fetch related mediators
        const mediators = await db
          .select({
            id: mediator.id,
            firstName: mediator.firstName,
            lastName: mediator.lastName,
            email: mediator.email,
            // Add more fields as needed
          })
          .from(mediator)
          .innerJoin(
            mediatorGroupRelation,
            eq(mediator.id, mediatorGroupRelation.mediatorId)
          )
          .where(eq(mediatorGroupRelation.mediatorGroupId, id));

        logger.info(`Fetched group by ID: ${id}`, { group, mediatorCount: mediators.length });

        // Step 3: Return combined result
        return {
          ...group,
          createdAt: group.createdAt?.toISOString() || '',
          updatedAt: group.updatedAt?.toISOString() || '',
          mediators, // full list of related mediators
        };
      } catch (error: any) {
        console.error('Error fetching group by ID:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    }
    ,

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
        let query = db
          .select({
            id: mediatorGroup.id,
            groupName: mediatorGroup.groupName,
            createdAt: mediatorGroup.createdAt,
            updatedAt: mediatorGroup.updatedAt,
            status: mediatorGroup.status,
            mediatorCount: sql<number>`
          COUNT(${mediatorGroupRelation.mediatorId})
        `,
          })
          .from(mediatorGroup)
          .leftJoin(mediatorGroupRelation, eq(mediatorGroup.id, mediatorGroupRelation.mediatorGroupId))
          .groupBy(mediatorGroup.id); // Group by the group ID to count mediators for each group


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
    allGroups: async (_: any, __: any, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const groups = await db
          .select()
          .from(mediatorGroup)
          .where(and(eq(mediatorGroup.userID, context.user.id), eq(mediatorGroup.status, 'active')))
          .orderBy(desc(mediatorGroup.createdAt));

        return groups.map(group => ({
          ...group,
          createdAt: group.createdAt?.toISOString() || '',
          updatedAt: group.updatedAt?.toISOString() || '',
        }));
      } catch (error: any) {
        console.error('Error fetching all groups:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },
  },

  Mutation: {

    addGroup: async (_: any, { groupInput }: { groupInput: any }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }
      try {
        const groupData = {
          id: uuidv4(),
          groupName: String(groupInput.groupName).toLocaleLowerCase(),
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
          groupName: String(groupInput.groupName).toLocaleLowerCase() || existingGroup.groupName,
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
    deleteGroup: async (_: any, { id }: { id: string }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        // Check if the group exists first
        const groups = await db.select().from(mediatorGroup).where(eq(mediatorGroup.id, id));
        const existingGroup = groups[0];

        if (!existingGroup) {
          throw new UserInputError('Group not found');
        }

        // Delete the group
        await db.delete(mediatorGroup).where(eq(mediatorGroup.id, id));

        return "Group deleted successfully";
      } catch (error: any) {
        console.error('Error deleting group:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },
    addMediatorToGroup: async (_: any, { groupID, mediatorID }: { groupID: string, mediatorID: string }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }
      try {
        // Check group exists
        const group = await db.select().from(mediatorGroup).where(eq(mediatorGroup.id, groupID));
        if (!group[0]) {
          throw new UserInputError('Group not found');
        }
        // Check mediator exists
        const mediatorExists = await db.select().from(mediator).where(eq(mediator.id, mediatorID));
        if (!mediatorExists[0]) {
          throw new UserInputError('Mediator not found');
        }
        // Check if already in group
        const relation = await db.select().from(mediatorGroupRelation)
          .where(and(eq(mediatorGroupRelation.mediatorGroupId, groupID), eq(mediatorGroupRelation.mediatorId, mediatorID)));
        if (relation.length > 0) {
          throw new UserInputError('Mediator already in group');
        }
        // Add relation
        await db.insert(mediatorGroupRelation).values({
          id: uuidv4(),
          mediatorGroupId: groupID,
          mediatorId: mediatorID,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        // Return updated group
        const updatedGroup = await db.select().from(mediatorGroup).where(eq(mediatorGroup.id, groupID));
        return updatedGroup[0];
      } catch (error: any) {
        console.error('Error adding mediator to group:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },

    removeMediatorFromGroup: async (_: any, { groupID, mediatorID }: { groupID: string, mediatorID: string }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }
      try {
        // Check group exists
        const group = await db.select().from(mediatorGroup).where(eq(mediatorGroup.id, groupID));
        if (!group[0]) {
          throw new UserInputError('Group not found');
        }
        // Check mediator exists
        const mediatorExists = await db.select().from(mediator).where(eq(mediator.id, mediatorID));
        if (!mediatorExists[0]) {
          throw new UserInputError('Mediator not found');
        }
        // Remove relation
        await db.delete(mediatorGroupRelation)
          .where(and(eq(mediatorGroupRelation.mediatorGroupId, groupID), eq(mediatorGroupRelation.mediatorId, mediatorID)));
        // Return updated group
        const updatedGroup = await db.select().from(mediatorGroup).where(eq(mediatorGroup.id, groupID));
        return updatedGroup[0];
      } catch (error: any) {
        console.error('Error removing mediator from group:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },
  },
};

export default resolvers;
