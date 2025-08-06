import { and, eq } from 'drizzle-orm';
import { callRoutingSettings } from '../../models/call_routing_table';
import { db } from '../../config/postgres';

// Utility to sanitize and structure input properly
const getCallRoutingSettingsData = (input: any, now: string) => ({
  phone_number: input.phone_number,
  enable_code: input.enable_code ?? false,
  callingCodePrompt: input.callingCodePrompt,
  askSourceLanguage: input.askSourceLanguage ?? false,
  askTargetLanguage: input.askTargetLanguage ?? false,
  sourceLanguagePromptPrompt: input.sourceLanguagePromptPrompt,
  targetLanguagePrompt: input.targetLanguagePrompt,
  mediatorCallAlgorithm: input.mediatorCallAlgorithm ?? 'sequential',
  enableFallback: input.enableFallback ?? false,
  fallbackType: input.fallbackType,
  fallbackNumber: input.fallbackNumber,
  fallbackPrompt: input.fallbackPrompt,
  updatedAt: now,
});

const resolvers = {
  Query: {
    getCallRoutingSettings: async (_: any, { client_id, phone_number }: any) => {
      const [setting] = await db
        .select()
        .from(callRoutingSettings)
        .where(and(eq(callRoutingSettings.client_id, client_id), eq(callRoutingSettings.phone_number, phone_number)));

      return setting ?? null;
    },

    allCallRoutingSettings: async () => {
      return db.select().from(callRoutingSettings);
    },
  },

  Mutation: {
    createOrUpdateCallRoutingSettings: async (_, { client_id, input }: any) => {
      const [existing] = await db
        .select()
        .from(callRoutingSettings)
        .where(eq(callRoutingSettings.client_id, client_id));

      const now = new Date().toISOString();

      const data = {
        client_id,
        createdAt: existing?.createdAt ?? now,
        ...getCallRoutingSettingsData(input, now),
      };

      if (existing) {
        await db
          .update(callRoutingSettings)
          .set(data)
          .where(eq(callRoutingSettings.client_id, client_id));
      } else {
        await db.insert(callRoutingSettings).values(data);
      }

      const [updated] = await db
        .select()
        .from(callRoutingSettings)
        .where(eq(callRoutingSettings.client_id, client_id));

      return updated;
    },

    deleteCallRoutingSettings: async (_: any, { client_id }: any) => {
      const result = await db
        .delete(callRoutingSettings)
        .where(eq(callRoutingSettings.client_id, client_id));

      if (result.rowCount && result.rowCount > 0) {
        return result.rowCount > 0;

      } else {
        throw new Error("Error in deleting setting")
      }
    },
  },
};

export default resolvers;