import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import { AuthenticationError, UserInputError } from 'apollo-server';
import { db } from '../../config/postgres';
import uuidv4 from '../../utils/uuidv4';
import {
  interpreter,
  mediatorGroup,
  mediatorGroupRelation,
} from '../../models';
import { logger } from '../../config/logger';
import { createSystemLog, getClientInfo } from '../../utils/systemLogger';

const resolvers = {
  Query: {
    groupByID: async (
      _: any,
      { id, phone_number_id }: { id: string; phone_number_id: string },
    ): Promise<any> => {
      try {
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
          .where(
            and(
              eq(mediatorGroup.id, id),
              eq(mediatorGroup.phone_number_id, phone_number_id),
            ),
          );

        const group = groups[0];

        if (!group) {
          throw new UserInputError('Group not found!');
        }

        const mediators = await db
          .select({
            id: interpreter.id,
            first_name: interpreter.first_name,
            last_name: interpreter.last_name,
            email: interpreter.email,
          })
          .from(interpreter)
          .innerJoin(
            mediatorGroupRelation,
            eq(interpreter.id, mediatorGroupRelation.interpreter_id),
          )
          .where(eq(mediatorGroupRelation.mediator_group_id, id));

        logger.info(`Fetched group by ID: ${id}`, {
          group,
          mediatorCount: mediators.length,
        });

        return {
          ...group,
          created_at: group.created_at?.toISOString() || '',
          updated_at: group.updated_at?.toISOString() || '',
          mediators,
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
        orderBy = 'created_at',
        name = '',
        phone_number_id = '',
      }: {
        offset?: number;
        limit?: number;
        order?: string;
        orderBy?: string;
        name?: string;
        phone_number_id?: string;
      },
      context: any,
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
            mediatorCount: sql<number>`COUNT(${mediatorGroupRelation.interpreter_id})`,
          })
          .from(mediatorGroup)
          .leftJoin(
            mediatorGroupRelation,
            eq(mediatorGroup.id, mediatorGroupRelation.mediator_group_id),
          )
          .groupBy(mediatorGroup.id);

        const filters = [];
        if (name) {
          filters.push(ilike(mediatorGroup.group_name, '%' + name + '%'));
        }
        filters.push(eq(mediatorGroup.phone_number_id, phone_number_id));
        if (filters.length > 0) {
          query.where(and(...filters));
        }

        if (orderBy && order) {
          const isValidColumn =
            orderBy in mediatorGroup &&
            typeof mediatorGroup[orderBy as keyof typeof mediatorGroup] ===
              'object';
          if (isValidColumn) {
            const sortColumn = mediatorGroup[
              orderBy as keyof typeof mediatorGroup
            ] as any;
            query.orderBy(
              order.toUpperCase() === 'ASC'
                ? asc(sortColumn)
                : desc(sortColumn),
            );
          } else {
            query.orderBy(
              order.toUpperCase() === 'ASC'
                ? asc(mediatorGroup.created_at)
                : desc(mediatorGroup.created_at),
            );
          }
        }

        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(mediatorGroup)
          .where(filters.length > 0 ? and(...filters) : undefined);

        const totalCount = countResult[0]?.count || 0;
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
    allGroups: async (
      _: any,
      { phone_number_id }: { phone_number_id: string },
      context: any,
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }
      try {
        const groups = await db
          .select()
          .from(mediatorGroup)
          .where(
            and(
              eq(mediatorGroup.client_id, context.user.id),
              eq(mediatorGroup.status, 'active'),
              eq(mediatorGroup.phone_number_id, phone_number_id),
            ),
          )
          .orderBy(desc(mediatorGroup.created_at));

        return groups.map((group) => ({
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
    addGroup: async (
      _: any,
      { groupInput }: { groupInput: any },
      context: any,
    ) => {
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
          phone_number_id: groupInput.phone_number_id,
        };
        const [created] = await db
          .insert(mediatorGroup)
          .values(groupData)
          .returning();

        if (created) {
          const clientInfo = getClientInfo(context);
          await createSystemLog({
            action: 'CREATE',
            client_id: context.user.id,
            phone_number_id: groupInput.phone_number_id,
            ip: clientInfo.ip,
            browser: clientInfo.browser,
            changes: {
              id: created.id,
              group_name: { new: created.group_name },
              status: { new: created.status },
            },
            description: `Created new mediator group ${created.group_name}`,
          });
          return created;
        } else {
          throw new Error('Group creation failed. No result returned.');
        }
      } catch (error: any) {
        console.error('Error creating group:', error);
        throw new Error('Error: ' + error.message);
      }
    },
    editGroup: async (
      _: any,
      { id, groupInput }: { id: string; groupInput: any },
      context: any,
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }
      try {
        const groups = await db
          .select()
          .from(mediatorGroup)
          .where(eq(mediatorGroup.id, id));
        const existingGroup = groups[0];

        if (!existingGroup) {
          throw new UserInputError('Group not found');
        }

        const updatedData = {
          group_name:
            groupInput.group_name !== undefined
              ? String(groupInput.group_name).toLocaleLowerCase()
              : existingGroup.group_name,
          status: groupInput.status || existingGroup.status,
          updated_at: new Date(),
        };

        await db
          .update(mediatorGroup)
          .set(updatedData)
          .where(eq(mediatorGroup.id, id));

        const [updatedGroup] = await db
          .select()
          .from(mediatorGroup)
          .where(eq(mediatorGroup.id, id));

        if (updatedGroup) {
          const clientInfo = getClientInfo(context);
          const changes = {
            id: updatedGroup.id,
            group_name:
              existingGroup.group_name !== updatedGroup.group_name
                ? {
                    old: existingGroup.group_name,
                    new: updatedGroup.group_name,
                  }
                : undefined,
            status:
              existingGroup.status !== updatedGroup.status
                ? { old: existingGroup.status, new: updatedGroup.status }
                : undefined,
          };
          (Object.keys(changes) as Array<keyof typeof changes>).forEach(
            (key) => changes[key] === undefined && delete changes[key],
          );
          await createSystemLog({
            action: 'UPDATE',
            client_id: context.user.id,
            phone_number_id: updatedGroup.phone_number_id,
            ip: clientInfo.ip,
            browser: clientInfo.browser,
            changes,
            description: `Updated mediator group ${updatedGroup.group_name}`,
          });
          return updatedGroup;
        } else {
          throw new Error('Group update failed. No updated group returned.');
        }
      } catch (error: any) {
        console.error('Error updating group:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },
    changeGroupStatus: async (
      _: any,
      { id, status }: { id: string; status: string },
      context: any,
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }
      try {
        const groups = await db
          .select()
          .from(mediatorGroup)
          .where(eq(mediatorGroup.id, id));
        const existingGroup = groups[0];

        if (!existingGroup) {
          throw new UserInputError('Group not found');
        }

        await db
          .update(mediatorGroup)
          .set({ status, updated_at: new Date() })
          .where(eq(mediatorGroup.id, id));

        const [updatedGroup] = await db
          .select()
          .from(mediatorGroup)
          .where(eq(mediatorGroup.id, id));

        if (updatedGroup) {
          const clientInfo = getClientInfo(context);
          await createSystemLog({
            action: 'UPDATE',
            client_id: context.user.id,
            phone_number_id: updatedGroup.phone_number_id,
            ip: clientInfo.ip,
            browser: clientInfo.browser,
            changes: {
              id: updatedGroup.id,
              status: { old: existingGroup.status, new: status },
            },
            description: `Changed mediator group ${updatedGroup.group_name} status to ${status}`,
          });
          return updatedGroup;
        } else {
          throw new Error(
            'Group status update failed. No updated group returned.',
          );
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
        const groups = await db
          .select()
          .from(mediatorGroup)
          .where(eq(mediatorGroup.id, id));
        const existingGroup = groups[0];

        if (!existingGroup) {
          throw new UserInputError('Group not found');
        }

        const clientInfo = getClientInfo(context);
        await createSystemLog({
          action: 'DELETE',
          client_id: context.user.id,
          phone_number_id: existingGroup.phone_number_id,
          ip: clientInfo.ip,
          browser: clientInfo.browser,
          changes: {
            id: existingGroup.id,
          },
          description: `Deleted mediator group ${existingGroup.group_name}`,
        });

        await db.delete(mediatorGroup).where(eq(mediatorGroup.id, id));
        return true;
      } catch (error: any) {
        console.error('Error deleting group:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },
    addMediatorToGroup: async (
      _: any,
      { groupID, mediatorIDs }: { groupID: string; mediatorIDs: Array<string> },
      context: any,
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }
      try {
        const groups = await db
          .select()
          .from(mediatorGroup)
          .where(eq(mediatorGroup.id, groupID));
        const existingGroup = groups[0];

        if (!existingGroup) {
          throw new UserInputError('Group not found');
        }

        await db
          .delete(mediatorGroupRelation)
          .where(eq(mediatorGroupRelation.mediator_group_id, groupID));
        const obj = mediatorIDs.map((id: string) => ({
          id: uuidv4(),
          mediator_group_id: groupID,
          interpreter_id: id,
          created_at: new Date(),
          updated_at: new Date(),
        }));
        await db.insert(mediatorGroupRelation).values(obj);

        const clientInfo = getClientInfo(context);
        await createSystemLog({
          action: 'UPDATE',
          client_id: context.user.id,
          phone_number_id: existingGroup.phone_number_id,
          ip: clientInfo.ip,
          browser: clientInfo.browser,
          changes: {
            id: groupID,
            mediators: { new: mediatorIDs },
          },
          description: `Updated mediators in group ${existingGroup.group_name}`,
        });

        return true;
      } catch (error: any) {
        console.error('Error adding interpreter to group:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },
    removeMediatorFromGroup: async (
      _: any,
      { groupID, mediatorID }: { groupID: string; mediatorID: string },
      context: any,
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }
      try {
        const group = await db
          .select()
          .from(mediatorGroup)
          .where(eq(mediatorGroup.id, groupID));
        if (!group[0]) {
          throw new UserInputError('Group not found');
        }
        const mediatorExists = await db
          .select()
          .from(interpreter)
          .where(eq(interpreter.id, mediatorID));
        if (!mediatorExists[0]) {
          throw new UserInputError('Interpreter not found');
        }
        await db
          .delete(mediatorGroupRelation)
          .where(
            and(
              eq(mediatorGroupRelation.mediator_group_id, groupID),
              eq(mediatorGroupRelation.interpreter_id, mediatorID),
            ),
          );
        const clientInfo = getClientInfo(context);
        await createSystemLog({
          action: 'UPDATE',
          client_id: context.user.id,
          phone_number_id: group[0].phone_number_id,
          ip: clientInfo.ip,
          browser: clientInfo.browser,
          changes: {
            id: groupID,
            removedMediator: { old: mediatorID },
          },
          description: `Removed mediator from group ${group[0].group_name}`,
        });

        const [updatedGroup] = await db
          .select()
          .from(mediatorGroup)
          .where(eq(mediatorGroup.id, groupID));
        return updatedGroup;
      } catch (error: any) {
        console.error('Error removing interpreter from group:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },
  },
};

export default resolvers;
