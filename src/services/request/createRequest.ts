import { logger } from '../../config/logger';
import { twilioClient } from '../../config/twilio';
import { eq } from 'drizzle-orm';
import { RequestTable, Languages, mediator, } from '../../models';
import { db } from '../../config/postgres';
// import { getDepartmentName } from '../department/departmentExists';
import uuidv4 from '../../utils/uuidv4';
/**
 * Function to create a new entry in the RequestTable.
 * @param values - An object containing key-value pairs to populate the table.
 * @returns The created entry.
 */
const calculatePrice = (minutes: number, additionalTime: number = 0) => {
    const hourlyRate = 15;
    let totalPrice = 0;

    if (minutes <= 60) {
        if (minutes <= 30) {
            totalPrice = hourlyRate / 2;
        } else {
            totalPrice = hourlyRate;
        }
    } else {
        const perMinuteRate = hourlyRate / 60;
        totalPrice = minutes * perMinuteRate;
    }
    const additionalTimePrice = additionalTime > 0 ? (additionalTime / 60) * hourlyRate : 0;
    totalPrice += additionalTimePrice;
    return parseFloat(totalPrice.toFixed(2));
};

export async function createRequest(values: any) {
    try {

        if (values.EndConferenceOnExit === 'true' || values.EndConferenceOnExit === true) {
            logger.info('EndConferenceOnExit is true, skipping request creation');
            return;
        }
        // const FriendlyName = values?.request?.FriendlyName;
        let callSID = values?.originCallId;
        const departmentCode = values.departmentCode
        const languageCode = values?.languageCode
        const callDetails = await twilioClient.calls(callSID).fetch();
        // const callFrom = await twilioClient.calls(FriendlyName).fetch();
        const languageRecord = await db.select({
            languageCode: Languages.language_code,
            languageName: Languages.language_name,

        }).from(Languages).where(eq(Languages.language_code, languageCode)).limit(1);
        logger.info(`departmentCode: ${departmentCode}`)
        // const departmentName = getDepartmentName({ departmentCode: departmentCode });
        // const userByDepartment = await db.select().from(Users).where(
        //     eq(Users.firstName, departmentName)
        // ).limit(1);
        if (Number(callDetails?.duration) < 60) {
            logger.info('Call duration is less than 60 seconds, skipping request creation');
            return;
        }
        if (callDetails?.toFormatted === "+393513424163") {
            logger.info('Call to fallback phone number, skipping request creation');
            return;
        }
        const mediatorResult = await db.select().from(mediator).where(
            eq(mediator.phone, callDetails?.toFormatted)
        ).limit(1);
        let obj = {
            "expectedDuration": callDetails?.duration
                ? String(Math.ceil(Math.max(Number(callDetails.duration), 60) / 60))
                : "0",
            "targetLanguage": languageRecord[0]?.languageName,
            "amount": String(calculatePrice(Math.ceil(Math.max(Number(callDetails.duration), 60) / 60))),
        }
        const newBooking = {
            id: uuidv4(),
            mediatorId: mediatorResult[0].id,
            mediationType: 'Urgente',
            status: "Completato",
            deliveryDate: new Date(callDetails?.startTime),
            minutes: String(obj?.expectedDuration ?? 0),
            amount: String(obj?.amount ?? 0),
            additionalMinutes: String(0),
            notes: '',
            language: obj?.targetLanguage,
            "dateOfRequestCompletion": new Date(),
        };

        let result = await db.insert(RequestTable).values(newBooking).returning();


        return result[0];
    } catch (error) {
        logger.error('Error creating request:', error);
    }
}


