// Add imports for the new Group model
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { AuthenticationError, UserInputError } from 'apollo-server';
import { db } from '../../config/postgres';
import uuidv4 from '../../utils/uuidv4';
import { interpreter, mediatorGroup, mediatorGroupRelation } from '../../models'; // Make sure this exists in your models folder
import { logger } from '../../config/logger';

// Add to existing resolvers
const resolvers = {
  Query: {
    groupByID: async (_: any, { id, phone_number }: { id: string, phone_number: string }): Promise<any> => {
      try {
        // Step 1: Fetch group info
        const groups = await db
          .select({
            id: mediatorGroup.id,
            group_name: mediatorGroup.group_name,
            status: mediatorGroup.status,
            client_id: mediatorGroup.client_id,
            created_at: mediatorGroup.created_at,
            updated_at: mediatorGroup.updated_at,
          })
          .from(mediatorGroup)
          .where(and(eq(mediatorGroup.id, id), eq(mediatorGroup.phone_number, phone_number)));

        const group = groups[0];

        if (!group) {
          throw new UserInputError('Group not found!');
        }

        // Step 2: Fetch related mediators
        const mediators = await db
          .select({
            id: interpreter.id,
            first_name: interpreter.first_name,
            last_name: interpreter.last_name,
            email: interpreter.email,
            // Add more fields as needed
          })
          .from(interpreter)
          .innerJoin(
            mediatorGroupRelation,
            eq(interpreter.id, mediatorGroupRelation.mediator_id)
          )
          .where(eq(mediatorGroupRelation.mediator_group_id, id));

        logger.info(`Fetched group by ID: ${id}`, { group, mediatorCount: mediators.length });

        // Step 3: Return combined result
        return {
          ...group,
          created_at: group.created_at?.toISOString() || '',
          updated_at: group.updated_at?.toISOString() || '',
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
        orderBy = 'created_at',
        name = '',
        phone_number = ''
      }: {
        offset?: number;
        limit?: number;
        order?: string;
        orderBy?: string;
        name?: string;
        phone_number?: string
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
            group_name: mediatorGroup.group_name,
            created_at: mediatorGroup.created_at,
            updated_at: mediatorGroup.updated_at,
            status: mediatorGroup.status,
            mediatorCount: sql<number>`
          COUNT(${mediatorGroupRelation.mediator_id})
        `,
          })
          .from(mediatorGroup)
          .leftJoin(mediatorGroupRelation, eq(mediatorGroup.id, mediatorGroupRelation.mediator_group_id))
          .groupBy(mediatorGroup.id); // Group by the group ID to count mediators for each group


        const filters = [];

        if (name) {
          filters.push(ilike(mediatorGroup.group_name, '%' + name + '%'));
        }
        filters.push(eq(mediatorGroup.phone_number, phone_number))
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
            // Default to created_at if invalid column provided
            query.orderBy(order.toUpperCase() === 'ASC' ? asc(mediatorGroup.created_at) : desc(mediatorGroup.created_at));
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
    allGroups: async (_: any, { phone_number }: { phone_number: string }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const groups = await db
          .select()
          .from(mediatorGroup)
          .where(and(
            eq(mediatorGroup.client_id, context.user.id),
            eq(mediatorGroup.status, 'active'),
            eq(mediatorGroup.phone_number, phone_number)))
          .orderBy(desc(mediatorGroup.created_at));

        return groups.map(group => ({
          ...group,
          created_at: group.created_at?.toISOString() || '',
          updated_at: group.updated_at?.toISOString() || '',
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
          group_name: String(groupInput.group_name).toLocaleLowerCase(),
          status: groupInput.status,
          client_id: context.user.id,
          created_at: new Date(),
          updated_at: new Date(),
          phone_number: groupInput.phone_number
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
          group_name: String(groupInput.group_name).toLocaleLowerCase() || existingGroup.group_name,
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
    addMediatorToGroup: async (_: any, { groupID, mediatorIDs }: { groupID: string, mediatorIDs: Array<string> }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }
      try {
        await db
          .delete(mediatorGroupRelation)
          .where(eq(mediatorGroupRelation.mediator_group_id, groupID));
        // Add relation
        const obj = mediatorIDs.map((id: string) => ({
          id: uuidv4(),
          mediator_group_id: groupID,
          mediator_id: id,
          created_at: new Date(),
          updated_at: new Date(),
        }));
        await db.insert(mediatorGroupRelation).values(obj)
        // Return updated group
        return 'success';
      } catch (error: any) {
        console.error('Error adding interpreter to group:', error.message);
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
        // Check interpreter exists
        const mediatorExists = await db.select().from(interpreter).where(eq(interpreter.id, mediatorID));
        if (!mediatorExists[0]) {
          throw new UserInputError('Interpreter not found');
        }
        // Remove relation
        await db.delete(mediatorGroupRelation)
          .where(and(eq(mediatorGroupRelation.mediator_group_id, groupID), eq(mediatorGroupRelation.mediator_id, mediatorID)));
        // Return updated group
        const updatedGroup = await db.select().from(mediatorGroup).where(eq(mediatorGroup.id, groupID));
        return updatedGroup[0];
      } catch (error: any) {
        console.error('Error removing interpreter from group:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },
  },
};

export default resolvers;
