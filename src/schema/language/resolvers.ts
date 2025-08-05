import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { AuthenticationError, UserInputError } from 'apollo-server';
import { db } from '../../config/postgres';
import uuidv4 from '../../utils/uuidv4';
import { Languages } from '../../models'; // Assuming Languages model exists in models folder

const resolvers = {
  Query: {
    languages: async (
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

    allLanguages: async () => {
      try {
        const languages = await db.select().from(Languages);
        return languages;
      } catch (error: any) {
        console.error('Error fetching all languages:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },

    language: async (_: any, { id }: { id: string }) => {
      try {
        const languages = await db
          .select()
          .from(Languages)
          .where(eq(Languages.id, id));

        const languageData = languages[0];

        if (!languageData) {
          throw new UserInputError('Language not found!');
        }

        return languageData;
      } catch (error: any) {
        console.error('Error fetching Languages by ID:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },
  },

  Mutation: {
    createLanguage: async (
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

    updateLanguage: async (
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

    deleteLanguage: async (_: any, { id }: { id: string }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        // Fetch the existing Languages to verify it exists
        const languages = await db.select().from(Languages).where(
          and(eq(Languages.id, id),
            eq(Languages.client_id, context.user.id)));

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
    }
  },
};

export default resolvers;
