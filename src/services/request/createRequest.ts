import { logger } from '../../config/logger';
import { twilioClient } from '../../config/twilio';
import { eq } from 'drizzle-orm';
import { CallReports, Languages, interpreter, } from '../../models';
import { db } from '../../config/postgres';
// import { getDepartmentName } from '../department/departmentExists';
import uuidv4 from '../../utils/uuidv4';
/**
 * Function to create a new entry in the CallReports.
 * @param values - An object containing key-value pairs to populate the table.
 * @returns The created entry.
 */
const calculatePrice = (minutes: number,) => {
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
        const language_code = values?.language_code
        const callDetails = await twilioClient.calls(callSID).fetch();
        const languageRecord = await db.select({
            language_code: Languages.language_code,
            language_name: Languages.language_name,

        }).from(Languages).where(eq(Languages.language_code, language_code)).limit(1);
        logger.info(`departmentCode: ${departmentCode}`)
        // const departmentName = getDepartmentName({ departmentCode: departmentCode });
        // const userByDepartment = await db.select().from(Users).where(
        //     eq(Users.first_name, departmentName)
        // ).limit(1);
        if (Number(callDetails?.duration) < 60) {
            logger.info('Call duration is less than 60 seconds, skipping request creation');
            return;
        }
        if (callDetails?.toFormatted === "+393513424163") {
            logger.info('Call to fallback phone number, skipping request creation');
            return;
        }
        const mediatorResult = await db.select().from(interpreter).where(
            eq(interpreter.phone, callDetails?.toFormatted)
        ).limit(1);
        let obj = {
            "expectedDuration": callDetails?.duration
                ? String(Math.ceil(Math.max(Number(callDetails.duration), 60) / 60))
                : "0",
            "targetLanguage": languageRecord[0]?.language_name,
            "amount": String(calculatePrice(Math.ceil(Math.max(Number(callDetails.duration), 60) / 60))),
        }
        const newBooking = {
            id: uuidv4(),
            mediator_id: mediatorResult[0].id,
            status: "Completed",
            call_date: new Date(callDetails?.startTime),
            minutes: String(obj?.expectedDuration ?? 0),
            amount: String(obj?.amount ?? 0),
            additionalMinutes: String(0),
            language: obj?.targetLanguage,
        };

        // let result = await db.insert(CallReports).values(newBooking).returning();


        // return result[0];
        return []
    } catch (error) {
        logger.error('Error creating request:', error);
    }
}


