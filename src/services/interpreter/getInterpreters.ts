import { toZonedTime } from 'date-fns-tz';
import { and, eq, exists } from 'drizzle-orm';
import {
  interpreter,
  interpreterSourceLanguages,
  interpreterTargetLanguages,
  Languages,
  LanguagesTarget,
} from '../../models';
import { db } from '../../config/postgres';
import { weekDayTimeSlot } from '../../const/interpreter/weekDayTimeSlot';
import { logger } from '../../config/logger';

interface IArgs {
  priority: number;
  phone_number: string;
  source_language_id: string;
  target_language_id: string;
}

export const getInterpreters = async ({
  priority,
  phone_number,
  source_language_id,
  target_language_id,
}: IArgs) => {
  logger.info(
    `getInterpreters called with priority: ${priority}, phone_number: ${phone_number}, source_language_id: ${source_language_id}, target_language_id: ${target_language_id}`,
  );
  if (!source_language_id || !target_language_id) {
    throw new Error('Source and target language codes are required');
  }
  const dateNow = toZonedTime(new Date(), 'Europe/Rome');
  const currentWeekDay = dateNow.getDay();
  const timeSlotToUse = weekDayTimeSlot[currentWeekDay];
  logger.info(
    JSON.stringify(
      {
        message: 'getInterpreters called',
        priority,
        phone_number,
        source_language_id,
        target_language_id,
        timeSlotToUse,
      },
      null,
      2,
    ),
  );
  const interpreters = await db
    .select({
      id: interpreter.id,
      email: interpreter.email,
      first_name: interpreter.first_name,
      last_name: interpreter.last_name,
      phone: interpreter.phone,
      priority: interpreter.priority,
      timeSlot: interpreter[timeSlotToUse],
    })
    .from(interpreter)
    .where(
      and(
        eq(interpreter.phone_number, phone_number),
        eq(interpreter.priority, String(priority)),
        exists(
          db
            .select({
              id: Languages.id,
            })
            .from(interpreterSourceLanguages)
            .innerJoin(
              Languages,
              eq(Languages.id, interpreterSourceLanguages.source_language_id),
            )
            .where(
              and(
                eq(interpreterSourceLanguages.interpreter_id, interpreter.id),
                eq(Languages.id, source_language_id),
              ),
            ),
        ),
        exists(
          db
            .select({
              id: LanguagesTarget.id,
            })
            .from(interpreterTargetLanguages)
            .innerJoin(
              LanguagesTarget,
              eq(
                LanguagesTarget.id,
                interpreterTargetLanguages.target_language_id,
              ),
            )
            .where(
              and(
                eq(interpreterTargetLanguages.interpreter_id, interpreter.id),
                eq(LanguagesTarget.id, target_language_id),
              ),
            ),
        ),
      ),
    );
  console.log(
    'Interpreters after query',
    JSON.stringify(interpreters, null, 1),
  );

  const filteredInterpreters = interpreters.filter((interpreter: any) => {
    const { timeSlot } = interpreter;

    if (!timeSlot) {
      return false;
    }

    const timeSlots = timeSlot?.split('-');

    const slotStart = toZonedTime(new Date(), 'Europe/Rome');
    const startHours = Number(timeSlots[0].split(':')[0]);
    const startMinutes = Number(timeSlots[0].split(':')[1]);
    slotStart.setHours(startHours, startMinutes);

    const slotEnd = toZonedTime(new Date(), 'Europe/Rome');
    const endHours = Number(timeSlots[1].split(':')[0]);
    const endMinutes = Number(timeSlots[1].split(':')[1]);
    slotEnd.setHours(endHours, endMinutes);

    return dateNow >= slotStart && dateNow <= slotEnd;
  });

  return filteredInterpreters;
};
