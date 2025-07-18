// Update imports
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { AuthenticationError, UserInputError } from 'apollo-server';
import { db } from '../../config/postgres';
import uuidv4 from '../../utils/uuidv4';
import { Languages, mediator, mediatorGroup, mediatorGroupRelation } from '../../models'; // Ensure this exists in your models folder
import { alias } from 'drizzle-orm/pg-core';
import { ReadStream } from 'node:fs';
import * as xlsx from 'xlsx'; // For Excel file parsing
import csvParser from 'csv-parser';
const streamToBuffer = (stream: ReadStream) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => {
      // Ensure the chunk is always a Buffer
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', (err) => reject(err));
  });
// Function to check if a time slot format is valid (HH:MM-HH:MM)


const resolvers = {
  Upload: require('graphql-upload-ts').GraphQLUpload,
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

      const lang1 = alias(Languages, 'lang1');
      const lang2 = alias(Languages, 'lang2');
      const lang3 = alias(Languages, 'lang3');
      const lang4 = alias(Languages, 'lang4');

      const groups = alias(mediatorGroupRelation, 'groups'); // Alias for the group relation table

      try {
        // Fetch mediator details along with languages and groups
        const result = await db
          .select({
            id: mediator.id,
            userID: mediator.userID,
            firstName: mediator.firstName,
            lastName: mediator.lastName,
            email: mediator.email,
            phone: mediator.phone,
            IBAN: mediator.IBAN,
            sourceLanguage1: mediator.sourceLanguage1,
            sourceLanguage2: mediator.sourceLanguage2,
            sourceLanguage3: mediator.sourceLanguage3,
            sourceLanguage4: mediator.sourceLanguage4,
            targetLanguage1: lang1.language_name,
            targetLanguage2: lang2.language_name,
            targetLanguage3: lang3.language_name,
            targetLanguage4: lang4.language_name,
            status: mediator.status,
            monday_time_slots: mediator.monday_time_slots,
            tuesday_time_slots: mediator.tuesday_time_slots,
            wednesday_time_slots: mediator.wednesday_time_slots,
            thursday_time_slots: mediator.thursday_time_slots,
            friday_time_slots: mediator.friday_time_slots,
            saturday_time_slots: mediator.saturday_time_slots,
            sunday_time_slots: mediator.sunday_time_slots,
            availableForEmergencies: mediator.availableForEmergencies,
            availableOnHolidays: mediator.availableOnHolidays,
            priority: mediator.priority,
            createdAt: mediator.createdAt,
            updatedAt: mediator.updatedAt,
            groupIDs: sql<string[]>`
          ARRAY(SELECT mediator_group_id FROM ${mediatorGroupRelation} WHERE ${mediatorGroupRelation}.mediator_id = ${mediator.id})`,
          })
          .from(mediator)
          .leftJoin(lang1, eq(lang1.id, mediator.targetLanguage1))
          .leftJoin(lang2, eq(lang2.id, mediator.targetLanguage2))
          .leftJoin(lang3, eq(lang3.id, mediator.targetLanguage3))
          .leftJoin(lang4, eq(lang4.id, mediator.targetLanguage4))
          .where(and(eq(mediator.id, id), eq(mediator.userID, context.user.id)));

        const mediatorFound = result[0];

        if (!mediatorFound) {
          throw new UserInputError('Mediator not found!');
        }
        console.log({ mediatorFound })
        // Return the mediator along with their associated group IDs
        return {
          ...mediatorFound,
          groupIDs: mediatorFound.groupIDs || [], // Ensure groupIDs is always an array
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
        const lang1 = alias(Languages, 'lang1');
        const lang2 = alias(Languages, 'lang2');
        const lang3 = alias(Languages, 'lang3');
        const lang4 = alias(Languages, 'lang4');

        let query = db.select({
          id: mediator.id,
          userID: mediator.userID,
          firstName: mediator.firstName,
          lastName: mediator.lastName,
          email: mediator.email,
          phone: mediator.phone,
          IBAN: mediator.IBAN,
          sourceLanguage1: mediator.sourceLanguage1,
          sourceLanguage2: mediator.sourceLanguage2,
          sourceLanguage3: mediator.sourceLanguage3,
          sourceLanguage4: mediator.sourceLanguage4,
          status: mediator.status,
          monday_time_slots: mediator.monday_time_slots,
          tuesday_time_slots: mediator.tuesday_time_slots,
          wednesday_time_slots: mediator.wednesday_time_slots,
          thursday_time_slots: mediator.thursday_time_slots,
          friday_time_slots: mediator.friday_time_slots,
          saturday_time_slots: mediator.saturday_time_slots,
          sunday_time_slots: mediator.sunday_time_slots,
          availableForEmergencies: mediator.availableForEmergencies,
          availableOnHolidays: mediator.availableOnHolidays,
          priority: mediator.priority,
          createdAt: mediator.createdAt,
          updatedAt: mediator.updatedAt,
          targetLanguage1: lang1.language_name,
          targetLanguage2: lang2.language_name,
          targetLanguage3: lang3.language_name,
          targetLanguage4: lang4.language_name,
        }).from(mediator)
          .leftJoin(lang1, eq(lang1.id, mediator.targetLanguage1))
          .leftJoin(lang2, eq(lang2.id, mediator.targetLanguage2))
          .leftJoin(lang3, eq(lang3.id, mediator.targetLanguage3))
          .leftJoin(lang4, eq(lang4.id, mediator.targetLanguage4));

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
        const mediatorIds = mediators.map((mediator) => mediator.id);
        const groupNamesResult = await db
          .select({
            mediatorId: mediatorGroupRelation.mediatorId,
            groupNames: mediatorGroup.groupName,
          })
          .from(mediatorGroupRelation)
          .leftJoin(mediatorGroup, eq(mediatorGroup.id, mediatorGroupRelation.mediatorGroupId))
          .where(inArray(mediatorGroupRelation.mediatorId, mediatorIds));

        // Map group names to each mediator
        const mediatorsWithGroupNames = mediators.map((mediator) => {
          const groupNames = groupNamesResult
            .filter((item) => item.mediatorId === mediator.id)
            .map((item) => item.groupNames);
          return {
            ...mediator,
            groupIDs: groupNames,
          };
        });

        return {
          mediators: mediatorsWithGroupNames,
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
        const mediatorObj = result[0]
        // Find groups by name
        console.log('Mediator created:', mediatorObj);
        console.log('Mediator data to associate with groups:', mediatorData.groupIDs);
        try {
          // If we need to associate the mediator with groups
          if (mediatorData.groupIDs && mediatorData.groupIDs.length > 0) {
            const groupIds = mediatorData.groupIDs;
            console.log("Associating mediator with groups:", groupIds);

            let data = await db.insert(mediatorGroupRelation).values(
              groupIds.map((groupId: string) => ({
                mediatorId: mediatorObj.id,
                mediatorGroupId: groupId,
                id: uuidv4(),
                createdAt: new Date(),
                updatedAt: new Date(),
              }))
            ).returning();
            console.log('Mediator associated with groups:', data);
          }
        } catch (groupError) {
          console.error('Error associating mediator with groups:', groupError);
        }

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
        try {
          // If we need to associate the mediator with groups
          if (mediatorData.groupIDs && mediatorData.groupIDs.length > 0) {
            const groupIds = mediatorData.groupIDs;
            console.log("Associating mediator with groups:", groupIds);
            await db.delete(mediatorGroupRelation).where(eq(mediatorGroupRelation.mediatorId, updatedMediator.id));
            console.log('Deleting existing group associations for mediator:', updatedMediator.id);
            let data = await db.insert(mediatorGroupRelation).values(
              groupIds.map((groupId: string) => ({
                mediatorId: updatedMediator.id,
                mediatorGroupId: groupId,
                id: uuidv4(),
                createdAt: new Date(),
                updatedAt: new Date(),
              }))
            ).returning();
            console.log('Mediator associated with groups:', data);
          }
        } catch (groupError) {
          console.error('Error associating mediator with groups:', groupError);
        }
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
    //     uploadMediatorFile(file: Upload!): JSON
    // this mutation will recieve mediators list file and verify all comlumns need for mediator object first declare columns and check for these columns if any column missing return error otherwise create rows in database


    uploadMediatorFile: async (_: any, { file }: { file: any }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }
      const languages = await db.select().from(Languages).where(
        eq(Languages.userID, context.user.id)
      );
      const groups = await db.select().from(mediatorGroup).where(
        eq(mediatorGroup.userID, context.user.id)
      );
      if (!languages.length) {
        throw new UserInputError('No languages found for the user.');
      }
      // Function to convert time string (HH:MM) to Date object for easy comparison
      const convertToDate = (timeString: string) => {
        const [hours, minutes] = timeString.split(':');
        const date = new Date();
        date.setHours(Number(hours));
        date.setMinutes(Number(minutes));
        date.setSeconds(0);
        date.setMilliseconds(0);
        return date;
      };

      // Function to check if time slots overlap
      const checkOverlap = (timeSlots: any) => {
        // Parse time slots into Date objects
        const parsedSlots = timeSlots.map((slot: string) => {
          const [start, end] = slot.split('-');
          return { start: convertToDate(start), end: convertToDate(end) };
        });

        // Sort the time slots by start time
        parsedSlots.sort((a: { start: number; }, b: { start: number; }) => a.start - b.start);

        // eslint-disable-next-line no-plusplus
        for (let i = 0; i < parsedSlots.length - 1; i++) {
          if (parsedSlots[i].end > parsedSlots[i + 1].start) {
            return true; // Found overlap
          }
        }

        return false; // No overlap
      };
      const validateTimeSlot = (timeSlot: string) => {
        const timeSlotRegex = /^\d{2}:\d{2}-\d{2}:\d{2}$/;
        if (!timeSlotRegex.test(timeSlot)) {
          return false; // Invalid format
        }

        const [start, end] = timeSlot.split('-');
        const startTime = convertToDate(start);
        const endTime = convertToDate(end);
        // Check if start time is later than end time
        if (startTime >= endTime) {
          return false; // Invalid time range
        }

        return true; // Valid time slot
      };

      function validateAndTransformData(data: any) {
        const transformedData: any = [];

        data.forEach((row: any, index: number) => {
          // Validate required fields (firstName, lastName, phone)
          if (!row.firstName || !row.lastName || !row.phone) {
            throw new Error(`Row ${index + 1}: Missing required fields (firstName, lastName, phone)`);
          }

          // Validate and check for overlapping time slots
          const timeSlots = [
            'monday_time_slots',
            'tuesday_time_slots',
            'wednesday_time_slots',
            'thursday_time_slots',
            'friday_time_slots',
            'saturday_time_slots',
            'sunday_time_slots',
          ];

          timeSlots.forEach((slot) => {
            if (row[slot]) {
              // eslint-disable-next-line no-shadow
              const timeSlotArray = row[slot].split(',').map((slot: string) => slot.trim()); // Split and trim commas
              // eslint-disable-next-line no-shadow
              timeSlotArray.forEach((slot: string) => {
                if (!validateTimeSlot(slot)) {
                  throw new Error(
                    `Row ${index + 1
                    }: Invalid time slot format for ${slot}. Must be in HH:MM-HH:MM format.`
                  );
                }
              });
              if (checkOverlap(timeSlotArray)) {
                throw new Error(`Row ${index + 1}: Overlapping time slots found for ${slot}.`);
              }
            }
          });
          row.sourceLanguage1 = row.targetLanguage1 ? 'Italian' : '';
          row.sourceLanguage2 = row.targetLanguage2 ? 'Italian' : '';
          row.sourceLanguage3 = row.targetLanguage3 ? 'Italian' : '';
          row.sourceLanguage4 = row.targetLanguage4 ? 'Italian' : '';
          row.status = row.status || 'active';
          row.availableForEmergencies = String(row.availableForEmergencies).toLowerCase() === 'true'
          row.availableOnHolidays = String(row.availableOnHolidays).toLowerCase() === 'true'
          row.priority = row.priority || 1;
          const setLanguageId = (languageField: string) => {
            const language = row[languageField];
            if (language) {
              const matchedLanguage = languages.find((lang: { language_name: any; }) => String(lang.language_name).toLocaleLowerCase() === String(language).toLocaleLowerCase());
              if (matchedLanguage) {
                row[languageField] = matchedLanguage.id;
              } else {
                throw new Error(
                  `Row ${index + 1
                  }: Invalid language value for ${languageField}. No matching language found.`
                );
              }
            }
          };
          setLanguageId('targetLanguage1');
          setLanguageId('targetLanguage2');
          setLanguageId('targetLanguage3');
          setLanguageId('targetLanguage4');

          transformedData.push(row);
        });

        return transformedData;
      }
      try {

        // Extract the file stream from the uploaded file
        const { createReadStream, mimetype } = await file;
        const stream = createReadStream();

        let mediatorData: any[] = [];

        if (mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || mimetype === 'application/vnd.ms-excel') {
          // Parse Excel file
          const workbook = xlsx.read(await streamToBuffer(stream), { type: 'buffer' });
          const sheetNames = workbook.SheetNames;

          if (sheetNames.length === 0) {
            throw new UserInputError('No sheets found in the Excel file.');
          }

          // Assuming data is in the first sheet
          const sheet = workbook.Sheets[sheetNames[0]];
          const rows = xlsx.utils.sheet_to_json(sheet);
          console.log({ rows })
          // Validate columns in Excel file
          // parser.on('end', async () => {
          if (rows.length === 0) {
            throw new UserInputError('No valid mediator data found in the CSV file.');
          }
          const result = validateAndTransformData(rows);

          const saveMediatorsToDatabase = async (mediatorData: any[], userId: string) => {
            const mediatorEntries = mediatorData.map((data) => ({
              id: uuidv4(),
              userID: userId,
              firstName: data.firstName,
              lastName: data.lastName,
              email: data.email,
              phone: data.phone,
              IBAN: data.IBAN || null,
              sourceLanguage1: data.sourceLanguage1 || null,
              targetLanguage1: data.targetLanguage1 || null,
              sourceLanguage2: data.sourceLanguage2 || null,
              targetLanguage2: data.targetLanguage2 || null,
              sourceLanguage3: data.sourceLanguage3 || null,
              targetLanguage3: data.targetLanguage3 || null,
              sourceLanguage4: data.sourceLanguage4 || null,
              targetLanguage4: data.targetLanguage4 || null,
              status: data.status || 'active',
              monday_time_slots: data.monday_time_slots || null,
              tuesday_time_slots: data.tuesday_time_slots || null,
              wednesday_time_slots: data.wednesday_time_slots || null,
              thursday_time_slots: data.thursday_time_slots || null,
              friday_time_slots: data.friday_time_slots || null,
              saturday_time_slots: data.saturday_time_slots || null,
              sunday_time_slots: data.sunday_time_slots || null,
              availableForEmergencies: data.availableForEmergencies || false,
              availableOnHolidays: data.availableOnHolidays || false,
              priority: data.priority || 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            }));
            // Insert all mediators in a single transaction
            const data = await db.insert(mediator).values(mediatorEntries).returning();
            // in data i have list of inserted mediators i have list of all groups and i also has group for each mediator in groups key of rows.
            // now write a function which map on saved medaitors and take groups from rows array by matching firstName and lastName
            // then create a record based on groups for each group in groups key find key from groups array and and create objects in following format
            // {id:"", mediator_id:"",mediator_group_id:""} and then save it in database  
            console.log({ data })
            // console.log({ data })
            const groupRelationEntries = rows
              .map((row: any) => {
                const groupsForMediator = String(row.groups).split(',') || [];
                return groupsForMediator.map((groupName: string) => {
                  // Find the mediator by firstName and lastName
                  const mediator = mediatorEntries.find((mediator: any) =>
                    mediator.firstName === row.firstName && mediator.lastName === row.lastName && mediator.phone === row.phone
                  );

                  // Check if mediator is found
                  if (!mediator) {
                    throw new Error(`Mediator with name ${row.firstName} ${row.lastName} not found.`);
                  }

                  // Find the group by groupName
                  let group: any = groups.find((group: any) => String(group.groupName).trim().toLocaleLowerCase() === String(groupName).trim().toLocaleLowerCase());

                  // Check if group is found
                  if (!group) {
                    const newAddedGroup = {
                      id: uuidv4(),
                      userID: context.user.id,
                      groupName: groupName,
                      createdAt: new Date(),
                      updatedAt: new Date(),
                      status: 'active',
                    };
                    // Insert the new group if not found
                    group = db.insert(mediatorGroup).values(newAddedGroup).returning();
                    throw new Error(`Group ${groupName} not found.`);
                  }
                  // id: string; mediatorId: string; mediatorGroupId: any; createdAt: Date; updatedAt: Date;

                  // Return the group relation entry if both mediator and group are found
                  return {
                    id: uuidv4(),
                    mediatorId: mediator.id, // Access mediator id safely
                    mediatorGroupId: group.id, // Access group id safely
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  };
                });
              })
              .flat();
            console.log({ groupRelationEntries })
            if (groupRelationEntries.length > 0) {
              const groupData = await db.insert(mediatorGroupRelation).values(groupRelationEntries).returning();
              console.log({ groupData })
            }
            return data;
          }


          await saveMediatorsToDatabase(result, context.user.id);
          // console.log({ mediatorData })
          return 'Mediators uploaded successfully using excel file.';
          // });

        } else if (mimetype === 'text/csv') {
          // Parse CSV file
          const parser = csvParser();
          stream.pipe(parser);

          parser.on('data', (row: any) => {
            // Validate the row against the expected columns
            if (!row.firstName || !row.lastName || !row.phone) {
              throw new UserInputError('Missing required columns in the CSV file.');
            }
            // Add the row to the mediatorData array
            mediatorData.push({
              firstName: row.firstName,
              lastName: row.lastName,
              email: row.email || null,
              phone: row.phone,
              IBAN: row.IBAN || null,
              sourceLanguage1: row.sourceLanguage1 || null,
              targetLanguage1: row.targetLanguage1 || null,
              sourceLanguage2: row.sourceLanguage2 || null,
              targetLanguage2: row.targetLanguage2 || null,
              sourceLanguage3: row.sourceLanguage3 || null,
              targetLanguage3: row.targetLanguage3 || null,
              sourceLanguage4: row.sourceLanguage4 || null,
              targetLanguage4: row.targetLanguage4 || null,
              status: row.status || 'active',
              monday_time_slots: row.monday_time_slots || null,
              tuesday_time_slots: row.tuesday_time_slots || null,
              wednesday_time_slots: row.wednesday_time_slots || null,
              thursday_time_slots: row.thursday_time_slots || null,
              friday_time_slots: row.friday_time_slots || null,
              saturday_time_slots: row.saturday_time_slots || null,
              sunday_time_slots: row.sunday_time_slots || null,
              availableForEmergencies: row.availableForEmergencies === 'true',
              availableOnHolidays: row.availableOnHolidays === 'true',
              priority: parseInt(row.priority, 10) || 1,
            });
          });


          const result = validateAndTransformData(mediatorData);

          const saveMediatorsToDatabase = async (mediatorData: any[], userId: string) => {
            const mediatorEntries = mediatorData.map((data) => ({
              id: uuidv4(),
              userID: userId,
              firstName: data.firstName,
              lastName: data.lastName,
              email: data.email,
              phone: data.phone,
              IBAN: data.IBAN || null,
              sourceLanguage1: data.sourceLanguage1 || null,
              targetLanguage1: data.targetLanguage1 || null,
              sourceLanguage2: data.sourceLanguage2 || null,
              targetLanguage2: data.targetLanguage2 || null,
              sourceLanguage3: data.sourceLanguage3 || null,
              targetLanguage3: data.targetLanguage3 || null,
              sourceLanguage4: data.sourceLanguage4 || null,
              targetLanguage4: data.targetLanguage4 || null,
              status: data.status || 'active',
              monday_time_slots: data.monday_time_slots || null,
              tuesday_time_slots: data.tuesday_time_slots || null,
              wednesday_time_slots: data.wednesday_time_slots || null,
              thursday_time_slots: data.thursday_time_slots || null,
              friday_time_slots: data.friday_time_slots || null,
              saturday_time_slots: data.saturday_time_slots || null,
              sunday_time_slots: data.sunday_time_slots || null,
              availableForEmergencies: data.availableForEmergencies || false,
              availableOnHolidays: data.availableOnHolidays || false,
              priority: data.priority || 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            }));
            console.log({ mediatorEntries })
            // Insert all mediators in a single transaction
            const data = await db.insert(mediator).values(mediatorEntries).returning();
            console.log({ data })
            return data;
          }
          // Handle errors in CSV parsing
          parser.on('error', (error) => {
            console.error('CSV Parsing Error:', error);
            throw new UserInputError('Error parsing the CSV file.');
          });
          // parser.on('end', async () => {
          if (mediatorData.length === 0) {
            throw new UserInputError('No valid mediator data found in the CSV file.');
          }

          await saveMediatorsToDatabase(result, context.user.id);
          console.log({ mediatorData })
          return 'Mediators uploaded successfully.';
          // });

        } else {
          throw new UserInputError('Invalid file type. Only CSV and Excel files are allowed.');
        }

      } catch (error: any) {
        console.error('Error uploading mediator file:', error.message);
        throw new Error('Error: ' + error.message);
      }
    }


  }
};

export default resolvers;

