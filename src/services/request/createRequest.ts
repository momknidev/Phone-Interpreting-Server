import { logger } from '../../config/logger';
import { twilioClient } from '../../config/twilio';
import { and, eq } from 'drizzle-orm';
import { CallReports, Languages, interpreter } from '../../models';
import { db } from '../../config/postgres';
import uuidv4 from '../../utils/uuidv4';
const calculatePrice = (minutes: number) => {
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
  logger.info(`Creating request with values: ${JSON.stringify(values)}`);
  try {
    const newBooking = {
      id: values?.id,
      call_date: new Date(),
      amount: String(0),
      client_id: values.client_id,
      phone_number: values.phone_number,
      caller_phone: values.caller_phone,
      status: 'Cancelled' as 'Cancelled',
    };
    const result = await db.insert(CallReports).values(newBooking).returning();
    return result;
  } catch (error) {
    logger.error('Error creating request:', error);
  }
}

export async function updateRequest(
  id: string,
  data: Partial<typeof CallReports.$inferInsert>,
) {
  logger.info(
    `Updating request with ID: ${id} and data: ${JSON.stringify(data)}`,
  );
  try {
    const result = await db
      .update(CallReports)
      .set(data)
      .where(eq(CallReports.id, id))
      .returning();
    return result[0];
  } catch (error) {
    logger.error('Error updating request:', error);
    return null;
  }
}

export async function updateRequestInformation(id: string, data: any) {
  logger.info(
    `Updating request information with ID: ${id} and data: ${JSON.stringify(
      data,
    )}`,
  );
  try {
    if (
      data.EndConferenceOnExit === 'true' ||
      data.EndConferenceOnExit === true
    ) {
      logger.info('EndConferenceOnExit is true, skipping request creation');
      return;
    }
    // const FriendlyName = values?.request?.FriendlyName;
    let callSID = data?.originCallId;
    const callDetails = await twilioClient.calls(callSID).fetch();

    if (callDetails?.toFormatted === '+393513424163') {
      logger.info('Call to fallback phone number, skipping request creation');
      return;
    }
    logger.info(`Call details: ${JSON.stringify(callDetails, null, 1)}`);
    const interpreterResult = await db
      .select()
      .from(interpreter)
      .where(
        and(
          eq(interpreter.phone_number, data?.phone_number),
          eq(interpreter.phone, callDetails?.toFormatted),
        ),
      )
      .limit(1);
    if (interpreterResult.length === 0) {
      logger.info('No interpreter found for the given phone number');
      return;
    }
    logger.info(`Interpreter found: ${JSON.stringify(interpreterResult[0])}`);
    let obj = {
      expectedDuration: callDetails?.duration
        ? String(Math.ceil(Math.max(Number(callDetails.duration), 60) / 60))
        : '0',
      amount: String(
        calculatePrice(
          Math.ceil(Math.max(Number(callDetails.duration), 60) / 60),
        ),
      ),
    };
    const newBooking = {
      interpreter_id: interpreterResult[0].id,
      status: 'Completed' as 'Completed',
      call_date: new Date(callDetails?.startTime),
      call_duration: String(obj?.expectedDuration ?? 0),
      amount: String(obj?.amount ?? 0),
    };
    const result = await db
      .update(CallReports)
      .set(newBooking)
      .where(eq(CallReports.id, id))
      .returning();
    return result[0];
  } catch (error) {
    logger.error('Error creating request:', error);
  }
}
