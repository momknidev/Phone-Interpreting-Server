// Update imports
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { AuthenticationError, UserInputError } from 'apollo-server';
import { db } from '../../config/postgres';
import uuidv4 from '../../utils/uuidv4';
import {
  Languages,
  interpreter,
  mediatorGroup,
  mediatorGroupRelation,
  interpreterSourceLanguages,
  interpreterTargetLanguages,
  LanguagesTarget,
} from '../../models'; // Ensure this exists in your models folder
import { alias } from 'drizzle-orm/pg-core';
import { ReadStream } from 'node:fs';
import * as xlsx from 'xlsx'; // For Excel file parsing
import csvParser from 'csv-parser';
import { logger } from '../../config/logger';
import { createSystemLog, getClientInfo } from '../../utils/systemLogger';
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
    mediatorList: async (
      _: any,
      { phone_number_id }: any,
      context: any,
    ): Promise<any> => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }
      try {
        const result = await db.query.interpreter.findMany({
          where: and(
            eq(interpreter.client_id, context.user.id),
            eq(interpreter.phone_number_id, phone_number_id),
          ),
          with: {
            sourceLanguages: {
              with: {
                sourceLanguage: true,
              },
            },
            targetLanguages: {
              with: {
                targetLanguage: true,
              },
            },
            groups: {
              with: {
                group: true,
              },
            },
          },
        });
        // console.log('Fetched interpreter with languages:', result);
        return result;
      } catch (error: any) {
        console.error('Error fetching interpreter by ID:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },

    mediatorById: async (
      _: any,
      { id, phone_number_id }: { id: string; phone_number_id: string },
      context: any,
    ): Promise<any> => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }
      try {
        const result = await db.query.interpreter.findFirst({
          where: and(
            eq(interpreter.id, id),
            eq(interpreter.phone_number_id, phone_number_id),
          ),
          with: {
            sourceLanguages: {
              with: {
                sourceLanguage: true,
              },
            },
            targetLanguages: {
              with: {
                targetLanguage: true,
              },
            },
            groups: {
              with: {
                group: true,
              },
            },
          },
        });
        // console.log('Fetched interpreter with languages:', JSON.stringify(result, null, 1));
        if (result) {
          return result;
        } else {
          throw new Error('No Interpreter found');
        }
      } catch (error: any) {
        console.error('Error fetching interpreter by ID:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },

    mediatorsPaginatedList: async (
      _: any,
      {
        offset = 0,
        limit = 10,
        order = 'DESC',
        orderBy = 'created_at',
        name = '',
        targetLanguage = '',
        status,
        phone_number_id = '',
      }: {
        offset?: number;
        limit?: number;
        order?: string;
        orderBy?: string;
        name?: string;
        targetLanguage?: string;
        status?: string;
        phone_number_id?: string;
      },
      context: any,
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        // Base query
        const filters = [];
        if (name) {
          filters.push(
            or(
              ilike(interpreter.first_name, `%${name}%`),
              ilike(interpreter.last_name, `%${name}%`),
            ),
          );
        }
        filters.push(
          and(
            eq(interpreter.client_id, context.user.id),
            eq(interpreter.phone_number_id, phone_number_id),
          ),
        );

        if (status) {
          filters.push(ilike(interpreter.status, `%${status}%`));
        }
        const orderColumns: Record<string, any> = {
          created_at: interpreter.created_at,
          first_name: interpreter.first_name,
          last_name: interpreter.last_name,
          // ...add all sortable columns here
        };
        const sortColumn = orderColumns[orderBy] ?? interpreter.created_at;

        // Query with relations
        const mediators = await db.query.interpreter.findMany({
          where: filters.length > 0 ? and(...filters) : undefined,
          orderBy:
            order?.toUpperCase() === 'ASC'
              ? [asc(sortColumn)]
              : [desc(sortColumn)],
          limit,
          offset,
          with: {
            sourceLanguages: {
              with: { sourceLanguage: true },
            },
            targetLanguages: {
              with: { targetLanguage: true },
            },
            groups: {
              with: { group: true },
            },
          },
        });
        // Count for pagination
        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(interpreter)
          .where(filters.length > 0 ? and(...filters) : undefined);

        const totalCount = countResult[0]?.count || 0;

        return {
          mediators,
          filteredCount: totalCount,
        };
      } catch (error: any) {
        console.error(
          'Error fetching mediators paginated list:',
          error.message,
        );
        throw new Error(error.message || 'Internal server error.');
      }
    },
  },

  Mutation: {
    addMediator: async (
      _: any,
      { mediatorData }: { mediatorData: any },
      context: any,
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }
      try {
        const mediatorEntry = {
          id: uuidv4(),
          client_id: context.user.id,
          first_name: mediatorData.first_name,
          last_name: mediatorData.last_name,
          email: mediatorData.email,
          phone: mediatorData.phone,
          iban: mediatorData.iban || null,
          status: mediatorData.status || 'active',
          monday_time_slots: mediatorData.monday_time_slots || null,
          tuesday_time_slots: mediatorData.tuesday_time_slots || null,
          wednesday_time_slots: mediatorData.wednesday_time_slots || null,
          thursday_time_slots: mediatorData.thursday_time_slots || null,
          friday_time_slots: mediatorData.friday_time_slots || null,
          saturday_time_slots: mediatorData.saturday_time_slots || null,
          sunday_time_slots: mediatorData.sunday_time_slots || null,
          availableForEmergencies:
            mediatorData.availableForEmergencies || false,
          availableOnHolidays: mediatorData.availableOnHolidays || false,
          phone_number_id: mediatorData.phone_number_id,
          priority: mediatorData.priority || 1,
          created_at: new Date(),
          updated_at: new Date(),
        };

        const result = await db
          .insert(interpreter)
          .values(mediatorEntry)
          .returning();
        const mediatorObj = result[0];
        // Find groups by name
        console.log('Interpreter created:', mediatorObj);
        console.log(
          'Interpreter data to associate with groups:',
          mediatorData.groupIDs,
        );

        if (mediatorData.groupIDs && mediatorData.groupIDs.length > 0) {
          const groupIds = mediatorData.groupIDs;
          console.log('Associating interpreter with groups:', groupIds);

          let data = await db
            .insert(mediatorGroupRelation)
            .values(
              groupIds.map((groupId: string) => ({
                interpreter_id: mediatorObj.id,
                mediator_group_id: groupId,
                id: uuidv4(),
                created_at: new Date(),
                updated_at: new Date(),
              })),
            )
            .returning();
          console.log('Interpreter associated with groups:', data);
        }
        const sourceLanguageData = mediatorData?.sourceLanguages || [];
        const targetLanguageData = mediatorData?.targetLanguages || [];

        const languagePairsSource = sourceLanguageData.map((id: any) => ({
          source_language_id: id,
          id: uuidv4(),
          interpreter_id: mediatorObj.id,
        }));
        const languagePairsTarget = targetLanguageData.map((id: any) => ({
          target_language_id: id,
          id: uuidv4(),
          interpreter_id: mediatorObj.id,
        }));
        if (languagePairsSource.length > 0) {
          // console.log({ languagePairsSource })
          await db
            .insert(interpreterSourceLanguages)
            .values(languagePairsSource);
        }
        if (languagePairsTarget.length > 0) {
          // console.log({ languagePairsTarget })
          const [created] = await db
            .insert(interpreterTargetLanguages)
            .values(languagePairsTarget)
            .returning();

          if (created) {
            // Log the creation with new values
            const clientInfo = getClientInfo(context);
            await createSystemLog({
              action: 'CREATE',
              client_id: context.user.id,
              phone_number_id: mediatorData.phone_number_id,
              ip: clientInfo.ip,
              browser: clientInfo.browser,
              changes: {
                id: created.id,
                first_name: { new: mediatorEntry.first_name },
                last_name: { new: mediatorEntry.last_name },
                email: { new: mediatorEntry.email },
                phone: { new: mediatorEntry.phone },
                groups: { new: mediatorData.groupIDs || [] },
                sourceLanguages: { new: mediatorData.sourceLanguages || [] },
                targetLanguages: { new: mediatorData.targetLanguages || [] },
                status: { new: mediatorEntry.status },
                priority: { new: mediatorEntry.priority },
              },
              description: `Created new interpreter ${mediatorEntry.first_name} ${mediatorEntry.last_name}`,
            });

            return mediatorEntry;
          } else {
            throw new Error('Interpreter creation failed. No result returned.');
          }
        } else {
          throw new Error('Interpreter creation failed. No result returned.');
        }
      } catch (error: any) {
        console.error('Error creating interpreter:', error);
        throw new Error('Error: ' + error.message);
      }
    },

    updateMediator: async (
      _: any,
      { id, mediatorData }: { id: string; mediatorData: any },
      context: any,
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        // Fetch the existing interpreter details
        const mediators = await db
          .select()
          .from(interpreter)
          .where(eq(interpreter.id, id));
        const existingMediator = mediators[0];

        if (!existingMediator) {
          throw new UserInputError('Interpreter not found');
        }

        // Fetch existing sourceLanguages and targetLanguages IDs
        const existingSourceLanguages = await db
          .select({ id: interpreterSourceLanguages.source_language_id })
          .from(interpreterSourceLanguages)
          .where(eq(interpreterSourceLanguages.interpreter_id, id));
        const existingTargetLanguages = await db
          .select({ id: interpreterTargetLanguages.target_language_id })
          .from(interpreterTargetLanguages)
          .where(eq(interpreterTargetLanguages.interpreter_id, id));

        // Prepare the updated interpreter data
        const updatedData = {
          first_name: mediatorData.first_name || existingMediator.first_name,
          last_name: mediatorData.last_name || existingMediator.last_name,
          email: mediatorData.email || existingMediator.email,
          phone: mediatorData.phone || existingMediator.phone,
          iban:
            mediatorData.iban !== undefined
              ? mediatorData.iban
              : existingMediator.iban,
          status:
            mediatorData.status !== undefined
              ? mediatorData.status
              : existingMediator.status,
          monday_time_slots:
            mediatorData.monday_time_slots !== undefined
              ? mediatorData.monday_time_slots
              : existingMediator.monday_time_slots,
          tuesday_time_slots:
            mediatorData.tuesday_time_slots !== undefined
              ? mediatorData.tuesday_time_slots
              : existingMediator.tuesday_time_slots,
          wednesday_time_slots:
            mediatorData.wednesday_time_slots !== undefined
              ? mediatorData.wednesday_time_slots
              : existingMediator.wednesday_time_slots,
          thursday_time_slots:
            mediatorData.thursday_time_slots !== undefined
              ? mediatorData.thursday_time_slots
              : existingMediator.thursday_time_slots,
          friday_time_slots:
            mediatorData.friday_time_slots !== undefined
              ? mediatorData.friday_time_slots
              : existingMediator.friday_time_slots,
          saturday_time_slots:
            mediatorData.saturday_time_slots !== undefined
              ? mediatorData.saturday_time_slots
              : existingMediator.saturday_time_slots,
          sunday_time_slots:
            mediatorData.sunday_time_slots !== undefined
              ? mediatorData.sunday_time_slots
              : existingMediator.sunday_time_slots,
          availableForEmergencies:
            mediatorData.availableForEmergencies !== undefined
              ? mediatorData.availableForEmergencies
              : existingMediator.availableForEmergencies,
          availableOnHolidays:
            mediatorData.availableOnHolidays !== undefined
              ? mediatorData.availableOnHolidays
              : existingMediator.availableOnHolidays,
          priority:
            mediatorData.priority !== undefined
              ? mediatorData.priority
              : existingMediator.priority,
          updated_at: new Date(),
        };

        // Update interpreter details in the database
        await db
          .update(interpreter)
          .set(updatedData)
          .where(eq(interpreter.id, id));

        // Fetch the updated interpreter details
        const updatedMediators = await db
          .select()
          .from(interpreter)
          .where(eq(interpreter.id, id));
        const updatedMediator = updatedMediators[0];

        if (mediatorData.groupIDs && mediatorData.groupIDs.length > 0) {
          const groupIds = mediatorData.groupIDs;
          await db
            .delete(mediatorGroupRelation)
            .where(
              eq(mediatorGroupRelation.interpreter_id, updatedMediator.id),
            );
          let data = await db
            .insert(mediatorGroupRelation)
            .values(
              groupIds.map((groupId: string) => ({
                interpreter_id: updatedMediator.id,
                mediator_group_id: groupId,
                id: uuidv4(),
                updated_at: new Date(),
              })),
            )
            .returning();
          console.log('Interpreter associated with groups:', data);
        }
        await db
          .delete(interpreterSourceLanguages)
          .where(
            eq(interpreterSourceLanguages.interpreter_id, updatedMediator.id),
          );
        await db
          .delete(interpreterTargetLanguages)
          .where(
            eq(interpreterTargetLanguages.interpreter_id, updatedMediator.id),
          );

        const sourceLanguageData = mediatorData?.sourceLanguages || [];
        const targetLanguageData = mediatorData?.targetLanguages || [];
        console.log('Source Languages:', sourceLanguageData);
        const languagePairsSource = sourceLanguageData.map((id: any) => ({
          source_language_id: id,
          id: uuidv4(),
          interpreter_id: updatedMediator.id,
        }));
        const languagePairsTarget = targetLanguageData.map((id: any) => ({
          target_language_id: id,
          id: uuidv4(),
          interpreter_id: updatedMediator.id,
        }));
        console.log('Language Pairs Source:', languagePairsSource);
        if (languagePairsSource.length > 0) {
          await db
            .insert(interpreterSourceLanguages)
            .values(languagePairsSource);
        }
        if (languagePairsTarget.length > 0) {
          await db
            .insert(interpreterTargetLanguages)
            .values(languagePairsTarget);
        }

        if (updatedMediator) {
          // Log the update with specific field changes
          const clientInfo = getClientInfo(context);
          // Compare arrays for changes in sourceLanguages, targetLanguages, and groups
          function arrayChanged(oldArr: any[], newArr: any[]): boolean {
            if (!Array.isArray(oldArr) || !Array.isArray(newArr)) return false;
            if (oldArr.length !== newArr.length) return true;
            const oldSet = new Set(oldArr.map(String));
            const newSet = new Set(newArr.map(String));
            if (oldSet.size !== newSet.size) return true;
            for (const id of oldSet) {
              if (!newSet.has(id)) return true;
            }
            return false;
          }

          // Fetch previous group IDs for comparison if groupIDs provided
          let previousGroupIds: string[] | undefined = undefined;
          if (mediatorData.groupIDs) {
            const prevGroups = await db
              .select({ id: mediatorGroupRelation.mediator_group_id })
              .from(mediatorGroupRelation)
              .where(
                eq(mediatorGroupRelation.interpreter_id, updatedMediator.id),
              );
            previousGroupIds = prevGroups.map((g: any) => g.id);
          }

          const changes = {
            id: updatedMediator.id,
            first_name:
              existingMediator.first_name !== updatedMediator.first_name
                ? {
                    old: existingMediator.first_name,
                    new: updatedMediator.first_name,
                  }
                : undefined,
            last_name:
              existingMediator.last_name !== updatedMediator.last_name
                ? {
                    old: existingMediator.last_name,
                    new: updatedMediator.last_name,
                  }
                : undefined,
            email:
              existingMediator.email !== updatedMediator.email
                ? {
                    old: existingMediator.email,
                    new: updatedMediator.email,
                  }
                : undefined,
            phone:
              existingMediator.phone !== updatedMediator.phone
                ? {
                    old: existingMediator.phone,
                    new: updatedMediator.phone,
                  }
                : undefined,
            iban:
              existingMediator.iban !== updatedMediator.iban
                ? {
                    old: existingMediator.iban,
                    new: updatedMediator.iban,
                  }
                : undefined,
            status:
              existingMediator.status !== updatedMediator.status
                ? {
                    old: existingMediator.status,
                    new: updatedMediator.status,
                  }
                : undefined,
            priority:
              existingMediator.priority !== updatedMediator.priority
                ? {
                    old: existingMediator.priority,
                    new: updatedMediator.priority,
                  }
                : undefined,
            availableForEmergencies:
              existingMediator.availableForEmergencies !==
              updatedMediator.availableForEmergencies
                ? {
                    old: existingMediator.availableForEmergencies,
                    new: updatedMediator.availableForEmergencies,
                  }
                : undefined,
            availableOnHolidays:
              existingMediator.availableOnHolidays !==
              updatedMediator.availableOnHolidays
                ? {
                    old: existingMediator.availableOnHolidays,
                    new: updatedMediator.availableOnHolidays,
                  }
                : undefined,
            monday_time_slots:
              existingMediator.monday_time_slots !==
              updatedMediator.monday_time_slots
                ? {
                    old: existingMediator.monday_time_slots,
                    new: updatedMediator.monday_time_slots,
                  }
                : undefined,
            tuesday_time_slots:
              existingMediator.tuesday_time_slots !==
              updatedMediator.tuesday_time_slots
                ? {
                    old: existingMediator.tuesday_time_slots,
                    new: updatedMediator.tuesday_time_slots,
                  }
                : undefined,
            wednesday_time_slots:
              existingMediator.wednesday_time_slots !==
              updatedMediator.wednesday_time_slots
                ? {
                    old: existingMediator.wednesday_time_slots,
                    new: updatedMediator.wednesday_time_slots,
                  }
                : undefined,
            thursday_time_slots:
              existingMediator.thursday_time_slots !==
              updatedMediator.thursday_time_slots
                ? {
                    old: existingMediator.thursday_time_slots,
                    new: updatedMediator.thursday_time_slots,
                  }
                : undefined,
            friday_time_slots:
              existingMediator.friday_time_slots !==
              updatedMediator.friday_time_slots
                ? {
                    old: existingMediator.friday_time_slots,
                    new: updatedMediator.friday_time_slots,
                  }
                : undefined,
            saturday_time_slots:
              existingMediator.saturday_time_slots !==
              updatedMediator.saturday_time_slots
                ? {
                    old: existingMediator.saturday_time_slots,
                    new: updatedMediator.saturday_time_slots,
                  }
                : undefined,
            sunday_time_slots:
              existingMediator.sunday_time_slots !==
              updatedMediator.sunday_time_slots
                ? {
                    old: existingMediator.sunday_time_slots,
                    new: updatedMediator.sunday_time_slots,
                  }
                : undefined,
            sourceLanguages:
              mediatorData.sourceLanguages &&
              arrayChanged(
                existingSourceLanguages.map((l: any) => l.id),
                mediatorData.sourceLanguages,
              )
                ? {
                    old: existingSourceLanguages.map((l: any) => l.id),
                    new: mediatorData.sourceLanguages,
                  }
                : undefined,
            targetLanguages:
              mediatorData.targetLanguages &&
              arrayChanged(
                existingTargetLanguages.map((l: any) => l.id),
                mediatorData.targetLanguages,
              )
                ? {
                    old: existingTargetLanguages.map((l: any) => l.id),
                    new: mediatorData.targetLanguages,
                  }
                : undefined,
            groups:
              mediatorData.groupIDs &&
              previousGroupIds &&
              arrayChanged(previousGroupIds, mediatorData.groupIDs)
                ? {
                    old: previousGroupIds,
                    new: mediatorData.groupIDs,
                  }
                : undefined,
          };

          // Remove undefined fields
          (Object.keys(changes) as (keyof typeof changes)[]).forEach(
            (key) => changes[key] === undefined && delete changes[key],
          );

          await createSystemLog({
            action: 'UPDATE',
            client_id: context.user.id,
            phone_number_id: updatedMediator.phone_number_id,
            ip: clientInfo.ip,
            browser: clientInfo.browser,
            changes,
            description: `Updated interpreter ${updatedMediator.first_name} ${updatedMediator.last_name}`,
          });
          return updatedMediator;
        } else {
          throw new Error(
            'Interpreter update failed. No updated interpreter returned.',
          );
        }
      } catch (error: any) {
        console.error('Error updating interpreter:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },

    deleteMediator: async (_: any, { id }: { id: string }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        const mediators = await db
          .select()
          .from(interpreter)
          .where(
            and(
              eq(interpreter.id, id),
              eq(interpreter.client_id, context.user.id),
            ),
          );

        if (!mediators.length) {
          throw new UserInputError('Interpreter not found');
        }

        // Log the deletion
        const clientInfo = getClientInfo(context);
        await createSystemLog({
          action: 'DELETE',
          client_id: context.user.id,
          phone_number_id: mediators[0].phone_number_id,
          ip: clientInfo.ip,
          browser: clientInfo.browser,
          description: `Deleted interpreter ${mediators[0].first_name} ${mediators[0].last_name}`,
        });

        await db.delete(interpreter).where(eq(interpreter.id, id));
        return true;
      } catch (error: any) {
        console.error('Error deleting interpreter:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },

    updateMediatorStatus: async (
      _: any,
      { id, status }: { id: string; status: string },
      context: any,
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        // Fetch the existing interpreter details
        const mediators = await db
          .select()
          .from(interpreter)
          .where(eq(interpreter.id, id));
        const existingMediator = mediators[0];

        if (!existingMediator) {
          throw new UserInputError('Interpreter not found');
        }

        // Convert string status to boolean (assuming 'active'/'inactive' or similar)

        // Update the interpreter's status
        await db
          .update(interpreter)
          .set({ status })
          .where(eq(interpreter.id, id));

        // Fetch the updated interpreter details
        const updatedMediators = await db
          .select()
          .from(interpreter)
          .where(eq(interpreter.id, id));
        const updatedMediator = updatedMediators[0];

        if (updatedMediator) {
          // Log the status update
          const clientInfo = getClientInfo(context);
          await createSystemLog({
            action: 'UPDATE',
            client_id: context.user.id,
            phone_number_id: updatedMediator.phone_number_id,
            ip: clientInfo.ip,
            browser: clientInfo.browser,
            changes: {
              id: updatedMediator.id,
              status: { old: existingMediator.status, new: status },
            },
            description: `Updated interpreter ${updatedMediator.first_name} ${updatedMediator.last_name} status to ${status}`,
          });
          return updatedMediator;
        } else {
          throw new Error(
            'Interpreter status update failed. No updated interpreter returned.',
          );
        }
      } catch (error: any) {
        console.error('Error updating interpreter status:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },
    uploadMediatorFile: async (
      _: any,
      { file, phone_number_id }: { file: any; phone_number_id: string },
      context: any,
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }
      const languages = await db
        .select()
        .from(Languages)
        .where(
          and(
            eq(Languages.client_id, context.user.id),
            eq(Languages.phone_number_id, phone_number_id),
          ),
        );
      const targetLanguageList = await db
        .select()
        .from(LanguagesTarget)
        .where(
          and(
            eq(LanguagesTarget.client_id, context.user.id),
            eq(LanguagesTarget.phone_number_id, phone_number_id),
          ),
        );
      const groups = await db
        .select()
        .from(mediatorGroup)
        .where(
          and(
            eq(mediatorGroup.client_id, context.user.id),
            eq(mediatorGroup?.phone_number_id, phone_number_id),
          ),
        );
      if (!languages.length) {
        throw new UserInputError('No languages found for the user.');
      }
      if (!targetLanguageList.length) {
        throw new UserInputError('No target lang found for the user.');
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
        parsedSlots.sort(
          (a: { start: number }, b: { start: number }) => a.start - b.start,
        );

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
          // Validate required fields (first_name, last_name, phone)
          if (!row.first_name || !row.last_name || !row.phone) {
            throw new Error(
              `Row ${
                index + 1
              }: Missing required fields (first_name, last_name, phone)`,
            );
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
              const timeSlotArray = row[slot]
                .split(',')
                .map((slot: string) => slot.trim()); // Split and trim commas
              // eslint-disable-next-line no-shadow
              timeSlotArray.forEach((slot: string) => {
                if (!validateTimeSlot(slot)) {
                  throw new Error(
                    `Row ${
                      index + 1
                    }: Invalid time slot format for ${slot}. Must be in HH:MM-HH:MM format.`,
                  );
                }
              });
              if (checkOverlap(timeSlotArray)) {
                throw new Error(
                  `Row ${index + 1}: Overlapping time slots found for ${slot}.`,
                );
              }
            }
          });

          row.status = row.status || 'active';
          row.availableForEmergencies =
            String(row.availableForEmergencies).toLowerCase() === 'true';
          row.availableOnHolidays =
            String(row.availableOnHolidays).toLowerCase() === 'true';
          row.priority = row.priority || 1;

          transformedData.push(row);
        });

        return transformedData;
      }
      try {
        // Extract the file stream from the uploaded file
        const { createReadStream, mimetype } = await file;
        const stream = createReadStream();
        const saveMediatorsToDatabase = async (
          mediatorData: any[],
          client_id: string,
        ) => {
          const mediatorEntries = mediatorData.map((data) => ({
            id: uuidv4(),
            client_id: client_id,
            first_name: data.first_name,
            last_name: data.last_name,
            email: data.email,
            phone: data.phone,
            iban: data.iban || null,
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
            phone_number_id: phone_number_id,
            priority: data.priority || 1,
            created_at: new Date(),
            updated_at: new Date(),
          }));
          // Insert all mediators in a single transaction

          const groupRelationEntries = (
            await Promise.all(
              mediatorData.map(async (row: any) => {
                const groupsForMediator = String(row.groups).split(',') || [];

                return Promise.all(
                  groupsForMediator.map(async (group_name: string) => {
                    const interpreter = mediatorEntries.find(
                      (i: any) =>
                        i.first_name === row.first_name &&
                        i.last_name === row.last_name &&
                        i.phone === row.phone,
                    );

                    if (!interpreter) {
                      throw new Error(
                        `Interpreter with name ${row.first_name} ${row.last_name} not found.`,
                      );
                    }

                    let group: any = groups.find(
                      (g: any) =>
                        String(g.group_name).trim().toLocaleLowerCase() ===
                        String(group_name).trim().toLocaleLowerCase(),
                    );

                    if (!group) {
                      const newAddedGroup = {
                        id: uuidv4(),
                        client_id: context.user.id,
                        group_name: group_name,
                        created_at: new Date(),
                        updated_at: new Date(),
                        status: 'active',
                        phone_number_id: phone_number_id,
                      };
                      group = (
                        await db
                          .insert(mediatorGroup)
                          .values(newAddedGroup)
                          .returning()
                      )[0];
                    }

                    return {
                      id: uuidv4(),
                      interpreter_id: interpreter.id,
                      mediator_group_id: group.id,
                      created_at: new Date(),
                      updated_at: new Date(),
                    };
                  }),
                );
              }),
            )
          ).flat();

          const sourceLanguageData = mediatorData
            .map((row: any, idx: number) => {
              const sourceLanguages = String(row.sourceLanguages || '')
                .split(',')
                .map((s: string) => s.trim());
              const interpreter = mediatorEntries.find(
                (interpreter: any) =>
                  interpreter.first_name === row.first_name &&
                  interpreter.last_name === row.last_name &&
                  interpreter.phone === row.phone,
              );
              if (!interpreter) {
                throw new Error(
                  `Interpreter with name ${row.first_name} ${row.last_name} not found.`,
                );
              }

              return sourceLanguages.map((sourceLang: string, i: number) => {
                return {
                  id: uuidv4(),
                  interpreter_id: interpreter.id,
                  source_language_id: (() => {
                    const foundLang = languages.find(
                      (lang: any) =>
                        String(lang.language_name).toLocaleLowerCase() ===
                        String(sourceLang).toLocaleLowerCase(),
                    );
                    if (!foundLang) {
                      throw new Error(
                        `Source language "${sourceLang}" not found in row ${
                          idx + 1
                        }.`,
                      );
                    }
                    return foundLang.id;
                  })(),
                  created_at: new Date(),
                  updated_at: new Date(),
                };
              });
            })
            .flat();
          const targetLanguageData = mediatorData
            .map((row: any, idx: number) => {
              const targetLanguages = String(row.targetLanguages || '')
                .split(',')
                .map((s: string) => s.trim());
              const interpreter = mediatorEntries.find(
                (interpreter: any) =>
                  interpreter.first_name === row.first_name &&
                  interpreter.last_name === row.last_name &&
                  interpreter.phone === row.phone,
              );
              if (!interpreter) {
                throw new Error(
                  `Interpreter with name ${row.first_name} ${row.last_name} not found.`,
                );
              }
              return targetLanguages.map((targetLang: string, i: number) => {
                return {
                  id: uuidv4(),
                  interpreter_id: interpreter.id,
                  target_language_id: (() => {
                    const foundLang = targetLanguageList.find(
                      (lang: any) =>
                        String(lang.language_name).toLocaleLowerCase() ===
                        String(targetLang).toLocaleLowerCase(),
                    );
                    if (!foundLang) {
                      throw new Error(
                        `Target language "${targetLang}" not found in row ${
                          idx + 1
                        }.`,
                      );
                    }
                    return foundLang.id;
                  })(),
                  created_at: new Date(),
                  updated_at: new Date(),
                };
              });
            })
            .flat();
          const data = await db
            .insert(interpreter)
            .values(mediatorEntries)
            .returning();

          console.log({ data, groupRelationEntries });
          if (groupRelationEntries.length > 0) {
            const groupData = await db
              .insert(mediatorGroupRelation)
              .values(groupRelationEntries)
              .returning();
            console.log({ groupData });
          }
          console.log({ sourceLanguageData, targetLanguageData });
          if (sourceLanguageData.length > 0) {
            await db
              .insert(interpreterSourceLanguages)
              .values(sourceLanguageData)
              .returning();
          }
          if (targetLanguageData.length > 0) {
            await db
              .insert(interpreterTargetLanguages)
              .values(targetLanguageData)
              .returning();
          }
          return data;
        };

        let mediatorData: any[] = [];

        if (
          mimetype ===
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          mimetype === 'application/vnd.ms-excel'
        ) {
          // Parse Excel file
          const workbook = xlsx.read(await streamToBuffer(stream), {
            type: 'buffer',
          });
          const sheetNames = workbook.SheetNames;

          if (sheetNames.length === 0) {
            throw new UserInputError('No sheets found in the Excel file.');
          }

          // Assuming data is in the first sheet
          const sheet = workbook.Sheets[sheetNames[0]];
          const rows = xlsx.utils.sheet_to_json(sheet);
          console.log({ rows });
          // Validate columns in Excel file
          // parser.on('end', async () => {
          if (rows.length === 0) {
            throw new UserInputError(
              'No valid interpreter data found in the CSV file.',
            );
          }
          const result = validateAndTransformData(rows);

          const savedMediators = await saveMediatorsToDatabase(
            result,
            context.user.id,
          );

          // Log the bulk upload
          const clientInfo = getClientInfo(context);
          await createSystemLog({
            action: 'CREATE',
            client_id: context.user.id,
            phone_number_id,
            ip: clientInfo.ip,
            browser: clientInfo.browser,
            changes: {
              id: uuidv4(),
              uploadType: { new: 'excel' },
              interpreters: {
                new: savedMediators.map((m) => ({
                  id: m.id,
                  name: `${m.first_name} ${m.last_name}`,
                })),
              },
            },
            description: `Bulk uploaded ${savedMediators.length} interpreters via Excel file`,
          });

          return 'Interpreters uploaded successfully using excel file.';
          // });
        } else if (mimetype === 'text/csv') {
          // Parse CSV file
          const parser = csvParser();
          stream.pipe(parser);

          parser.on('data', (row: any) => {
            // Validate the row against the expected columns
            if (!row.first_name || !row.last_name || !row.phone) {
              throw new UserInputError(
                'Missing required columns in the CSV file.',
              );
            }
            // Add the row to the mediatorData array
            mediatorData.push({
              first_name: row.first_name,
              last_name: row.last_name,
              email: row.email || null,
              phone: row.phone,
              iban: row.iban || null,

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
          if (mediatorData.length === 0) {
            throw new UserInputError(
              'No valid interpreter data found in the CSV file.',
            );
          }

          const savedMediators = await saveMediatorsToDatabase(
            result,
            context.user.id,
          );

          // Log the bulk upload
          const clientInfo = getClientInfo(context);
          await createSystemLog({
            action: 'CREATE',
            client_id: context.user.id,
            phone_number_id,
            ip: clientInfo.ip,
            browser: clientInfo.browser,
            changes: {
              id: uuidv4(),
              uploadType: { new: 'csv' },
              interpreters: {
                new: savedMediators.map((m) => ({
                  id: m.id,
                  name: `${m.first_name} ${m.last_name}`,
                })),
              },
            },
            description: `Bulk uploaded ${savedMediators.length} interpreters via CSV file`,
          });

          return 'Interpreters uploaded successfully.';
        } else {
          throw new UserInputError(
            'Invalid file type. Only CSV and Excel files are allowed.',
          );
        }
      } catch (error: any) {
        console.error('Error uploading interpreter file:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },
  },
};

export default resolvers;
