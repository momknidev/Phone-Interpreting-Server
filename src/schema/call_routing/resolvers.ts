import { eq } from 'drizzle-orm';
import { db } from '../../config/postgres';
import { AuthenticationError, UserInputError } from 'apollo-server';
import uuidv4 from '../../utils/uuidv4';
import { callRoutingSettings } from '../../models';

const resolvers = {
  Query: {
    getCallRoutingSettings: async (_: any, { phone_number }: { phone_number: string }, context: any) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');

      const result = await db.select().from(callRoutingSettings).where(eq(callRoutingSettings.phone_number, phone_number));
      return result[0] || null;
    },

    allCallRoutingSettings: async () => {
      return await db.select().from(callRoutingSettings);
    },
  },

  Mutation: {
    createOrUpdateCallRoutingSettings: async (
      _: any,
      { input }: { input: any },
      context: any
    ) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');

      const existing = await db.select().from(callRoutingSettings).where(eq(callRoutingSettings.phone_number, input.phone_number));

      const data = {
        ...input,
        updatedAt: new Date(),
        client_id: context.user.id
      };

      if (existing.length) {
        await db.update(callRoutingSettings).set(data).where(eq(callRoutingSettings.phone_number, input.phone_number));
        const updated = await db.select().from(callRoutingSettings).where(eq(callRoutingSettings.phone_number, input.phone_number));
        return updated[0];
      } else {
        const record = {
          id: uuidv4(),
          ...data,
          client_id: context.user.id,
          createdAt: new Date(),
        };
        await db.insert(callRoutingSettings).values(record);
        return record;
      }
    },
    deleteCallRoutingSettings: async (_: any, { client_id }: { client_id: string }, context: any) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');

      const existing = await db.select().from(callRoutingSettings).where(eq(callRoutingSettings.client_id, client_id));
      if (!existing.length) throw new UserInputError('Settings not found');

      await db.delete(callRoutingSettings).where(eq(callRoutingSettings.client_id, client_id));
      return true;
    },
  },
};

export default resolvers;
