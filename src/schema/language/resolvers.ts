import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { AuthenticationError, UserInputError } from 'apollo-server';
import { db } from '../../config/postgres';
import uuidv4 from '../../utils/uuidv4';
import { Languages, LanguagesTarget } from '../../models'; // Assuming Languages model exists in models folder
import { createSystemLog, getClientInfo } from '../../utils/systemLogger';
import { logger } from '../../config/logger';

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
      try {
        // logger.info(`"Context",${JSON.stringify(context)}\n`);
        let query = db.select().from(Languages);
        const filters = [];
        filters.push(eq(Languages.client_id, context?.user?.id));
        if (search) {
          filters.push(ilike(Languages.language_name, '%' + search + '%'));
        }
        filters.push(eq(Languages.phone_number_id, phone_number_id));
        if (filters.length > 0) {
          query.where(and(...filters));
        }

        // Apply sorting
        if (orderBy && order) {
          const isValidColumn =
            orderBy in Languages &&
            typeof Languages[orderBy as keyof typeof Languages] === 'object';
          if (isValidColumn) {
            const sortColumn = Languages[
              orderBy as keyof typeof Languages
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
                ? asc(Languages.created_at)
                : desc(Languages.created_at),
            );
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
        console.error(
          'Error fetching languages paginated list:',
          error.message,
        );
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
      try {
        let query = db.select().from(LanguagesTarget);
        const filters = [];
        filters.push(eq(LanguagesTarget.client_id, context?.user?.id));
        if (search) {
          filters.push(
            ilike(LanguagesTarget.language_name, '%' + search + '%'),
          );
        }
        filters.push(eq(LanguagesTarget.phone_number_id, phone_number_id));
        if (filters.length > 0) {
          query.where(and(...filters));
        }

        // Apply sorting
        if (orderBy && order) {
          const isValidColumn =
            orderBy in LanguagesTarget &&
            typeof LanguagesTarget[orderBy as keyof typeof LanguagesTarget] ===
              'object';
          if (isValidColumn) {
            const sortColumn = LanguagesTarget[
              orderBy as keyof typeof LanguagesTarget
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
                ? asc(LanguagesTarget.created_at)
                : desc(LanguagesTarget.created_at),
            );
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
        console.error(
          'Error fetching languages paginated list:',
          error.message,
        );
        throw new Error(error.message || 'Internal server error.');
      }
    },
    allSourceLanguages: async (
      _: any,
      { phone_number_id }: any,
      context: any,
    ) => {
      try {
        const languages = await db
          .select()
          .from(Languages)
          .where(eq(Languages.phone_number_id, phone_number_id));
        return languages;
      } catch (error: any) {
        console.error('Error fetching all languages:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },
    allTargetLanguages: async (
      _: any,
      { phone_number_id }: any,
      context: any,
    ) => {
      try {
        const languages = await db
          .select()
          .from(LanguagesTarget)
          .where(eq(LanguagesTarget.phone_number_id, phone_number_id));
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
      {
        input,
      }: {
        input: {
          language_code: number;
          language_name: string;
          phone_number_id: string;
        };
      },
      context: any,
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
          phone_number_id: input.phone_number_id,
        };

        const [created] = await db
          .insert(Languages)
          .values(languageData)
          .returning();

        if (created) {
          // Log source language creation
          const clientInfo = getClientInfo(context);
          await createSystemLog({
            action: 'CREATE',
            client_id: context.user.id,
            phone_number_id: input.phone_number_id,
            ip: clientInfo.ip,
            browser: clientInfo.browser,
            changes: {
              id: created.id,
              language_code: { new: created.language_code },
              language_name: { new: created.language_name },
              client_id: { new: created.client_id },
              phone_number_id: { new: created.phone_number_id },
            },
            description: `Created new source language ${input.language_name} (${input.language_code})`,
          });
          return created;
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
      {
        id,
        input,
      }: {
        id: string;
        input: { language_code: number; language_name: string };
      },
      context: any,
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        // Fetch the existing Languages details
        const languages = await db
          .select()
          .from(Languages)
          .where(
            and(eq(Languages.id, id), eq(Languages.client_id, context.user.id)),
          );
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
        const updatedLanguages = await db
          .select()
          .from(Languages)
          .where(eq(Languages.id, id));
        const updatedLanguage = updatedLanguages[0];

        // Log the update with specific field changes
        const clientInfo = getClientInfo(context);
        const changes = {
          id: updatedLanguage?.id,
          language_code:
            existingLanguage.language_code !== updatedLanguage?.language_code
              ? {
                  old: existingLanguage.language_code,
                  new: updatedLanguage?.language_code,
                }
              : undefined,
          language_name:
            existingLanguage.language_name !== updatedLanguage?.language_name
              ? {
                  old: existingLanguage.language_name,
                  new: updatedLanguage?.language_name,
                }
              : undefined,
        };

        // Remove undefined fields
        (Object.keys(changes) as (keyof typeof changes)[]).forEach(
          (key) => changes[key] === undefined && delete changes[key],
        );

        if (updatedLanguage) {
          await createSystemLog({
            action: 'UPDATE',
            client_id: context.user.id,
            phone_number_id: existingLanguage.phone_number_id,
            ip: clientInfo.ip,
            browser: clientInfo.browser,
            changes,
            description: `Updated source language ${updatedLanguage.language_name} (${updatedLanguage.language_code})`,
          });
          return updatedLanguage;
        } else {
          throw new Error(
            'Language update failed. No updated Languages returned.',
          );
        }
      } catch (error: any) {
        console.error('Error updating Languages:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },

    deleteSourceLanguage: async (
      _: any,
      { id }: { id: string },
      context: any,
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        // Fetch the existing Languages to verify it exists
        const languages = await db
          .select()
          .from(Languages)
          .where(
            and(eq(Languages.id, id), eq(Languages.client_id, context.user.id)),
          );
        console.log(languages);
        if (!languages[0]) {
          throw new UserInputError('Language not found');
        }

        // Log source language deletion
        const clientInfo = getClientInfo(context);
        await createSystemLog({
          action: 'DELETE',
          client_id: context.user.id,
          phone_number_id: languages[0].phone_number_id,
          ip: clientInfo.ip,
          browser: clientInfo.browser,
          changes: {
            deleted: languages[0],
          },
          description: `Deleted source language ${languages[0].language_name} (${languages[0].language_code})`,
        });

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
      {
        input,
      }: {
        input: {
          language_code: number;
          language_name: string;
          phone_number_id: string;
        };
      },
      context: any,
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
          phone_number_id: input.phone_number_id,
        };

        console.log('Creating Languages with data:', languageData);
        const [created] = await db
          .insert(LanguagesTarget)
          .values(languageData)
          .returning();

        if (created) {
          // Log target language creation
          const clientInfo = getClientInfo(context);
          await createSystemLog({
            action: 'CREATE',
            client_id: context.user.id,
            phone_number_id: input.phone_number_id,
            ip: clientInfo.ip,
            browser: clientInfo.browser,
            changes: {
              id: created.id,
              language_code: { new: created.language_code },
              language_name: { new: created.language_name },
              client_id: { new: created.client_id },
              phone_number_id: { new: created.phone_number_id },
            },
            description: `Created new target language ${input.language_name} (${input.language_code})`,
          });
          return created;
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
      {
        id,
        input,
      }: {
        id: string;
        input: { language_code: number; language_name: string };
      },
      context: any,
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        // Fetch the existing sourceLanguages details
        const languages = await db
          .select()
          .from(LanguagesTarget)
          .where(
            and(
              eq(LanguagesTarget.id, id),
              eq(LanguagesTarget.client_id, context.user.id),
            ),
          );
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
        await db
          .update(LanguagesTarget)
          .set(updatedData)
          .where(eq(LanguagesTarget.id, id));

        // Fetch the updated target language details
        const updatedLanguages = await db
          .select()
          .from(LanguagesTarget)
          .where(eq(LanguagesTarget.id, id));
        const updatedLanguage = updatedLanguages[0];

        // Log the update with specific field changes
        const clientInfo = getClientInfo(context);
        const changes = {
          id: updatedLanguage?.id,
          language_code:
            existingLanguage.language_code !== updatedLanguage?.language_code
              ? {
                  old: existingLanguage.language_code,
                  new: updatedLanguage?.language_code,
                }
              : undefined,
          language_name:
            existingLanguage.language_name !== updatedLanguage?.language_name
              ? {
                  old: existingLanguage.language_name,
                  new: updatedLanguage?.language_name,
                }
              : undefined,
        };

        // Remove undefined fields
        (Object.keys(changes) as (keyof typeof changes)[]).forEach(
          (key) => changes[key] === undefined && delete changes[key],
        );

        if (updatedLanguage) {
          await createSystemLog({
            action: 'UPDATE',
            client_id: context.user.id,
            phone_number_id: existingLanguage.phone_number_id,
            ip: clientInfo.ip,
            browser: clientInfo.browser,
            changes,
            description: `Updated target language ${updatedLanguage.language_name} (${updatedLanguage.language_code})`,
          });
          return updatedLanguage;
        } else {
          throw new Error(
            'Language update failed. No updated target language returned.',
          );
        }
      } catch (error: any) {
        console.error('Error updating target language:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },
    deleteTargetLanguage: async (
      _: any,
      { id }: { id: string },
      context: any,
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        // Fetch the existing sourceLanguages to verify it exists
        const languages = await db
          .select()
          .from(LanguagesTarget)
          .where(
            and(
              eq(LanguagesTarget.id, id),
              eq(LanguagesTarget.client_id, context.user.id),
            ),
          );

        if (!languages[0]) {
          throw new UserInputError('Language not found');
        }

        // Log target language deletion
        const clientInfo = getClientInfo(context);
        await createSystemLog({
          action: 'DELETE',
          client_id: context.user.id,
          phone_number_id: languages[0].phone_number_id,
          ip: clientInfo.ip,
          browser: clientInfo.browser,
          changes: {
            deleted: languages[0],
          },
          description: `Deleted target language ${languages[0].language_name} (${languages[0].language_code})`,
        });

        // Delete the sourceLanguages
        await db.delete(LanguagesTarget).where(eq(LanguagesTarget.id, id));

        return true;
      } catch (error: any) {
        console.error('Error deleting target languages:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },
    syncTargetLanguagesData: async (
      _: any,
      { phone_number_id }: { phone_number_id: string },
      context: any,
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        // Step 1: Fetch all source languages for the given phone_number_id
        const sourceLanguages = await db
          .select()
          .from(Languages)
          .where(
            and(
              eq(Languages.client_id, context.user.id),
              eq(Languages.phone_number_id, phone_number_id),
            ),
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
                eq(LanguagesTarget.phone_number_id, phone_number_id),
              ),
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
              phone_number_id: phone_number_id,
              created_at: now,
              updated_at: now,
            });
          }
        }

        // Log the sync operation
        const clientInfo = getClientInfo(context);
        await createSystemLog({
          action: 'UPDATE',
          client_id: context.user.id,
          phone_number_id,
          ip: clientInfo.ip,
          browser: clientInfo.browser,
          changes: {
            sourceLanguages,
            syncType: 'source_to_target',
          },
          description: `Synced ${sourceLanguages.length} languages from source to target languages`,
        });

        return 'Languages successfully synced from source to target.';
      } catch (error: any) {
        console.error('Error syncing languages:', error.message);
        throw new Error('Error syncing languages: ' + error.message);
      }
    },
    syncSourceLanguagesData: async (
      _: any,
      { phone_number_id }: { phone_number_id: string },
      context: any,
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
              eq(LanguagesTarget.phone_number_id, phone_number_id),
            ),
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
                eq(Languages.phone_number_id, phone_number_id),
              ),
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
              phone_number_id: phone_number_id,
              created_at: now,
              updated_at: now,
            });
          }
        }

        // Log the sync operation
        const clientInfo = getClientInfo(context);
        await createSystemLog({
          action: 'UPDATE',
          client_id: context.user.id,
          phone_number_id,
          ip: clientInfo.ip,
          browser: clientInfo.browser,
          changes: {
            targetLanguages,
            syncType: 'target_to_source',
          },
          description: `Synced ${targetLanguages.length} languages from target to source languages`,
        });

        return 'Languages successfully synced from target to source.';
      } catch (error: any) {
        console.error('Error syncing languages:', error.message);
        throw new Error('Error syncing languages: ' + error.message);
      }
    },
  },
};

export default resolvers;
