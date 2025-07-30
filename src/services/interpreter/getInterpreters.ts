import { toZonedTime } from 'date-fns-tz';
import { and, eq, or } from 'drizzle-orm';
import { interpreter, Languages } from '../../models';
import { db } from '../../config/postgres';
import { weekDayTimeSlot } from '../../const/interpreter/weekDayTimeSlot';

interface IArgs {
    priority: number,
    language_code: number,
}

export const getInterpreters = async ({
    priority,
    language_code,
}: IArgs) => {
    // Fetch the language from the database
    const languageRecord = await db.select({
        language_name: Languages.id,
        language: Languages.language_code,
        language_code: Languages.language_name,

    }).from(Languages).where(eq(Languages.language_code, language_code)).limit(1);
    if (languageRecord.length === 0) {
        throw new Error('Language not found');
    }
    const languageToUse = languageRecord[0].language_name;
    const languageSelection = [
        // eq(interpreter.targetLanguage1, languageToUse),
        // eq(interpreter.targetLanguage2, languageToUse),
        // eq(interpreter.targetLanguage3, languageToUse),
        // eq(interpreter.targetLanguage4, languageToUse),
    ]
    const dateNow = toZonedTime(new Date(), 'Europe/Rome');
    const currentWeekDay = dateNow.getDay();
    const timeSlotToUse = weekDayTimeSlot[currentWeekDay];

    const interpreters = await db.select({
        id: interpreter.id,
        email: interpreter.email,
        first_name: interpreter.first_name,
        last_name: interpreter.last_name,
        phone: interpreter.phone,
        priority: interpreter.priority,
        timeSlot: interpreter[timeSlotToUse],
    }).from(interpreter).where(
        and(
            eq(interpreter.priority, String(priority)),
            // or(...languageSelection),
        ),
    );
    const filteredInterpreters = interpreters.filter((interpreter) => {
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
