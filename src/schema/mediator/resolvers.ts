// Update imports
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { AuthenticationError, UserInputError } from 'apollo-server';
import { db } from '../../config/postgres';
import uuidv4 from '../../utils/uuidv4';
import { Languages, mediator, mediatorGroup, mediatorGroupRelation, mediatorLanguageRelation } from '../../models'; // Ensure this exists in your models folder
import { alias } from 'drizzle-orm/pg-core';
import { ReadStream } from 'node:fs';
import * as xlsx from 'xlsx'; // For Excel file parsing
import csvParser from 'csv-parser';
import { logger } from '../../config/logger';
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

      try {
        const result = await db.execute(sql`
      SELECT
        m.id,
        m."userID",
        m."firstName",
        m."lastName",
        m.email,
        m.phone,
        m."IBAN",
        m.status,
        m."monday_time_slots",
        m."tuesday_time_slots",
        m."wednesday_time_slots",
        m."thursday_time_slots",
        m."friday_time_slots",
        m."saturday_time_slots",
        m."sunday_time_slots",
        m."availableForEmergencies",
        m."availableOnHolidays",
        m."priority",
        m."createdAt",
        m."updatedAt",
        COALESCE(
          JSON_AGG(DISTINCT jsonb_build_object('id', g.id, 'groupName', g."groupName")) 
          FILTER (WHERE g.id IS NOT NULL), '[]'
        ) AS groups,
        COALESCE(
          JSON_AGG(DISTINCT jsonb_build_object(
            'sourceLanguage', jsonb_build_object('id', sl.id, 'name', sl."language_name"),
            'targetLanguage', jsonb_build_object('id', tl.id, 'name', tl."language_name")
          )) FILTER (WHERE sl.id IS NOT NULL AND tl.id IS NOT NULL), '[]'
        ) AS languages
      FROM ${mediator} m
      LEFT JOIN ${mediatorGroupRelation} mgr ON mgr."mediator_id" = m.id
      LEFT JOIN ${mediatorGroup} g ON g.id = mgr."mediator_group_id"
      LEFT JOIN ${mediatorLanguageRelation} mlr ON mlr."mediatorId" = m.id
      LEFT JOIN ${Languages} sl ON sl.id = mlr."sourceLanguageId"
      LEFT JOIN ${Languages} tl ON tl.id = mlr."targetLanguageId"
      WHERE m.id = ${id} AND m."userID" = ${context.user.id}
      GROUP BY m.id;`);

        const mediatorFound = result.rows?.[0];
        // console.log('Mediator found:', JSON.stringify(mediatorFound, null, 1));
        if (!mediatorFound) {
          throw new UserInputError('Mediator not found!');
        }

        return {
          ...mediatorFound,
          createdAt: mediatorFound.createdAt || '',
          updatedAt: mediatorFound.updatedAt || '',
          groups: mediatorFound.groups || [],
          languages: Array.isArray(mediatorFound.languages)
            ? mediatorFound.languages.map((item: { sourceLanguage: { id: any; name: any; }; targetLanguage: { id: any; name: any; }; }) => {
              return {
                sourceLanguageId: item.sourceLanguage.id,
                sourceLanguageName: item.sourceLanguage.name,
                targetLanguageId: item.targetLanguage.id,
                targetLanguageName: item.targetLanguage.name,
              };
            })
            : [],
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
        // Base query
        let query = db.select({
          id: mediator.id,
          userID: mediator.userID,
          firstName: mediator.firstName,
          lastName: mediator.lastName,
          email: mediator.email,
          phone: mediator.phone,
          IBAN: mediator.IBAN,
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
        }).from(mediator);

        const filters = [];

        if (name) {
          filters.push(
            or(
              ilike(mediator.firstName, `%${name}%`),
              ilike(mediator.lastName, `%${name}%`)
            )
          );
        }
        filters.push(eq(mediator.userID, context.user.id))

        if (status) {
          filters.push(ilike(mediator.status, `%${status}%`));
        }

        if (filters.length > 0) {
          query.where(and(...filters));
        }

        // Sorting
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
        // Count for pagination
        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(mediator)
          .where(filters.length > 0 ? and(...filters) : undefined);

        const totalCount = countResult[0]?.count || 0;

        // Apply pagination
        const mediators = await query.limit(limit).offset(offset);
        const mediatorIds = mediators.map((m) => m.id);

        const groupNamesResult = await db
          .select({
            mediatorId: mediatorGroupRelation.mediatorId,
            groupName: mediatorGroup.groupName,
          })
          .from(mediatorGroupRelation)
          .leftJoin(
            mediatorGroup,
            eq(mediatorGroup.id, mediatorGroupRelation.mediatorGroupId)
          )
          .where(inArray(mediatorGroupRelation.mediatorId, mediatorIds));
        logger.info('Group names result:', groupNamesResult);
        // --- Fetch languages ---
        const languageResult = await db
          .select({
            mediatorId: mediatorLanguageRelation.mediatorId,
            sourceLanguageId: Languages.id,
            sourceLanguageName: Languages.language_name,
            targetLanguageId: alias(Languages, 'target').id,
            targetLanguageName: alias(Languages, 'target').language_name,
          })
          .from(mediatorLanguageRelation)
          .leftJoin(Languages, eq(Languages.id, mediatorLanguageRelation.sourceLanguageId))
          .leftJoin(alias(Languages, 'target'), eq(alias(Languages, 'target').id, mediatorLanguageRelation.targetLanguageId))
          .where(inArray(mediatorLanguageRelation.mediatorId, mediatorIds));

        // --- Map group names and languages into mediators ---
        const mediatorsWithExtras = mediators.map((mediator) => {
          const groups = groupNamesResult
            .filter((g) => g.mediatorId === mediator.id)
            .map((g) => ({ groupName: g.groupName }));

          const languages = languageResult
            .filter((l) => l.mediatorId === mediator.id)
            .map((l) => ({
              sourceLanguageId: l.sourceLanguageId,
              sourceLanguageName: l.sourceLanguageName,
              targetLanguageId: l.targetLanguageId,
              targetLanguageName: l.targetLanguageName,
            }));

          return {
            ...mediator,
            groups: groups,
            languages,
          };
        });

        return {
          mediators: mediatorsWithExtras,
          filteredCount: totalCount,
        };
      } catch (error: any) {
        console.error('Error fetching mediators paginated list:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    }


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
          status: mediatorData.status || 'active',
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
        if (mediatorData.languages && mediatorData.languages.length > 0) {
          const languagesData = mediatorData?.languages || [];
          const languagePairs = languagesData.map((pair: any) => ({
            sourceLanguageId: pair.sourceLanguageId,
            targetLanguageId: pair.targetLanguageId,
            id: uuidv4(),
            createdAt: new Date(),
            updatedAt: new Date(),
            mediatorId: mediatorObj.id,
          }));
          // Insert language pairs into the database
          await db.insert(mediatorLanguageRelation).values(languagePairs).returning();

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

        if (mediatorData.groupIDs && mediatorData.groupIDs.length > 0) {
          const groupIds = mediatorData.groupIDs;
          await db.delete(mediatorGroupRelation).where(eq(mediatorGroupRelation.mediatorId, updatedMediator.id));
          let data = await db.insert(mediatorGroupRelation).values(
            groupIds.map((groupId: string) => ({
              mediatorId: updatedMediator.id,
              mediatorGroupId: groupId,
              id: uuidv4(),
              updatedAt: new Date(),
            }))
          ).returning();
          console.log('Mediator associated with groups:', data);
        }
        if (mediatorData.languages && mediatorData.languages.length > 0) {
          const languagesData = mediatorData?.languages || [];
          await db.delete(mediatorLanguageRelation).where(eq(mediatorLanguageRelation.mediatorId, updatedMediator.id));

          const languagePairs = languagesData.map((pair: any) => ({
            sourceLanguageId: pair.sourceLanguageId,
            targetLanguageId: pair.targetLanguageId,
            id: uuidv4(),
            updatedAt: new Date(),
            mediatorId: updatedMediator.id,
          }));
          // Insert language pairs into the database
          await db.insert(mediatorLanguageRelation).values(languagePairs).returning();

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
        const saveMediatorsToDatabase = async (mediatorData: any[], userId: string) => {
          const mediatorEntries = mediatorData.map((data) => ({
            id: uuidv4(),
            userID: userId,
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            phone: data.phone,
            IBAN: data.IBAN || null,
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

          const groupRelationEntries = mediatorData
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

          const languageRelationEntries = mediatorData
            .map((row: any, idx: number) => {
              const sourceLanguages = String(row.sourceLanguages || '').split(',').map((s: string) => s.trim());
              const targetLanguages = String(row.targetLanguages || '').split(',').map((s: string) => s.trim());

              if (sourceLanguages.length !== targetLanguages.length) {
                throw new Error(`Row ${idx + 1}: Source and target languages must have the same number of entries.`);
              }

              // Find the mediator by firstName, lastName, and phone
              const mediatorObj = mediatorEntries.find((m: any) =>
                m.firstName === row.firstName && m.lastName === row.lastName && m.phone === row.phone
              );
              if (!mediatorObj) {
                throw new Error(`Mediator with name ${row.firstName} ${row.lastName} not found.`);
              }

              return sourceLanguages.map((sourceLang: string, i: number) => {
                const targetLang = targetLanguages[i];
                if (!sourceLang || !targetLang) {
                  throw new Error(`Row ${idx + 1}: Invalid language pair at position ${i + 1}.`);
                }
                return {
                  id: uuidv4(),
                  mediatorId: mediatorObj.id,
                  sourceLanguageId: (() => {
                    const foundLang = languages.find((lang: any) => String(lang.language_name).toLocaleLowerCase() === String(sourceLang).toLocaleLowerCase());
                    if (!foundLang) {
                      throw new Error(`Source language "${sourceLang}" not found in row ${idx + 1}.`);
                    }
                    return foundLang.id;
                  })(),
                  targetLanguageId: (() => {
                    const foundLang = languages.find((lang: any) => String(lang.language_name).toLocaleLowerCase() === String(targetLang).toLocaleLowerCase());
                    if (!foundLang) {
                      throw new Error(`Target language "${targetLang}" not found in row ${idx + 1}.`);
                    }
                    return foundLang.id;
                  })(),
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };
              });
            })
            .flat();
          const data = await db.insert(mediator).values(mediatorEntries).returning();

          console.log({ data })
          if (groupRelationEntries.length > 0) {
            const groupData = await db.insert(mediatorGroupRelation).values(groupRelationEntries).returning();
            console.log({ groupData })
          }
          console.log({ languageRelationEntries })
          if (languageRelationEntries.length > 0) {
            await db.insert(mediatorLanguageRelation).values(languageRelationEntries).returning();
          }

          return data;
        }

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

