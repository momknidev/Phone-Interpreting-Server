import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { AuthenticationError, UserInputError } from 'apollo-server';
import { db } from '../../config/postgres';
import uuidv4 from '../../utils/uuidv4';
import { Languages, LanguagesTarget } from '../../models'; // Assuming Languages model exists in models folder

const resolvers = {
  Query: {
    sourceLanguages: async (
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
      try {
        let query = db.select().from(Languages);
        const filters = [];
        filters.push(eq(Languages.client_id, context?.user?.id));
        if (search) {
          filters.push(ilike(Languages.language_name, '%' + search + '%'));
        }
        filters.push(eq(Languages.phone_number, phone_number))
        if (filters.length > 0) {
          query.where(and(...filters));
        }

        // Apply sorting
        if (orderBy && order) {
          const isValidColumn = orderBy in Languages && typeof Languages[orderBy as keyof typeof Languages] === 'object';
          if (isValidColumn) {
            const sortColumn = Languages[orderBy as keyof typeof Languages] as any;
            query.orderBy(
              order.toUpperCase() === 'ASC' ? asc(sortColumn) : desc(sortColumn)
            );
          } else {
            // Default to created_at if invalid column provided
            query.orderBy(order.toUpperCase() === 'ASC' ? asc(Languages.created_at) : desc(Languages.created_at));
          }
        }

        // Get total count for pagination
        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(Languages)
          .where(filters.length > 0 ? and(...filters) : undefined);

        const totalCount = countResult[0]?.count || 0;
        // Apply pagination
        const languages = await query.limit(limit).offset(offset);
        return {
          languages,
          filteredCount: totalCount,
        };
      } catch (error: any) {
        console.error('Error fetching languages paginated list:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },
    targetLanguages: async (
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
      try {
        let query = db.select().from(LanguagesTarget);
        const filters = [];
        filters.push(eq(LanguagesTarget.client_id, context?.user?.id));
        if (search) {
          filters.push(ilike(LanguagesTarget.language_name, '%' + search + '%'));
        }
        filters.push(eq(LanguagesTarget.phone_number, phone_number))
        if (filters.length > 0) {
          query.where(and(...filters));
        }

        // Apply sorting
        if (orderBy && order) {
          const isValidColumn = orderBy in LanguagesTarget && typeof LanguagesTarget[orderBy as keyof typeof LanguagesTarget] === 'object';
          if (isValidColumn) {
            const sortColumn = LanguagesTarget[orderBy as keyof typeof LanguagesTarget] as any;
            query.orderBy(
              order.toUpperCase() === 'ASC' ? asc(sortColumn) : desc(sortColumn)
            );
          } else {
            // Default to created_at if invalid column provided
            query.orderBy(order.toUpperCase() === 'ASC' ? asc(LanguagesTarget.created_at) : desc(LanguagesTarget.created_at));
          }
        }

        // Get total count for pagination
        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(LanguagesTarget)
          .where(filters.length > 0 ? and(...filters) : undefined);

        const totalCount = countResult[0]?.count || 0;
        // Apply pagination
        const languages = await query.limit(limit).offset(offset);
        return {
          languages,
          filteredCount: totalCount,
        };
      } catch (error: any) {
        console.error('Error fetching languages paginated list:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },
    allSourceLanguages: async (_: any, { phone_number }: any, context: any) => {
      try {
        const languages = await db.select().from(Languages).where(eq(Languages.phone_number, phone_number));
        return languages;
      } catch (error: any) {
        console.error('Error fetching all languages:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },
    allTargetLanguages: async (_: any, { phone_number }: any, context: any) => {
      try {
        const languages = await db.select().from(LanguagesTarget).where(eq(LanguagesTarget.phone_number, phone_number));
        return languages;
      } catch (error: any) {
        console.error('Error fetching all languages:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },

  },

  Mutation: {
    createSourceLanguage: async (
      _: any,
      { input }: { input: { language_code: number; language_name: string, phone_number: string } },
      context: any
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const languageData = {
          id: uuidv4(),
          language_code: input.language_code,
          language_name: input.language_name,
          client_id: context.user.id,
          created_at: new Date(),
          updated_at: new Date(),
          phone_number: input.phone_number
        };

        console.log('Creating Languages with data:', languageData);
        const result = await db.insert(Languages).values(languageData).returning();

        if (result && result[0]) {
          return result[0];
        } else {
          throw new Error('Language creation failed. No result returned.');
        }
      } catch (error: any) {
        console.error('Error creating Languages:', error);
        throw new Error('Error: ' + error.message);
      }
    },

    updateSourceLanguage: async (
      _: any,
      { id, input }: { id: string; input: { language_code: number; language_name: string } },
      context: any
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        // Fetch the existing Languages details
        const languages = await db.select().from(Languages).where(and(eq(Languages.id, id), eq(Languages.client_id, context.user.id)));
        const existingLanguage = languages[0];

        if (!existingLanguage) {
          throw new UserInputError('Language not found');
        }

        // Prepare the updated Languages data
        const updatedData = {
          language_code: input.language_code,
          language_name: input.language_name,
          updated_at: new Date(),
        };

        // Update Languages details in the database
        await db.update(Languages).set(updatedData).where(eq(Languages.id, id));

        // Fetch the updated Languages details
        const updatedLanguages = await db.select().from(Languages).where(eq(Languages.id, id));
        const updatedLanguage = updatedLanguages[0];

        if (updatedLanguage) {
          return updatedLanguage;
        } else {
          throw new Error('Language update failed. No updated Languages returned.');
        }
      } catch (error: any) {
        console.error('Error updating Languages:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },

    deleteSourceLanguage: async (_: any, { id }: { id: string }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        // Fetch the existing Languages to verify it exists
        const languages = await db.select().from(Languages).where(
          and(eq(Languages.id, id),
            eq(Languages.client_id, context.user.id)));
        console.log(languages)
        if (!languages[0]) {
          throw new UserInputError('Language not found');
        }

        // Delete the Languages
        await db.delete(Languages).where(eq(Languages.id, id));

        return true;
      } catch (error: any) {
        console.error('Error deleting Languages:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },

    createTargetLanguage: async (
      _: any,
      { input }: { input: { language_code: number; language_name: string, phone_number: string } },
      context: any
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const languageData = {
          id: uuidv4(),
          language_code: input.language_code,
          language_name: input.language_name,
          client_id: context.user.id,
          created_at: new Date(),
          updated_at: new Date(),
          phone_number: input.phone_number
        };

        console.log('Creating Languages with data:', languageData);
        const result = await db.insert(LanguagesTarget).values(languageData).returning();

        if (result && result[0]) {
          return result[0];
        } else {
          throw new Error('Language creation failed. No result returned.');
        }
      } catch (error: any) {
        console.error('Error creating sourceLanguages:', error);
        throw new Error('Error: ' + error.message);
      }
    },

    updateTargetLanguage: async (
      _: any,
      { id, input }: { id: string; input: { language_code: number; language_name: string } },
      context: any
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        // Fetch the existing sourceLanguages details
        const languages = await db.select().from(LanguagesTarget).where(and(eq(LanguagesTarget.id, id), eq(LanguagesTarget.client_id, context.user.id)));
        const existingLanguage = languages[0];

        if (!existingLanguage) {
          throw new UserInputError('Language not found');
        }

        // Prepare the updated sourceLanguages data
        const updatedData = {
          language_code: input.language_code,
          language_name: input.language_name,
          updated_at: new Date(),
        };

        // Update sourceLanguages details in the database
        await db.update(LanguagesTarget).set(updatedData).where(eq(LanguagesTarget.id, id));

        // Fetch the updated sourceLanguages details
        const updatedLanguages = await db.select().from(LanguagesTarget).where(eq(LanguagesTarget.id, id));
        const updatedLanguage = updatedLanguages[0];

        if (updatedLanguage) {
          return updatedLanguage;
        } else {
          throw new Error('Language update failed. No updated target language returned.');
        }
      } catch (error: any) {
        console.error('Error updating target language:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },
    deleteTargetLanguage: async (_: any, { id }: { id: string }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        // Fetch the existing sourceLanguages to verify it exists
        const languages = await db.select().from(LanguagesTarget).where(
          and(eq(LanguagesTarget.id, id),
            eq(LanguagesTarget.client_id, context.user.id)));

        if (!languages[0]) {
          throw new UserInputError('Language not found');
        }

        // Delete the sourceLanguages
        await db.delete(LanguagesTarget).where(eq(LanguagesTarget.id, id));

        return true;
      } catch (error: any) {
        console.error('Error deleting target languages:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },
    syncTargetLanguagesData: async (_: any, { phone_number }: { phone_number: string }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        // Step 1: Fetch all source languages for the given phone_number
        const sourceLanguages = await db
          .select()
          .from(Languages)
          .where(
            and(
              eq(Languages.client_id, context.user.id),
              eq(Languages.phone_number, phone_number)
            )
          );

        if (!sourceLanguages.length) {
          return 'No source languages found for the provided phone number.';
        }

        for (const sourceLang of sourceLanguages) {
          // Step 2: Check if a matching target language already exists
          const existing = await db
            .select()
            .from(LanguagesTarget)
            .where(
              and(
                eq(LanguagesTarget.client_id, context.user.id),
                eq(LanguagesTarget.language_code, sourceLang.language_code),
                eq(LanguagesTarget.phone_number, phone_number)
              )
            );

          const now = new Date();

          if (existing.length > 0) {
            // Update existing target language
            await db
              .update(LanguagesTarget)
              .set({
                language_name: sourceLang.language_name,
                updated_at: now,
              })
              .where(eq(LanguagesTarget.id, existing[0].id));
          } else {
            // Insert new target language
            await db.insert(LanguagesTarget).values({
              id: uuidv4(),
              language_code: sourceLang.language_code,
              language_name: sourceLang.language_name,
              client_id: context.user.id,
              phone_number: phone_number,
              created_at: now,
              updated_at: now,
            });
          }
        }

        return 'Languages successfully synced from source to target.';
      } catch (error: any) {
        console.error('Error syncing languages:', error.message);
        throw new Error('Error syncing languages: ' + error.message);
      }
    },
    syncSourceLanguagesData: async (
      _: any,
      { phone_number }: { phone_number: string },
      context: any
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        // Step 1: Fetch all target languages for the given phone number
        const targetLanguages = await db
          .select()
          .from(LanguagesTarget)
          .where(
            and(
              eq(LanguagesTarget.client_id, context.user.id),
              eq(LanguagesTarget.phone_number, phone_number)
            )
          );

        if (!targetLanguages.length) {
          return 'No target languages found for the provided phone number.';
        }

        for (const targetLang of targetLanguages) {
          // Step 2: Check if a matching source language already exists
          const existing = await db
            .select()
            .from(Languages)
            .where(
              and(
                eq(Languages.client_id, context.user.id),
                eq(Languages.language_code, targetLang.language_code),
                eq(Languages.phone_number, phone_number)
              )
            );

          const now = new Date();

          if (existing.length > 0) {
            // Update existing source language
            await db
              .update(Languages)
              .set({
                language_name: targetLang.language_name,
                updated_at: now,
              })
              .where(eq(Languages.id, existing[0].id));
          } else {
            // Insert new source language
            await db.insert(Languages).values({
              id: uuidv4(),
              language_code: targetLang.language_code,
              language_name: targetLang.language_name,
              client_id: context.user.id,
              phone_number: phone_number,
              created_at: now,
              updated_at: now,
            });
          }
        }

        return 'Languages successfully synced from target to source.';
      } catch (error: any) {
        console.error('Error syncing languages:', error.message);
        throw new Error('Error syncing languages: ' + error.message);
      }
    }



  },
};

export default resolvers;
