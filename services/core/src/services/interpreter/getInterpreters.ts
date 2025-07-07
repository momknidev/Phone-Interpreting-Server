import { toZonedTime } from 'date-fns-tz';
import { and, eq, or } from 'drizzle-orm';
import { mediator, Languages } from '../../models';
import { db } from '../../config/postgres';
import { weekDayTimeSlot } from '../../const/interpreter/weekDayTimeSlot';

interface IArgs {
    priority: number,
    languageCode: number,
}

export const getInterpreters = async ({
    priority,
    languageCode,
}: IArgs) => {
    // Fetch the language from the database
    const languageRecord = await db.select({
        languageName: Languages.id,
        language: Languages.language_code,
        languageCode: Languages.language_name,

    }).from(Languages).where(eq(Languages.language_code, languageCode)).limit(1);
    if (languageRecord.length === 0) {
        throw new Error('Language not found');
    }
    const languageToUse = languageRecord[0].languageName;
    const languageSelection = [
        eq(mediator.targetLanguage1, languageToUse),
        eq(mediator.targetLanguage2, languageToUse),
        eq(mediator.targetLanguage3, languageToUse),
        eq(mediator.targetLanguage4, languageToUse),
    ]
    const dateNow = toZonedTime(new Date(), 'Europe/Rome');
    const currentWeekDay = dateNow.getDay();
    const timeSlotToUse = weekDayTimeSlot[currentWeekDay];

    const interpreters = await db.select({
        id: mediator.id,
        email: mediator.email,
        firstName: mediator.firstName,
        lastName: mediator.lastName,
        phone: mediator.phone,
        priority: mediator.priority,
        timeSlot: mediator[timeSlotToUse],
    }).from(mediator).where(
        and(
            eq(mediator.priority, String(priority)),
            or(...languageSelection),
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
