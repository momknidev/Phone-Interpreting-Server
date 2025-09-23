import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';
import { getCode } from '../../../services/department/departmentExists';
import { getInterpreters } from '../../../services/interpreter/getInterpreters';
import {
  getSourceLanguageByNumber,
  getSourceLanguage,
  getTargetLanguageByNumber,
  getTargetLanguage,
} from '../../../services/language/getLanguage';
import { convertMiddlewareToAsync } from '../../../utils/rest/middlewares/convertMiddlewareToAsync';
import { TWILIO_WEBHOOK } from '../../../const/http/ApiUrl';
import { twilioClient } from '../../../config/twilio';
import { redisClient } from '../../../config/redis';
import { logger } from '../../../config/logger';
import {
  createRequest,
  updateRequest,
  updateRequestInformation,
} from '../../../services/request/createRequest';
import { db } from '../../../config/postgres';
import {
  CallReports,
  callRoutingSettings,
  Client,
  clientPhones,
  interpreter,
} from '../../../models';
import { eq } from 'drizzle-orm';
import uuidv4 from '../../../utils/uuidv4';
import mailer from '@sendgrid/mail';
import { emailHeader, emailFooter } from '../../../mail_templates';
import {
  creditLimitClientNotification,
  creditLimitInterpreterNotification,
} from '../../../mail_templates/creditLimitNotification';

// Helper function to clean up all Redis data for a call
async function cleanupCallRedisData(originCallId: string) {
  try {
    // Get all retry keys for cleanup
    const settings = JSON.parse(
      (await redisClient.get(`${originCallId}:settings`)) || '{}',
    );

    // Clean up all possible keys for this call
    const keysToDelete = [
      `${originCallId}:settings`,
      `${originCallId}:uuid`,
      `${originCallId}:phone_number`,
      `${originCallId}:phone_number_id`,
      `${originCallId}:caller_phone`,
      `${originCallId}:client_id`,
      `${originCallId}:clientCode`,
      `${originCallId}:credits`,
      `${originCallId}:sourceLanguage`,
      `${originCallId}:targetLanguage`,
      `${originCallId}:callType`,
      `${originCallId}:thirdPartyNumber`,
      `${originCallId}:queue`,
      `${originCallId}:currentPriority`,
      `${originCallId}:currentCall`,
      `${originCallId}:callStartTime`,
      originCallId, // Main list of interpreter calls
    ];

    // Clean up retry counters for all priorities (1-5)
    for (let priority = 1; priority <= 5; priority++) {
      keysToDelete.push(`${originCallId}:retry:${priority}`);
    }

    // Delete all keys at once
    await Promise.all(keysToDelete.map((key) => redisClient.del(key)));

    logger.info(`Cleaned up Redis data for call ${originCallId}`);
  } catch (error) {
    logger.error(`Failed to cleanup Redis data for ${originCallId}: ${error}`);
  }
}

// Helper to save/update call history in DB
async function saveCallStep(id: string, data: any) {
  const existing = await db
    .select()
    .from(CallReports)
    .where(eq(CallReports.id, id))
    .limit(1);
  // logger.info(`saveCallStep: ${existing.length}`);
  // logger.info(`saveCallStep: ${id} ${data}`);
  if (existing.length === 0) {
    await createRequest({ id, ...data });
  } else {
    await updateRequest(id, data);
  }
}
const saveCallStepAsync = (id: string, data: any) => {
  // logger.info(`Background saveCallStep: ${id} ${data}`);
  setImmediate(async () => {
    try {
      await saveCallStep(id, data);
    } catch (error) {
      logger.error(`Background saveCallStep failed: ${error}`);
    }
  });
};

const removeAndCallNewTargets = async ({
  originCallId,
  targetCallId,
  sourceLanguageID,
  targetLanguageID,
  priority,
  fallbackCalled,
  phone_number_id,
}: {
  originCallId: string;
  targetCallId: string;
  sourceLanguageID: string;
  targetLanguageID: string;
  priority: number;
  fallbackCalled: boolean;
  phone_number_id: string;
}) => {
  // logger.info(
  //   `Handling call status for targetCallId: ${targetCallId}, originCallId: ${originCallId} /removeAndCallNewTargets`,
  // );
  const originCall = await twilioClient.calls(originCallId).fetch();
  const credits = await redisClient.get(`${originCallId}:credits`);
  // logger.info(`Origin call status: ${originCall.status}`);

  if (
    originCall.status === 'completed' ||
    originCall.status === 'canceled' ||
    originCall.status === 'busy' ||
    originCall.status === 'failed' ||
    originCall.status === 'no-answer'
  ) {
    await twilioClient.calls(targetCallId).update({
      status: 'completed',
    });
    return;
  }

  // If we were already using fallback, go to noAnswer
  if (fallbackCalled) {
    // logger.info(`Fallback number failed for ${originCallId}, calling noAnswer`);

    // Calculate response time before calling noAnswer
    const callStartTime = await redisClient.get(
      `${originCallId}:callStartTime`,
    );
    if (callStartTime) {
      const responseTimeMs = Date.now() - Number(callStartTime);
      const responseTimeSeconds = Math.round(responseTimeMs / 1000);

      logger.info(
        `Fallback failed for ${originCallId} with response time: ${responseTimeSeconds} seconds`,
      );

      // Save response time to database
      const uuid = await redisClient.get(`${originCallId}:uuid`);
      saveCallStepAsync(uuid || '', {
        response_time: responseTimeSeconds,
        status: 'No Answer',
      });
    }

    await twilioClient.calls(originCallId).update({
      url: `${TWILIO_WEBHOOK}/noAnswer?originCallId=${originCallId}`,
      method: 'POST',
    });
    return;
  }

  await redisClient.lRem(originCallId, 0, targetCallId);
  const isAllNumbersUnavailable = !(await redisClient.exists(originCallId));

  if (!isAllNumbersUnavailable) {
    return;
  }

  const settings = JSON.parse(
    (await redisClient.get(`${originCallId}:settings`)) || '{}',
  );
  const retryAttempts = Number(settings?.retryAttempts || 0);

  // Get current retry count for this priority
  const retryKey = `${originCallId}:retry:${priority}`;
  const currentRetries = Number((await redisClient.get(retryKey)) || 0);

  // logger.info(
  //   `Current retries for priority ${priority}: ${currentRetries}/${retryAttempts} for ${originCallId}`,
  // );

  // If retry attempts > 0 and we haven't exhausted retries for this priority
  if (retryAttempts > 0 && currentRetries < retryAttempts) {
    // Increment retry counter and try again with same priority
    await redisClient.set(retryKey, currentRetries + 1);
    // logger.info(
    //   `Retrying priority ${priority} for ${originCallId}, attempt ${
    //     currentRetries + 1
    //   }/${retryAttempts}`,
    // );

    const interpreters = await getInterpreters({
      phone_number_id: phone_number_id,
      priority: Number(priority),
      source_language_id: sourceLanguageID,
      target_language_id: targetLanguageID,
    });

    if (interpreters.length > 0) {
      // logger.info(
      //   `Found ${interpreters.length} interpreters for retry attempt ${
      //     currentRetries + 1
      //   }`,
      // );

      const createdCalls = await Promise.all(
        interpreters.map(({ phone }: { phone: any }) =>
          twilioClient.calls.create({
            url:
              `${TWILIO_WEBHOOK}/machineDetectionResult?originCallId=${originCallId}` +
              `&sourceLanguageID=${sourceLanguageID}&targetLanguageID=${targetLanguageID}&priority=${priority}&fallbackCalled=${fallbackCalled}`,
            to: phone,
            from: '+39800940366',
            machineDetection: 'Enable',
            machineDetectionTimeout: 10,
            timeLimit: Math.min(
              Math.max(Number(credits) * 60 || 3600, 60),
              3600,
            ),
            statusCallback:
              `${TWILIO_WEBHOOK}/callStatusResult?originCallId=${originCallId}` +
              `&sourceLanguageID=${sourceLanguageID}&targetLanguageID=${targetLanguageID}&priority=${priority}&fallbackCalled=${fallbackCalled}`,
            statusCallbackMethod: 'POST',
            timeout: 20,
          }),
        ),
      );

      await Promise.all(
        createdCalls.map(({ sid }) => redisClient.lPush(originCallId, sid)),
      );
      return;
    } else {
      // logger.info(
      //   `No interpreters found for retry attempt ${
      //     currentRetries + 1
      //   }, moving to next priority`,
      // );
    }
  } else if (retryAttempts > 0) {
    // logger.info(
    //   `Exhausted ${retryAttempts} retry attempts for priority ${priority}, moving to next priority`,
    // );
  } else {
    // logger.info(
    //   `Retry attempts is 0 for ${originCallId}, skipping retry for priority ${priority}`,
    // );
  }

  let interpreters: any = [];
  let currentPriority = priority + 1; // Start from next priority
  let currentFallbackCalled: boolean = fallbackCalled;

  // Continue checking higher priorities (only if we haven't reached priority 5 yet)
  while (currentPriority <= 5 && interpreters.length === 0) {
    // logger.info(`Checking priority ${currentPriority} for ${originCallId}`);
    interpreters = await getInterpreters({
      phone_number_id: phone_number_id,
      priority: Number(currentPriority),
      source_language_id: sourceLanguageID,
      target_language_id: targetLanguageID,
    });

    if (interpreters.length > 0) {
      // logger.info(
      //   `Found ${interpreters.length} interpreters at priority ${currentPriority}`,
      // );
      break;
    }
    currentPriority++;
  }

  // After checking all priorities (1-5), try fallback if enabled
  if (interpreters.length === 0 && currentPriority > 5) {
    const fallbackEnabled = Boolean(settings?.enableFallback);
    const fallbackNumber = settings?.fallbackNumber;

    if (fallbackEnabled && fallbackNumber && !currentFallbackCalled) {
      currentFallbackCalled = true;
      interpreters = [{ phone: fallbackNumber }];
      // logger.info(
      //   `No interpreters found in priorities 1-5, trying fallback number: ${fallbackNumber}`,
      // );
    } else {
      // No interpreters and no fallback available, call noAnswer
      // logger.info(
      //   `No interpreters or fallback available for ${originCallId}, calling noAnswer`,
      // );

      // Calculate response time before calling noAnswer
      const callStartTime = await redisClient.get(
        `${originCallId}:callStartTime`,
      );
      if (callStartTime) {
        const responseTimeMs = Date.now() - Number(callStartTime);
        const responseTimeSeconds = Math.round(responseTimeMs / 1000);

        logger.info(
          `No interpreters or fallback available for ${originCallId} with response time: ${responseTimeSeconds} seconds`,
        );

        // Save response time to database
        const uuid = await redisClient.get(`${originCallId}:uuid`);
        saveCallStepAsync(uuid || '', {
          response_time: responseTimeSeconds,
          status: 'No Answer',
        });
      }

      await twilioClient.calls(originCallId).update({
        url: `${TWILIO_WEBHOOK}/noAnswer?originCallId=${originCallId}`,
        method: 'POST',
      });
      return;
    }
  }

  // If we still have no interpreters, call noAnswer
  if (interpreters.length === 0) {
    // logger.info(
    //   `No interpreters available for ${originCallId}, calling noAnswer`,
    // );

    // Calculate response time before calling noAnswer
    const callStartTime = await redisClient.get(
      `${originCallId}:callStartTime`,
    );
    if (callStartTime) {
      const responseTimeMs = Date.now() - Number(callStartTime);
      const responseTimeSeconds = Math.round(responseTimeMs / 1000);

      logger.info(
        `No interpreters available for ${originCallId} with response time: ${responseTimeSeconds} seconds`,
      );

      // Save response time to database
      const uuid = await redisClient.get(`${originCallId}:uuid`);
      saveCallStepAsync(uuid || '', {
        response_time: responseTimeSeconds,
        status: 'No Answer',
      });
    }

    await twilioClient.calls(originCallId).update({
      url: `${TWILIO_WEBHOOK}/noAnswer?originCallId=${originCallId}`,
      method: 'POST',
    });
    return;
  }
  logger.info(
    `${typeof Math.min(
      Math.max(Number(credits) * 60 || 3600, 60),
      3600,
    )} seconds: ${Math.min(
      Math.max(Number(credits) * 60 || 3600, 60),
      3600,
    )} seconds`,
  );
  const createdCalls = await Promise.all(
    interpreters.map(({ phone }: { phone: any }) =>
      twilioClient.calls.create({
        url:
          `${TWILIO_WEBHOOK}/machineDetectionResult?originCallId=${originCallId}` +
          `&sourceLanguageID=${sourceLanguageID}&targetLanguageID=${targetLanguageID}&priority=${currentPriority}&fallbackCalled=${currentFallbackCalled}`,
        to: phone,
        from: '+39800940366',
        machineDetection: 'Enable',
        machineDetectionTimeout: 10,
        timeLimit: Math.min(Number(credits) ? Number(credits) * 60 : 0, 3600),
        statusCallback:
          `${TWILIO_WEBHOOK}/callStatusResult?originCallId=${originCallId}` +
          `&sourceLanguageID=${sourceLanguageID}&targetLanguageID=${targetLanguageID}&priority=${currentPriority}&fallbackCalled=${currentFallbackCalled}`,
        statusCallbackMethod: 'POST',
        timeout: 20,
      }),
    ),
  );

  await Promise.all(
    createdCalls.map(({ sid }) => redisClient.lPush(originCallId, sid)),
  );
};

// Entry point: handle incoming call, save settings, redirect to requestCode
export const call = convertMiddlewareToAsync(async (req, res) => {
  const twiml = new VoiceResponse();
  const {
    To: calledNumber,
    From: callerNumber,
    CallSid: originCallId,
  } = req.body;
  let phoneNumber = await db
    .select()
    .from(clientPhones)
    .where(eq(clientPhones.phone, calledNumber));
  if (phoneNumber.length === 0) {
    logger.warn(
      `Incoming call to unrecognized number: ${calledNumber}, From: ${callerNumber}, CallSid: ${originCallId}`,
    );
    twiml.say({ language: 'en-GB' }, 'Incorrect phone Nume');
  }
  // Try without country code (assuming country code is +XX and number length > 10)
  // logger.info(
  //   `Incoming call details: To=${calledNumber}, From=${callerNumber}, CallSid=${originCallId}`,
  // );
  let phone_number_id = phoneNumber[0].id;
  await redisClient.set(`${originCallId}:phone_number_id`, phone_number_id);
  try {
    const routeSettings = await db
      .select()
      .from(callRoutingSettings)
      .where(eq(callRoutingSettings.phone_number_id, phone_number_id))
      .limit(1);
    if (routeSettings.length === 0) {
      twiml.say(
        { language: 'en-GB' },
        'Hello Welcome to Phone mediation. Please update your settings.',
      );
      res.type('text/xml').send(twiml.toString());
      twiml.hangup();
      return;
    }
    if (
      routeSettings[0].welcomeMessageMode === 'audio' &&
      routeSettings[0]?.welcomeMessageFile
    ) {
      twiml.play(routeSettings[0].welcomeMessageFile);
    } else {
      twiml.say(
        { language: (routeSettings[0]?.language || 'en-GB') as any },
        routeSettings[0]?.welcomeMessageText || 'Welcome to Phone mediation.',
      );
    }
    const settings = routeSettings[0];

    let uuid = uuidv4();
    await Promise.all([
      redisClient.set(`${originCallId}:settings`, JSON.stringify(settings)),
      redisClient.set(`${originCallId}:uuid`, uuid),
      redisClient.set(`${originCallId}:phone_number`, calledNumber),
      redisClient.set(`${originCallId}:caller_phone`, callerNumber),
      redisClient.set(`${originCallId}:client_id`, settings.client_id),
    ]);
    saveCallStepAsync(uuid, {
      caller_phone: callerNumber,
      called_phone: calledNumber,
      phone_number_id: phone_number_id,
      client_id: settings.client_id,
    });

    twiml.redirect(`./requestCode?originCallId=${originCallId}`);
    res.type('text/xml').send(twiml.toString());
  } catch (error) {
    // logger.error(`Error fetching call route settings: ${error}`);
    twiml.say(
      { language: 'en-GB' },
      'Welcome to Phone mediation. Please update your settings and try again later.',
    );
    res.type('text/xml').send(twiml.toString());
  }
});

// Request code if enabled, validate code, loop until matched
export const requestCode = convertMiddlewareToAsync(async (req, res) => {
  const twiml = new VoiceResponse();
  const originCallId = req.query.originCallId as string;
  const settings = JSON.parse(
    (await redisClient.get(`${originCallId}:settings`)) || '{}',
  );
  // logger.info(`settings: ${JSON.stringify(settings)}`);
  const retriesAmount = Number(req.query.retriesAmount ?? 0);
  const errorsAmount = Number(req.query.errorsAmount ?? 0);
  // logger.info(`requesting code /requestCode `);

  if (!settings.enable_code) {
    // Check if call type selection is enabled
    if (settings.enableCallType) {
      twiml.redirect(`./requestCallType?originCallId=${originCallId}`);
    } else {
      // Use default call type
      const defaultCallType = settings.defaultCallType || '2';
      await redisClient.set(`${originCallId}:callType`, defaultCallType);

      if (defaultCallType === '1') {
        // Three-way call - check third party number settings
        twiml.redirect(`./handleThirdPartyNumber?originCallId=${originCallId}`);
      } else {
        // Interpreter only call - proceed to language selection
        twiml.redirect(`./requestSourceLanguage?originCallId=${originCallId}`);
      }
    }
    res.type('text/xml').send(twiml.toString());
    return;
  }

  // Check if maximum attempts exceeded BEFORE setting up gather
  const maxAttempts = Number(settings.inputAttemptsCount) || 3;
  if (retriesAmount >= maxAttempts || errorsAmount >= maxAttempts) {
    // logger.info(
    //   `Max attempts reached for ${originCallId}, hanging up. retriesAmount:${retriesAmount} errorsAmount:${errorsAmount} maxAttempts:${maxAttempts}`,
    // );

    if (settings.inputAttemptsMode === 'audio' && settings.inputAttemptsFile) {
      twiml.play(settings.inputAttemptsFile);
    } else {
      twiml.say(
        { language: settings.language || 'en-GB' },
        settings.inputAttemptsText ||
          'Too many attempts. Please try again later.',
      );
    }
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());

    // Clean up Redis data when call ends due to max attempts
    cleanupCallRedisData(originCallId);
    return;
  }

  const gather = twiml.gather({
    timeout: Number(settings.digitsTimeOut) || 5,
    action: `./validateCode?originCallId=${originCallId}&retriesAmount=${retriesAmount}&errorsAmount=${errorsAmount}`,
  });

  let phraseToSay = settings.callingCodePromptText;
  let audioFile = settings.callingCodePromptFile;

  if (req.query.actionError) {
    phraseToSay = settings.callingCodeErrorText;
    audioFile = settings.callingCodeErrorFile;
  }

  if (settings.callingCodePromptMode === 'audio' && audioFile) {
    gather.play(audioFile);
  } else {
    gather.say({ language: settings.language || 'en-GB' }, phraseToSay);
  }

  twiml.redirect(
    `./requestCode?originCallId=${originCallId}&retriesAmount=${
      retriesAmount + 1
    }&errorsAmount=${errorsAmount}`,
  );
  res.type('text/xml').send(twiml.toString());
});

export const validateCode = convertMiddlewareToAsync(async (req, res) => {
  const twiml = new VoiceResponse();
  const originCallId = req.query.originCallId as string;
  const clientCode = Number(req.body.Digits);
  const retriesAmount = Number(req.query.retriesAmount ?? 0);
  const errorsAmount = Number(req.query.errorsAmount ?? 0);
  const uuid = await redisClient.get(`${originCallId}:uuid`);
  const settings = JSON.parse(
    (await redisClient.get(`${originCallId}:settings`)) || '{}',
  );
  const phone_id = await redisClient.get(`${originCallId}:phone_number_id`);

  // logger.info(
  //   `requesting code /validateCode ${phoneNumber}, ${clientCode}, ${retriesAmount}, ${errorsAmount}`,
  // );

  const department = await getCode({
    client_code: clientCode,
    phone_number_id: phone_id || '',
  });
  if (department?.credits <= 0) {
    if (settings.creditErrorMode === 'audio' && settings.creditErrorFile) {
      twiml.play(settings.creditErrorFile);
      twiml.hangup();
    } else {
      twiml.say(
        { language: settings.language || 'en-GB' },
        settings?.creditErrorText ||
          'No Credits are available please contact administrator.',
      );
    }
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());

    // Clean up Redis data when call ends due to no credits
    cleanupCallRedisData(originCallId);
    return;
  }
  if (department) {
    await redisClient.set(`${originCallId}:clientCode`, clientCode);
    await redisClient.set(`${originCallId}:credits`, department.credits);
    saveCallStepAsync(uuid || '', { client_code: department?.id });

    // Check if call type selection is enabled
    if (settings.enableCallType) {
      twiml.redirect(`./requestCallType?originCallId=${originCallId}`);
    } else {
      // Use default call type
      const defaultCallType = settings.defaultCallType || '2';
      await redisClient.set(`${originCallId}:callType`, defaultCallType);

      if (defaultCallType === '1') {
        // Three-way call - check third party number settings
        twiml.redirect(`./handleThirdPartyNumber?originCallId=${originCallId}`);
      } else {
        // Interpreter only call - proceed to language selection
        twiml.redirect(`./requestSourceLanguage?originCallId=${originCallId}`);
      }
    }
  } else {
    twiml.redirect(
      `./requestCode?originCallId=${originCallId}&retriesAmount=${retriesAmount}&errorsAmount=${
        errorsAmount + 1
      }&actionError=true`,
    );
  }
  res.type('text/xml').send(twiml.toString());
});

// Request call type if enabled, validate call type selection
export const requestCallType = convertMiddlewareToAsync(async (req, res) => {
  const twiml = new VoiceResponse();
  const originCallId = req.query.originCallId as string;
  const settings = JSON.parse(
    (await redisClient.get(`${originCallId}:settings`)) || '{}',
  );
  const retriesAmount = Number(req.query.retriesAmount ?? 0);
  const errorsAmount = Number(req.query.errorsAmount ?? 0);

  // Check if maximum attempts exceeded BEFORE setting up gather
  const maxAttempts = Number(settings.inputAttemptsCount) || 3;
  if (retriesAmount >= maxAttempts || errorsAmount >= maxAttempts) {
    logger.info(
      `Max call type attempts reached for ${originCallId}, hanging up. retriesAmount:${retriesAmount} errorsAmount:${errorsAmount} maxAttempts:${maxAttempts}`,
    );

    if (settings.inputAttemptsMode === 'audio' && settings.inputAttemptsFile) {
      twiml.play(settings.inputAttemptsFile);
    } else {
      twiml.say(
        { language: settings.language || 'en-GB' },
        settings.inputAttemptsText ||
          'Too many attempts. Please try again later.',
      );
    }
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());

    // Clean up Redis data when call ends due to max attempts
    cleanupCallRedisData(originCallId);
    return;
  }

  const gather = twiml.gather({
    timeout: Number(settings.digitsTimeOut) || 5,
    action: `./validateCallType?originCallId=${originCallId}&retriesAmount=${retriesAmount}&errorsAmount=${errorsAmount}`,
  });

  let phraseToSay = settings.callTypePromptText;
  let audioFile = settings.callTypePromptFile;

  if (req.query.actionError) {
    phraseToSay = settings.callTypeErrorText;
    audioFile = settings.callTypeErrorFile;
  }

  if (settings.callTypePromptMode === 'audio' && audioFile) {
    gather.play(audioFile);
  } else {
    gather.say(
      { language: settings.language || 'en-GB' },
      phraseToSay ||
        'Press 1 for Three Way Call or 2 for Interpreter Only Call',
    );
  }

  twiml.redirect(
    `./requestCallType?originCallId=${originCallId}&retriesAmount=${
      retriesAmount + 1
    }&errorsAmount=${errorsAmount}`,
  );
  res.type('text/xml').send(twiml.toString());
});

export const validateCallType = convertMiddlewareToAsync(async (req, res) => {
  const twiml = new VoiceResponse();
  const originCallId = req.query.originCallId as string;
  const callTypeInput = req.body.Digits;
  const retriesAmount = Number(req.query.retriesAmount ?? 0);
  const errorsAmount = Number(req.query.errorsAmount ?? 0);
  const settings = JSON.parse(
    (await redisClient.get(`${originCallId}:settings`)) || '{}',
  );
  const uuid = await redisClient.get(`${originCallId}:uuid`);

  if (callTypeInput === '1' || callTypeInput === '2') {
    await redisClient.set(`${originCallId}:callType`, callTypeInput);
    saveCallStepAsync(uuid || '', { call_type: callTypeInput });

    if (callTypeInput === '1') {
      // Three-way call - handle third party number
      twiml.redirect(`./handleThirdPartyNumber?originCallId=${originCallId}`);
    } else {
      // Interpreter only call - proceed to language selection
      twiml.redirect(`./requestSourceLanguage?originCallId=${originCallId}`);
    }
  } else {
    twiml.redirect(
      `./requestCallType?originCallId=${originCallId}&retriesAmount=${retriesAmount}&errorsAmount=${
        errorsAmount + 1
      }&actionError=true`,
    );
  }
  res.type('text/xml').send(twiml.toString());
});

// Handle third party number logic based on settings
export const handleThirdPartyNumber = convertMiddlewareToAsync(
  async (req, res) => {
    const twiml = new VoiceResponse();
    const originCallId = req.query.originCallId as string;
    const settings = JSON.parse(
      (await redisClient.get(`${originCallId}:settings`)) || '{}',
    );
    const uuid = await redisClient.get(`${originCallId}:uuid`);

    if (settings.askThirdPartyNumber) {
      // Ask for third party number
      twiml.redirect(`./requestThirdPartyNumber?originCallId=${originCallId}`);
    } else {
      // Use default third party number
      const defaultNumber = settings.defaultThirdPartyNumber;
      if (defaultNumber) {
        await redisClient.set(
          `${originCallId}:thirdPartyNumber`,
          defaultNumber,
        );
        saveCallStepAsync(uuid || '', { addition_phone: defaultNumber });
        twiml.redirect(`./requestSourceLanguage?originCallId=${originCallId}`);
      } else {
        // No default number configured
        twiml.say(
          { language: settings.language || 'en-GB' },
          'No default third party number configured. Please contact administrator.',
        );
        twiml.hangup();
        res.type('text/xml').send(twiml.toString());
        cleanupCallRedisData(originCallId);
        return;
      }
    }
    res.type('text/xml').send(twiml.toString());
  },
);

// Request third party number from user
export const requestThirdPartyNumber = convertMiddlewareToAsync(
  async (req, res) => {
    const twiml = new VoiceResponse();
    const originCallId = req.query.originCallId as string;
    const settings = JSON.parse(
      (await redisClient.get(`${originCallId}:settings`)) || '{}',
    );
    const retriesAmount = Number(req.query.retriesAmount ?? 0);
    const errorsAmount = Number(req.query.errorsAmount ?? 0);

    // Check if maximum attempts exceeded BEFORE setting up gather
    const maxAttempts = Number(settings.inputAttemptsCount) || 3;
    if (retriesAmount >= maxAttempts || errorsAmount >= maxAttempts) {
      logger.info(
        `Max third party number attempts reached for ${originCallId}, hanging up. retriesAmount:${retriesAmount} errorsAmount:${errorsAmount} maxAttempts:${maxAttempts}`,
      );

      if (
        settings.inputAttemptsMode === 'audio' &&
        settings.inputAttemptsFile
      ) {
        twiml.play(settings.inputAttemptsFile);
      } else {
        twiml.say(
          { language: settings.language || 'en-GB' },
          settings.inputAttemptsText ||
            'Too many attempts. Please try again later.',
        );
      }
      twiml.hangup();
      res.type('text/xml').send(twiml.toString());

      // Clean up Redis data when call ends due to max attempts
      cleanupCallRedisData(originCallId);
      return;
    }

    const gather = twiml.gather({
      timeout: Number(settings.digitsTimeOut) || 5,
      finishOnKey: '#',
      input: ['dtmf'],
      action: `./validateThirdPartyNumber?originCallId=${originCallId}&retriesAmount=${retriesAmount}&errorsAmount=${errorsAmount}`,
    });

    let phraseToSay = settings.thirdPartyNumberPromptText;
    let audioFile = settings.thirdPartyNumberPromptFile;

    if (req.query.actionError) {
      phraseToSay = settings.thirdPartyNumberErrorText;
      audioFile = settings.thirdPartyNumberErrorFile;
    }

    if (settings.thirdPartyNumberPromptMode === 'audio' && audioFile) {
      gather.play(audioFile);
    } else {
      gather.say(
        { language: settings.language || 'en-GB' },
        phraseToSay || 'Please enter the third party number followed by hash.',
      );
    }

    twiml.redirect(
      `./requestThirdPartyNumber?originCallId=${originCallId}&retriesAmount=${
        retriesAmount + 1
      }&errorsAmount=${errorsAmount}`,
    );
    res.type('text/xml').send(twiml.toString());
  },
);

export const validateThirdPartyNumber = convertMiddlewareToAsync(
  async (req, res) => {
    const twiml = new VoiceResponse();
    const originCallId = req.query.originCallId as string;
    const thirdPartyNumber = req.body.Digits;
    const retriesAmount = Number(req.query.retriesAmount ?? 0);
    const errorsAmount = Number(req.query.errorsAmount ?? 0);
    const settings = JSON.parse(
      (await redisClient.get(`${originCallId}:settings`)) || '{}',
    );
    const uuid = await redisClient.get(`${originCallId}:uuid`);

    // Validate phone number format (basic validation)
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;

    if (thirdPartyNumber && phoneRegex.test(thirdPartyNumber)) {
      // Format the number if it doesn't start with +
      const formattedNumber = thirdPartyNumber.startsWith('+')
        ? thirdPartyNumber
        : `+${thirdPartyNumber}`;

      await redisClient.set(
        `${originCallId}:thirdPartyNumber`,
        formattedNumber,
      );
      saveCallStepAsync(uuid || '', { addition_phone: formattedNumber });
      twiml.redirect(`./requestSourceLanguage?originCallId=${originCallId}`);
    } else {
      twiml.redirect(
        `./requestThirdPartyNumber?originCallId=${originCallId}&retriesAmount=${retriesAmount}&errorsAmount=${
          errorsAmount + 1
        }&actionError=true`,
      );
    }
    res.type('text/xml').send(twiml.toString());
  },
);

// Request source language, check available languages, select or ask
export const requestSourceLanguage = convertMiddlewareToAsync(
  async (req, res) => {
    const twiml = new VoiceResponse();
    const originCallId = req.query.originCallId as string;
    const settings = JSON.parse(
      (await redisClient.get(`${originCallId}:settings`)) || '{}',
    );
    const phone_number_id = await redisClient.get(
      `${originCallId}:phone_number_id`,
    );
    const uuid = await redisClient.get(`${originCallId}:uuid`);
    const retriesAmount = Number(req.query.retriesAmount ?? 0);
    const errorsAmount = Number(req.query.errorsAmount ?? 0);

    const languages = await getSourceLanguageByNumber({
      phone_number_id: phone_number_id || '',
    });

    if (!languages || languages.length === 0) {
      twiml.say(
        { language: settings.language || 'en-GB' },
        'No language available for this number.',
      );
      res.type('text/xml').send(twiml.toString());
      twiml.hangup();

      // Clean up Redis data when call ends due to no languages
      cleanupCallRedisData(originCallId);
      return;
    }

    // If askSourceLanguage is false, use sourceLanguageId from settings
    if (!settings.askSourceLanguage && settings.sourceLanguageId) {
      await redisClient.set(
        `${originCallId}:sourceLanguage`,
        settings.sourceLanguageId,
      );
      saveCallStepAsync(uuid || '', {
        source_language_id: settings.sourceLanguageId,
      });
      twiml.redirect(`./requestTargetLanguage?originCallId=${originCallId}`);
      res.type('text/xml').send(twiml.toString());
      return;
    }

    if (settings.askSourceLanguage && languages.length === 1) {
      const selectedLanguage = languages[0];
      await redisClient.set(
        `${originCallId}:sourceLanguage`,
        selectedLanguage.id,
      );
      saveCallStepAsync(uuid || '', {
        source_language_id: selectedLanguage.id,
      });
      twiml.redirect(`./requestTargetLanguage?originCallId=${originCallId}`);
      res.type('text/xml').send(twiml.toString());
      return;
    }

    // Check if maximum attempts exceeded BEFORE setting up gather
    const maxAttempts = Number(settings.inputAttemptsCount) || 3;
    if (retriesAmount >= maxAttempts || errorsAmount >= maxAttempts) {
      logger.info(
        `Max source language attempts reached for ${originCallId}, hanging up. retriesAmount:${retriesAmount} errorsAmount:${errorsAmount} maxAttempts:${maxAttempts}`,
      );

      if (
        settings.inputAttemptsMode === 'audio' &&
        settings.inputAttemptsFile
      ) {
        twiml.play(settings.inputAttemptsFile);
      } else {
        twiml.say(
          { language: settings.language || 'en-GB' },
          settings.inputAttemptsText ||
            'Too many attempts. Please try again later.',
        );
      }
      twiml.hangup();
      res.type('text/xml').send(twiml.toString());

      // Clean up Redis data when call ends due to max attempts
      cleanupCallRedisData(originCallId);
      return;
    }
    const gather = twiml.gather({
      timeout: Number(settings.digitsTimeOut) || 5,
      action: `./validateSourceLanguage?originCallId=${originCallId}&retriesAmount=${retriesAmount}&errorsAmount=${errorsAmount}`,
    });
    if (
      settings.sourceLanguagePromptMode === 'audio' &&
      settings.sourceLanguagePromptFile
    ) {
      gather.play(settings.sourceLanguagePromptFile);
    } else {
      gather.say(
        { language: settings.language || 'en-GB' },
        settings.sourceLanguagePromptText || 'Select the source language',
      );
    }
    twiml.redirect(
      `./requestSourceLanguage?originCallId=${originCallId}&retriesAmount=${
        retriesAmount + 1
      }&errorsAmount=${errorsAmount}`,
    );
    res.type('text/xml').send(twiml.toString());
  },
);

export const validateSourceLanguage = convertMiddlewareToAsync(
  async (req, res) => {
    const twiml = new VoiceResponse();
    const originCallId = req.query.originCallId as string;
    const languageCode = Number(req.body.Digits);
    const retriesAmount = Number(req.query.retriesAmount ?? 0);
    const errorsAmount = Number(req.query.errorsAmount ?? 0);
    const settings = JSON.parse(
      (await redisClient.get(`${originCallId}:settings`)) || '{}',
    );
    const uuid = await redisClient.get(`${originCallId}:uuid`);
    const phone_number_id = await redisClient.get(
      `${originCallId}:phone_number_id`,
    );
    const languages = await getSourceLanguage({
      language_code: languageCode,
      phone_number_id: phone_number_id || '',
    });

    if (languages.length === 1) {
      await redisClient.set(`${originCallId}:sourceLanguage`, languages[0].id);
      saveCallStepAsync(uuid || '', { source_language_id: languages[0].id });
      twiml.redirect(`./requestTargetLanguage?originCallId=${originCallId}`);
    } else {
      if (
        settings.sourceLanguageErrorMode === 'audio' &&
        settings.sourceLanguageErrorFile
      ) {
        twiml.play(settings.sourceLanguageErrorFile);
      } else {
        twiml.say(
          { language: settings.language || 'en-GB' },
          settings?.sourceLanguageErrorText ||
            'Invalid language code. Try again',
        );
      }
      twiml.redirect(
        `./requestSourceLanguage?originCallId=${originCallId}&retriesAmount=${retriesAmount}&errorsAmount=${
          errorsAmount + 1
        }`,
      );
    }
    res.type('text/xml').send(twiml.toString());
  },
);

// Request target language, similar logic as source
export const requestTargetLanguage = convertMiddlewareToAsync(
  async (req, res) => {
    const twiml = new VoiceResponse();
    const originCallId = req.query.originCallId as string;
    const settings = JSON.parse(
      (await redisClient.get(`${originCallId}:settings`)) || '{}',
    );
    const uuid = await redisClient.get(`${originCallId}:uuid`);
    const retriesAmount = Number(req.query.retriesAmount ?? 0);
    const errorsAmount = Number(req.query.errorsAmount ?? 0);
    const phone_number_id = await redisClient.get(
      `${originCallId}:phone_number_id`,
    );
    const languages = await getTargetLanguageByNumber({
      phone_number_id: phone_number_id || '',
    });

    if (!languages || languages.length === 0) {
      twiml.say(
        { language: settings.language || 'en-GB' },
        'No language available for this number',
      );
      res.type('text/xml').send(twiml.toString());
      twiml.hangup();

      // Clean up Redis data when call ends due to no languages
      cleanupCallRedisData(originCallId);
      return;
    }

    // If askTargetLanguage is false, use targetLanguageId from settings
    if (!settings.askTargetLanguage && settings.targetLanguageId) {
      await redisClient.set(
        `${originCallId}:targetLanguage`,
        settings.targetLanguageId,
      );
      saveCallStepAsync(uuid || '', {
        target_language_id: settings.targetLanguageId,
      });
      twiml.redirect(`./callInterpreter?originCallId=${originCallId}`);
      res.type('text/xml').send(twiml.toString());
      return;
    }

    if (!settings.askTargetLanguage || languages.length === 1) {
      const selectedLanguage = languages[0];
      await redisClient.set(
        `${originCallId}:targetLanguage`,
        selectedLanguage.id,
      );
      saveCallStepAsync(uuid || '', {
        target_language_id: selectedLanguage.id,
      });
      twiml.redirect(`./callInterpreter?originCallId=${originCallId}`);
      res.type('text/xml').send(twiml.toString());
      return;
    }

    // Check if maximum attempts exceeded BEFORE setting up gather
    const maxAttempts = Number(settings.inputAttemptsCount) || 3;
    if (retriesAmount >= maxAttempts || errorsAmount >= maxAttempts) {
      logger.info(
        `Max target language attempts reached for ${originCallId}, hanging up. retriesAmount:${retriesAmount} errorsAmount:${errorsAmount} maxAttempts:${maxAttempts}`,
      );

      if (
        settings.inputAttemptsMode === 'audio' &&
        settings.inputAttemptsFile
      ) {
        twiml.play(settings.inputAttemptsFile);
      } else {
        twiml.say(
          { language: settings.language || 'en-GB' },
          settings.inputAttemptsText ||
            'Too many attempts. Please try again later.',
        );
      }
      twiml.hangup();
      res.type('text/xml').send(twiml.toString());

      // Clean up Redis data when call ends due to max attempts
      cleanupCallRedisData(originCallId);
      return;
    }

    const gather = twiml.gather({
      timeout: Number(settings.digitsTimeOut) || 5,
      action: `./validateTargetLanguage?originCallId=${originCallId}&retriesAmount=${retriesAmount}&errorsAmount=${errorsAmount}`,
    });
    if (
      settings.targetLanguagePromptMode === 'audio' &&
      settings.targetLanguagePromptFile
    ) {
      gather.play(settings.targetLanguagePromptFile);
    } else {
      gather.say(
        { language: settings.language || 'en-GB' },
        settings.targetLanguagePromptText ||
          'Please enter code of target language',
      );
    }
    twiml.redirect(
      `./requestTargetLanguage?originCallId=${originCallId}&retriesAmount=${
        retriesAmount + 1
      }&errorsAmount=${errorsAmount}`,
    );
    res.type('text/xml').send(twiml.toString());
  },
);

export const validateTargetLanguage = convertMiddlewareToAsync(
  async (req, res) => {
    const twiml = new VoiceResponse();
    const originCallId = req.query.originCallId as string;
    const languageCode = Number(req.body.Digits);
    const retriesAmount = Number(req.query.retriesAmount ?? 0);
    const errorsAmount = Number(req.query.errorsAmount ?? 0);
    const settings = JSON.parse(
      (await redisClient.get(`${originCallId}:settings`)) || '{}',
    );
    const phone_number_id = await redisClient.get(
      `${originCallId}:phone_number_id`,
    );
    const uuid = await redisClient.get(`${originCallId}:uuid`);

    const languages = await getTargetLanguage({
      language_code: languageCode,
      phone_number_id: phone_number_id || '',
    });

    if (languages.length === 1) {
      await redisClient.set(`${originCallId}:targetLanguage`, languages[0].id);
      saveCallStepAsync(uuid || '', { target_language_id: languages[0].id });

      // Record the start time for response time tracking when we have target language
      const callStartTime = Date.now();
      await redisClient.set(`${originCallId}:callStartTime`, callStartTime);
      logger.info(
        `Starting response time tracking for ${originCallId} at ${callStartTime}`,
      );

      twiml.redirect(`./callInterpreter?originCallId=${originCallId}`);
    } else {
      if (
        settings.targetLanguageErrorMode === 'audio' &&
        settings.targetLanguageErrorFile
      ) {
        twiml.play(settings.targetLanguageErrorFile);
      } else {
        twiml.say(
          { language: settings.language || 'en-GB' },
          settings?.targetLanguageErrorText ||
            'Invalid language code. Try again.',
        );
      }
      twiml.redirect(
        `./requestTargetLanguage?originCallId=${originCallId}&retriesAmount=${retriesAmount}&errorsAmount=${
          errorsAmount + 1
        }`,
      );
    }
    res.type('text/xml').send(twiml.toString());
  },
);

// Find interpreters and make calls based on call type (sequential/simultaneous)
export const callInterpreter = convertMiddlewareToAsync(async (req, res) => {
  const twiml = new VoiceResponse();
  const originCallId = req.query.originCallId as string;
  const settings = JSON.parse(
    (await redisClient.get(`${originCallId}:settings`)) || '{}',
  );
  const phone_number_id = await redisClient.get(
    `${originCallId}:phone_number_id`,
  );
  const callType =
    (await redisClient.get(`${originCallId}:callType`)) ||
    settings.defaultCallType ||
    '2';
  const thirdPartyNumber = await redisClient.get(
    `${originCallId}:thirdPartyNumber`,
  );

  const skipThirdParty = !!settings.skipThirdPartyNumber;

  // logger.info(`calling interpreter /callInterpreter `);
  const sourceLanguage = await redisClient.get(
    `${originCallId}:sourceLanguage`,
  );
  const targetLanguage = await redisClient.get(
    `${originCallId}:targetLanguage`,
  );
  const interpreterCallType = settings.interpreterCallType || 'simultaneous';
  const fallbackEnabled = Boolean(settings?.enableFallback);
  const fallbackNumber = settings?.fallbackNumber;

  // Determine maximum participants based on call type
  const maxParticipants = callType === '1' ? 3 : 2; // 3 for three-way, 2 for interpreter only

  // If this is a three-way call and third party number is set
  if (callType === '1' && thirdPartyNumber) {
    logger.info(
      `[CALL_INTERPRETER] Three-way call detected for ${originCallId} with third party: ${thirdPartyNumber}, skipThirdParty: ${skipThirdParty}`,
    );

    // Store interpreter search parameters in Redis for later use
    await redisClient.set(
      `${originCallId}:sourceLanguage`,
      sourceLanguage || '',
    );
    await redisClient.set(
      `${originCallId}:targetLanguage`,
      targetLanguage || '',
    );
    await redisClient.set(
      `${originCallId}:interpreterCallType`,
      interpreterCallType,
    );
    await redisClient.set(
      `${originCallId}:fallbackEnabled`,
      fallbackEnabled ? 'true' : 'false',
    );
    await redisClient.set(
      `${originCallId}:fallbackNumber`,
      fallbackNumber || '',
    );

    logger.info(
      `[CALL_INTERPRETER] Stored interpreter parameters for ${originCallId}`,
    );

    if (!skipThirdParty) {
      logger.info(
        `[CALL_INTERPRETER] skipThirdParty=false - will call interpreters only after third party connects`,
      );
      // skipThirdParty = false: Only connect interpreter if third party answers
      try {
        logger.info(
          `[CALL_INTERPRETER] Creating third party call to ${thirdPartyNumber}`,
        );
        await twilioClient.calls.create({
          url: `${TWILIO_WEBHOOK}/thirdPartyConnected?originCallId=${originCallId}`,
          to: thirdPartyNumber,
          from: '+39800940366',
          statusCallback: `${TWILIO_WEBHOOK}/thirdPartyStatusResult?originCallId=${originCallId}&skipThirdParty=false`,
          statusCallbackMethod: 'POST',
          timeout: 30,
        });

        // Save third party call info
        const uuid = await redisClient.get(`${originCallId}:uuid`);
        saveCallStepAsync(uuid || '', {
          addition_phone: thirdPartyNumber,
        });

        // Setup conference but DO NOT call interpreter yet
        twiml.dial().conference(
          {
            statusCallback: `${TWILIO_WEBHOOK}/conferenceStatusResult?originCallId=${originCallId}`,
            statusCallbackEvent: ['leave'],
            statusCallbackMethod: 'POST',
            endConferenceOnExit: true,
            maxParticipants: maxParticipants,
            record: 'record-from-start',
          },
          originCallId,
        );

        res.type('text/xml');
        res.send(twiml.toString());
        return; // Exit here, interpreter will be called from thirdPartyStatusResult
      } catch (error) {
        logger.error(
          `Failed to call third party ${thirdPartyNumber}: ${error}`,
        );
        twiml.say('Failed to connect to third party.');
        twiml.hangup();
        res.type('text/xml').send(twiml.toString());
        return;
      }
    } else {
      // skipThirdParty = true: Call third party, but proceed with interpreter regardless
      try {
        await twilioClient.calls.create({
          url: `${TWILIO_WEBHOOK}/thirdPartyConnected?originCallId=${originCallId}`,
          to: thirdPartyNumber,
          from: '+39800940366',
          statusCallback: `${TWILIO_WEBHOOK}/thirdPartyStatusResult?originCallId=${originCallId}&skipThirdParty=true`,
          statusCallbackMethod: 'POST',
          timeout: 30,
        });

        // Save third party call info
        const uuid = await redisClient.get(`${originCallId}:uuid`);
        saveCallStepAsync(uuid || '', {
          addition_phone: thirdPartyNumber,
        });
      } catch (error) {
        logger.error(
          `Failed to call third party ${thirdPartyNumber}: ${error}`,
        );
        // Continue to interpreter logic below even if third party call failed
      }
    }
  }

  // Setup conference
  twiml.dial().conference(
    {
      statusCallback: `${TWILIO_WEBHOOK}/conferenceStatusResult?originCallId=${originCallId}`,
      statusCallbackEvent: ['leave'],
      statusCallbackMethod: 'POST',
      endConferenceOnExit: true,
      maxParticipants: maxParticipants,
      record: 'record-from-start',
    },
    originCallId,
  );

  res.type('text/xml');
  res.send(twiml.toString());

  // Only proceed with interpreter calling if:
  // 1. Not a three-way call, OR
  // 2. Three-way call with skipThirdParty = true, OR
  // 3. Three-way call with no third party number
  if (callType !== '1' || skipThirdParty || !thirdPartyNumber) {
    logger.info(
      `[CALL_INTERPRETER] Proceeding with immediate interpreter calling for ${originCallId}. Conditions: callType=${callType}, skipThirdParty=${skipThirdParty}, hasThirdPartyNumber=${!!thirdPartyNumber}`,
    );
    await callInterpretersForOrigin(
      originCallId,
      sourceLanguage,
      targetLanguage,
      interpreterCallType,
      fallbackEnabled,
      fallbackNumber,
      phone_number_id,
    );
  } else {
    logger.info(
      `[CALL_INTERPRETER] NOT calling interpreters immediately for ${originCallId}. Will wait for third party status callback. Conditions: callType=${callType}, skipThirdParty=${skipThirdParty}, hasThirdPartyNumber=${!!thirdPartyNumber}`,
    );
  }
  // If skipThirdParty = false and we have third party, interpreter calling will be handled by thirdPartyStatusResult
});

// Helper function to call interpreters
async function callInterpretersForOrigin(
  originCallId: string,
  sourceLanguage: string | null,
  targetLanguage: string | null,
  interpreterCallType: string,
  fallbackEnabled: boolean,
  fallbackNumber: string | undefined,
  phone_number_id: string | null,
) {
  let priority = 1;
  let interpreters = [];
  let fallbackCalled = false;

  // Get interpreters for current priority level (1-5)
  do {
    interpreters = await getInterpreters({
      priority,
      source_language_id: sourceLanguage || '',
      target_language_id: targetLanguage || '',
      phone_number_id: phone_number_id || '',
    });
    if (interpreters.length > 0) break;
    priority++;
  } while (priority <= 5);

  // After checking all priorities (1-5), check fallback
  if (interpreters.length === 0 && priority > 5) {
    if (fallbackEnabled && fallbackNumber) {
      fallbackCalled = true;
      interpreters = [{ phone: fallbackNumber }];
      // logger.info(
      //   `No interpreters found in priorities 1-5, using fallback number: ${fallbackNumber}`,
      // );
    } else {
      // No interpreters and no fallback enabled/available, call noAnswer
      // logger.info(
      //   `No interpreters available for ${originCallId} and fallback not available, calling noAnswer`,
      // );

      // Record the start time before going to noAnswer (if not already recorded)
      const existingCallStartTime = await redisClient.get(
        `${originCallId}:callStartTime`,
      );
      if (!existingCallStartTime) {
        const callStartTime = Date.now();
        await redisClient.set(`${originCallId}:callStartTime`, callStartTime);
        logger.info(
          `Recording late start time for ${originCallId} before noAnswer`,
        );
      }

      await twilioClient.calls(originCallId).update({
        url: `${TWILIO_WEBHOOK}/noAnswer?originCallId=${originCallId}`,
        method: 'POST',
      });
      return;
    }
  }

  // logger.info(
  //   `Found ${interpreters.length} interpreters for priority ${priority}, callType: ${interpreterCallType}, fallbackCalled: ${fallbackCalled}`,
  // );

  if (interpreterCallType === 'sequential') {
    await callInterpretersSequentially(
      interpreters,
      originCallId,
      priority,
      fallbackCalled,
    );
  } else {
    await callInterpretersSimultaneously(
      interpreters,
      originCallId,
      priority,
      fallbackCalled,
    );
  }
}
// Helper function for simultaneous calling
async function callInterpretersSimultaneously(
  interpreters: any[],
  originCallId: string,
  priority: number,
  fallbackCalled: boolean,
) {
  // logger.info(`Calling ${interpreters.length} interpreters simultaneously`);
  const credits = await redisClient.get(`${originCallId}:credits`);
  logger.info(
    `${typeof Math.min(
      Math.max(Number(credits) * 60 || 3600, 60),
      3600,
    )} seconds: ${Math.min(
      Math.max(Number(credits) * 60 || 3600, 60),
      3600,
    )} seconds`,
  );
  const createdCalls = await Promise.all(
    interpreters.map(({ phone }) =>
      twilioClient.calls.create({
        url:
          `${TWILIO_WEBHOOK}/machineDetectionResult?originCallId=${originCallId}` +
          `&priority=${priority}&fallbackCalled=${fallbackCalled}&callType=simultaneous`,
        to: phone,
        from: '+39800940366',
        machineDetection: 'Enable',
        machineDetectionTimeout: 10,
        timeLimit: Math.min(Number(credits) ? Number(credits) * 60 : 0, 3600),
        statusCallback:
          `${TWILIO_WEBHOOK}/callStatusResult?originCallId=${originCallId}` +
          `&priority=${priority}&fallbackCalled=${fallbackCalled}&callType=simultaneous`,
        statusCallbackMethod: 'POST',
        timeout: 20,
      }),
    ),
  );

  await Promise.all(
    createdCalls.map(({ sid }) => redisClient.lPush(originCallId, sid)),
  );
}

// Helper function for sequential calling
async function callInterpretersSequentially(
  interpreters: any[],
  originCallId: string,
  priority: number,
  fallbackCalled: boolean,
) {
  // logger.info(`Calling ${interpreters.length} interpreters sequentially`);

  // Randomly shuffle interpreters array
  const shuffledInterpreters = [...interpreters].sort(
    () => Math.random() - 0.5,
  );

  // Store all interpreters in Redis queue for sequential processing
  await redisClient.del(`${originCallId}:queue`);

  for (const interpreter of shuffledInterpreters) {
    await redisClient.rPush(
      `${originCallId}:queue`,
      JSON.stringify({
        phone: interpreter.phone,
        priority,
        fallbackCalled,
      }),
    );
  }

  // Set sequential mode flag
  await redisClient.set(`${originCallId}:callType`, 'sequential');

  // Call the first interpreter
  await callNextInterpreterInSequence(originCallId);
}

// Function to call the next interpreter in sequence
// Function to call the next interpreter in sequence
async function callNextInterpreterInSequence(originCallId: string) {
  const nextInterpreterData = await redisClient.lPop(`${originCallId}:queue`);
  const credits = await redisClient.get(`${originCallId}:credits`);
  const settings = JSON.parse(
    (await redisClient.get(`${originCallId}:settings`)) || '{}',
  );

  if (!nextInterpreterData) {
    const fallbackEnabled = Boolean(settings?.enableFallback);
    const fallbackNumber = settings?.fallbackNumber;
    const queueLength = await redisClient.lLen(`${originCallId}:queue`);

    if (queueLength === 0) {
      // Check if we need to retry current priority or move to next
      const currentPriority = Number(
        (await redisClient.get(`${originCallId}:currentPriority`)) || 1,
      );
      const retryAttempts = Number(settings?.retryAttempts || 0);
      const retryKey = `${originCallId}:retry:${currentPriority}`;
      const currentRetries = Number((await redisClient.get(retryKey)) || 0);

      // Try retry if available
      if (retryAttempts > 0 && currentRetries < retryAttempts) {
        await redisClient.set(retryKey, currentRetries + 1);
        // logger.info(
        //   `Sequential retry attempt ${
        //     currentRetries + 1
        //   }/${retryAttempts} for priority ${currentPriority}`,
        // );

        const sourceLanguage = await redisClient.get(
          `${originCallId}:sourceLanguage`,
        );
        const targetLanguage = await redisClient.get(
          `${originCallId}:targetLanguage`,
        );
        const phone_number_id = await redisClient.get(
          `${originCallId}:phone_number_id`,
        );

        const interpreters = await getInterpreters({
          phone_number_id: phone_number_id || '',
          priority: currentPriority,
          source_language_id: sourceLanguage || '',
          target_language_id: targetLanguage || '',
        });

        if (interpreters.length > 0) {
          // Re-populate queue with interpreters for retry
          const shuffledInterpreters = [...interpreters].sort(
            () => Math.random() - 0.5,
          );
          for (const interpreter of shuffledInterpreters) {
            await redisClient.rPush(
              `${originCallId}:queue`,
              JSON.stringify({
                phone: interpreter.phone,
                priority: currentPriority,
                fallbackCalled: false,
              }),
            );
          }
          await callNextInterpreterInSequence(originCallId);
          return;
        }
      }

      // Try fallback if enabled and available
      if (fallbackEnabled && fallbackNumber) {
        // logger.info(
        //   `Sequential queue empty, trying fallback for ${originCallId}: ${fallbackNumber}`,
        // );

        await redisClient.rPush(
          `${originCallId}:queue`,
          JSON.stringify({
            phone: fallbackNumber,
            priority: 6, // Use priority 6 to indicate fallback
            fallbackCalled: true,
          }),
        );

        await callNextInterpreterInSequence(originCallId);
        return;
      } else {
        // No fallback available, call noAnswer
        // logger.info(
        //   `No more interpreters in sequential queue for ${originCallId}, calling noAnswer`,
        // );

        // Calculate response time before calling noAnswer
        const callStartTime = await redisClient.get(
          `${originCallId}:callStartTime`,
        );
        logger.info(
          `No more interpreters in sequential queue for callStartTime:${callStartTime}, redirecting to noAnswer`,
        );
        if (callStartTime) {
          const responseTimeMs = Date.now() - Number(callStartTime);
          const responseTimeSeconds = Math.round(responseTimeMs / 1000);

          logger.info(
            `No more interpreters in sequential queue for ${originCallId} with response time: ${responseTimeSeconds} seconds`,
          );

          // Save response time to database
          const uuid = await redisClient.get(`${originCallId}:uuid`);
          saveCallStepAsync(uuid || '', {
            response_time: responseTimeSeconds,
            status: 'No Answer',
          });
        }

        await redisClient.del(`${originCallId}:callType`);
        await redisClient.del(`${originCallId}:currentPriority`);
        await twilioClient.calls(originCallId).update({
          url: `${TWILIO_WEBHOOK}/noAnswer?originCallId=${originCallId}`,
          method: 'POST',
        });
        return;
      }
    }
    return;
  }

  const { phone, priority, fallbackCalled } = JSON.parse(nextInterpreterData);

  // Store current priority for retry logic
  await redisClient.set(`${originCallId}:currentPriority`, priority);

  // logger.info(
  //   `Sequential call to ${phone} for ${originCallId} (priority: ${priority}, fallback: ${fallbackCalled})`,
  // );
  logger.info(
    `${typeof Math.min(
      Math.max(Number(credits) * 60 || 3600, 60),
      3600,
    )} seconds: ${Math.min(
      Math.max(Number(credits) * 60 || 3600, 60),
      3600,
    )} seconds`,
  );
  const call = await twilioClient.calls.create({
    url:
      `${TWILIO_WEBHOOK}/machineDetectionResult?originCallId=${originCallId}` +
      `&priority=${priority}&fallbackCalled=${fallbackCalled}&callType=sequential`,
    to: phone,
    from: '+39800940366',
    machineDetection: 'Enable',
    machineDetectionTimeout: 10,
    timeLimit: Math.min(Number(credits) ? Number(credits) * 60 : 0, 3600),
    statusCallback:
      `${TWILIO_WEBHOOK}/callStatusResult?originCallId=${originCallId}` +
      `&priority=${priority}&fallbackCalled=${fallbackCalled}&callType=sequential`,
    statusCallbackMethod: 'POST',
    timeout: 20,
  });

  await redisClient.set(`${originCallId}:currentCall`, call.sid);
}

export const machineDetectionResult = convertMiddlewareToAsync(
  async (req, res) => {
    const { AnsweredBy, CallSid: targetCallId } = req.body;
    const originCallId = String(req.query.originCallId ?? '');
    const priority = Number(req.query.priority);
    const callType = req.query.callType || 'simultaneous';
    const fallbackCalled = req.query.fallbackCalled === 'true';
    const settings = JSON.parse(
      (await redisClient.get(`${originCallId}:settings`)) || '{}',
    );
    const phone_number_id = await redisClient.get(
      `${originCallId}:phone_number_id`,
    );
    // logger.info(
    //   `Machine detection result: ${AnsweredBy} for call ${targetCallId}, type: ${callType}`,
    // );

    if (AnsweredBy === 'unknown' || AnsweredBy === 'human') {
      const twiml = new VoiceResponse();

      // Calculate response time for successful interpreter connection
      const callStartTime = await redisClient.get(
        `${originCallId}:callStartTime`,
      );
      if (callStartTime) {
        const responseTimeMs = Date.now() - Number(callStartTime);
        const responseTimeSeconds = Math.round(responseTimeMs / 1000);

        logger.info(
          `Interpreter connected for ${originCallId} with response time: ${responseTimeSeconds} seconds`,
        );

        // Save response time to database
        const uuid = await redisClient.get(`${originCallId}:uuid`);
        saveCallStepAsync(uuid || '', {
          response_time: responseTimeSeconds,
        });
      }

      if (callType === 'sequential') {
        // Clear the queue and current call for sequential
        await redisClient.del(`${originCallId}:queue`);
        await redisClient.del(`${originCallId}:currentCall`);
        await redisClient.del(`${originCallId}:callType`);
        // logger.info(`Sequential interpreter connected: ${targetCallId}`);
      } else {
        // Cancel all other calls for simultaneous
        const interpretersCallsSid = await redisClient.lRange(
          originCallId,
          0,
          -1,
        );
        const filteredInterpretersCallsSid = interpretersCallsSid.filter(
          (interpreterCallSid) => interpreterCallSid !== targetCallId,
        );

        await Promise.all(
          filteredInterpretersCallsSid.map((interpreterCallSid) =>
            twilioClient.calls(interpreterCallSid).update({
              status: 'completed',
            }),
          ),
        );

        // Clear the calls list
        await redisClient.del(originCallId);
        // logger.info(
        //   `Simultaneous interpreter connected: ${targetCallId}, cancelled ${filteredInterpretersCallsSid.length} other calls`,
        // );
      }

      twiml.dial().conference(originCallId);
      res.type('text/xml');
      res.send(twiml.toString());
    } else {
      // Machine detected or voicemail
      // logger.info(
      //   `Machine/voicemail detected for ${targetCallId}, call type: ${callType}`,
      // );

      await twilioClient.calls(targetCallId).update({
        status: 'completed',
      });

      if (callType === 'sequential') {
        // Remove current call and try next in sequence
        await redisClient.del(`${originCallId}:currentCall`);
        await callNextInterpreterInSequence(originCallId);
      } else {
        // For simultaneous, remove this call from the list
        await redisClient.lRem(originCallId, 0, targetCallId);

        // Check if there are any more calls pending
        const remainingCalls = await redisClient.lLen(originCallId);
        if (remainingCalls === 0) {
          // No more calls, try next priority or fallback
          const sourceLanguage = await redisClient.get(
            `${originCallId}:sourceLanguage`,
          );
          const targetLanguage = await redisClient.get(
            `${originCallId}:targetLanguage`,
          );

          await removeAndCallNewTargets({
            originCallId,
            targetCallId,
            sourceLanguageID: sourceLanguage || '',
            targetLanguageID: targetLanguage || '',
            priority,
            fallbackCalled,
            phone_number_id: phone_number_id || '',
          });
        }
      }

      res.status(200).send('OK');
    }
  },
);

// Also, ensure the retry logic is properly triggered in callStatusResult:
export const callStatusResult = convertMiddlewareToAsync(async (req, res) => {
  const { CallSid: targetCallId, CallStatus, CallDuration, Called } = req.body;
  logger.info(`callStatusResult called with body: ${JSON.stringify(req.body)}`);
  const originCallId = String(req.query.originCallId ?? '');
  const priority = Number(req.query.priority);
  const callType = req.query.callType || 'simultaneous';
  const fallbackCalled = req.query.fallbackCalled === 'true';
  const settings = JSON.parse(
    (await redisClient.get(`${originCallId}:settings`)) || '{}',
  );
  const phone_number_id = await redisClient.get(
    `${originCallId}:phone_number_id`,
  );
  const credits = await redisClient.get(`${originCallId}:credits`);
  const timeLimitInSeconds = Math.min(
    Math.max(Number(credits) * 60 || 3600, 60),
    3600,
  );
  // logger.info(`req.body: ${req.body}`);
  // logger.info(
  //   `Call status result: ${CallStatus} for call ${targetCallId}, type: ${callType}, duration: ${CallDuration}`,
  // );

  // Check if call was disconnected due to credit limit
  if (
    CallStatus === 'completed' &&
    CallDuration &&
    Number(CallDuration) === timeLimitInSeconds && // Call disconnected due to time limit
    timeLimitInSeconds !== 3600 // Not the maximum 3600 second limit, so it's due to insufficient credits
  ) {
    // logger.info(`Call ${targetCallId} disconnected due to credit limit`);

    try {
      // Update call record
      const uuid = await redisClient.get(`${originCallId}:uuid`);

      // Calculate credits used (should not exceed available credits)
      const callDurationMinutes = Math.ceil(Number(CallDuration) / 60);
      const availableCredits = Number(credits) || 0;
      const creditsUsed = Math.min(callDurationMinutes, availableCredits);

      saveCallStepAsync(uuid || '', {
        status: 'No Credit',
        duration: CallDuration,
        credits_used: creditsUsed,
      });
      logger.info(
        `Call record updated for ${originCallId} with No Credit status and duration ${CallDuration}`,
      );
      // Send email notifications to both client and interpreter
      const clientData = await db
        .select()
        .from(Client)
        .where(eq(Client.id, settings?.client_id))
        .limit(1);

      const interpreterData = Called
        ? await db
            .select()
            .from(interpreter)
            .where(eq(interpreter.phone, Called))
            .limit(1)
        : [];
      logger.info(
        `Interpreter data:${Called}: ${JSON.stringify(interpreterData)}`,
      );
      // Send email to client
      if (clientData.length > 0 && clientData[0].email) {
        const clientEmailContent =
          emailHeader +
          creditLimitClientNotification({
            clientName:
              `${clientData[0].first_name || ''} ${
                clientData[0].last_name || ''
              }`.trim() || 'Valued Client',
            callDuration: CallDuration,
          }) +
          emailFooter;

        await mailer.send({
          to: 'abdul.waqar@lingoyou.com',
          from: 'portal@lingoyou.com',
          // to: clientData[0].email,
          // from: 'noreply@lingoyou.com', // Replace with your sender email
          subject: 'Call Disconnected - Credit Limit Reached',
          html: clientEmailContent,
        });

        logger.info(
          `Credit limit email sent to client: ${clientData[0].email}`,
        );
      }

      // Send email to interpreter
      if (interpreterData.length > 0 && interpreterData[0].email) {
        const interpreterEmailContent =
          emailHeader +
          creditLimitInterpreterNotification({
            interpreterName:
              `${interpreterData[0].first_name || ''} ${
                interpreterData[0].last_name || ''
              }`.trim() || 'Dear Interpreter',
            clientPhone: phone_number_id || '',
            callDuration: CallDuration,
          }) +
          emailFooter;

        await mailer.send({
          to: 'abdul.waqar@lingoyou.com',
          from: 'portal@lingoyou.com',
          // to: interpreterData[0].email,
          // from: 'noreply@lingoyou.com', // Replace with your sender email
          subject: 'Call Disconnected - Client Credit Limit Reached',
          html: interpreterEmailContent,
        });

        logger.info(
          `Credit limit email sent to interpreter: ${interpreterData[0].email}`,
        );
      }
    } catch (error) {
      logger.error(
        `Failed to process credit exhaustion or send emails: ${error}`,
      );
    }

    // Clean up Redis data when call ends due to credit exhaustion
    cleanupCallRedisData(originCallId);

    res.status(200).send('OK');
    return;
  }

  // Handle other call status scenarios (existing logic)
  if (
    CallStatus === 'failed' ||
    CallStatus === 'no-answer' ||
    CallStatus === 'canceled' ||
    CallStatus === 'busy'
  ) {
    if (callType === 'sequential') {
      // Remove current call and try next in sequence
      await redisClient.del(`${originCallId}:currentCall`);
      await callNextInterpreterInSequence(originCallId);
    } else {
      // For simultaneous, remove this call from the list
      await redisClient.lRem(originCallId, 0, targetCallId);

      // Check if there are any more calls pending
      const remainingCalls = await redisClient.lLen(originCallId);
      if (remainingCalls === 0) {
        // No more calls, try retry or next priority or fallback
        const sourceLanguage = await redisClient.get(
          `${originCallId}:sourceLanguage`,
        );
        const targetLanguage = await redisClient.get(
          `${originCallId}:targetLanguage`,
        );

        await removeAndCallNewTargets({
          originCallId,
          targetCallId,
          sourceLanguageID: sourceLanguage || '',
          targetLanguageID: targetLanguage || '',
          priority,
          fallbackCalled,
          phone_number_id: phone_number_id || '',
        });
      }
    }
  }

  res.status(200).send('OK');
});

export const conferenceStatusResult = convertMiddlewareToAsync(
  async (req, res) => {
    const { StatusCallbackEvent, EndConferenceOnExit } = req.body;
    const originCallId = String(req.query.originCallId ?? '');
    const uuid = await redisClient.get(`${originCallId}:uuid`);
    const settings = JSON.parse(
      (await redisClient.get(`${originCallId}:settings`)) || '{}',
    );
    // logger.info(`settings for ${originCallId}: ${JSON.stringify(settings)}`);
    // logger.info(`body : ${JSON.stringify(req.body)}`);
    const phone_number_id = await redisClient.get(
      `${originCallId}:phone_number_id`,
    );
    // logger.info(
    //   `Conference event: ${StatusCallbackEvent} for conference ${req?.body?.ConferenceSid}`,
    // );
    if (StatusCallbackEvent !== 'participant-leave') {
      // logger.info(`Conference ended due to credit limit for ${originCallId}`);

      return;
    }

    // Clean up remaining participants
    const participants = await twilioClient
      .conferences(req.body.ConferenceSid)
      .participants.list();

    await Promise.all(
      participants.map(({ callSid }) =>
        twilioClient.calls(callSid).update({
          status: 'completed',
        }),
      ),
    );

    await redisClient.del(originCallId);

    try {
      await updateRequestInformation(uuid || '', {
        request: req.body,
        EndConferenceOnExit,
        originCallId: req.body?.CallSid,
        conferenceSid: req.body?.ConferenceSid,
        phone_number_id: phone_number_id || '',
      });
    } catch (error) {
      logger.error(`Failed to create call record: ${error}`);
    }

    // Clean up all Redis data when conference ends
    cleanupCallRedisData(originCallId);

    res.status(200).send('OK');
  },
);

export const noAnswer = convertMiddlewareToAsync(async (req, res) => {
  const twiml = new VoiceResponse();
  const originCallId = String(req.query.originCallId ?? '');
  const settings = JSON.parse(
    (await redisClient.get(`${originCallId}:settings`)) || '{}',
  );

  const uuid = await redisClient.get(`${originCallId}:uuid`);

  // Calculate response time for no answer scenario
  const callStartTime = await redisClient.get(`${originCallId}:callStartTime`);
  if (callStartTime) {
    const responseTimeMs = Date.now() - Number(callStartTime);
    const responseTimeSeconds = Math.round(responseTimeMs / 1000);

    logger.info(
      `No answer for ${originCallId} with response time: ${responseTimeSeconds} seconds`,
    );

    // Save response time to database
    saveCallStepAsync(uuid || '', {
      response_time: responseTimeSeconds,
      status: 'No Answer',
    });
  } else {
    // Fallback if no start time recorded
    saveCallStepAsync(uuid || '', { status: 'No Answer' });
  }

  if (
    settings.noAnswerMessageMode === 'audio' &&
    settings.noAnswerMessageFile
  ) {
    twiml.play(settings.noAnswerMessageFile);
    twiml.hangup();
  } else {
    twiml.say(
      {
        language: settings.language || 'en-GB',
      },
      settings.noAnswerMessageText || 'No Answer.',
    );
  }

  twiml.hangup();
  res.type('text/xml');
  res.send(twiml.toString());

  // Clean up Redis data when call ends with no answer
  cleanupCallRedisData(originCallId);
});

// Handle third party connection to conference
export const thirdPartyConnected = convertMiddlewareToAsync(
  async (req, res) => {
    const twiml = new VoiceResponse();
    const originCallId = req.query.originCallId as string;

    // Connect third party to the conference
    twiml.dial().conference(originCallId);

    res.type('text/xml');
    res.send(twiml.toString());
  },
);

// Handle third party call status updates
export const thirdPartyStatusResult = convertMiddlewareToAsync(
  async (req, res) => {
    const { CallSid: thirdPartyCallSid, CallStatus, CallDuration } = req.body;
    const originCallId = String(req.query.originCallId ?? '');
    const skipThirdParty = req.query.skipThirdParty === 'true';
    const uuid = await redisClient.get(`${originCallId}:uuid`);

    logger.info(
      `[THIRD_PARTY_STATUS] Call ${thirdPartyCallSid} status: ${CallStatus}, duration: ${CallDuration}, originCallId: ${originCallId}, skipThirdParty: ${skipThirdParty}`,
    );

    // Update call record with third party information
    if (CallStatus === 'completed' && CallDuration) {
      logger.info(
        `[THIRD_PARTY_STATUS] Third party call completed with duration: ${CallDuration} seconds`,
      );
    } else if (
      CallStatus === 'failed' ||
      CallStatus === 'no-answer' ||
      CallStatus === 'busy'
    ) {
      logger.info(
        `[THIRD_PARTY_STATUS] Third party call failed with status: ${CallStatus}`,
      );
    }

    // Handle interpreter calling based on skipThirdPartyNumber setting
    if (!skipThirdParty) {
      logger.info(
        `[THIRD_PARTY_STATUS] skipThirdParty=false, checking status ${CallStatus} to decide on interpreter calling`,
      );
      // skipThirdParty = false: Only call interpreter if third party connected successfully
      if (CallStatus === 'answered' || CallStatus === 'in-progress') {
        logger.info(
          `[THIRD_PARTY_STATUS] Third party connected successfully (${CallStatus}), now calling interpreters for ${originCallId}`,
        );

        // Check if interpreter was already called to avoid duplicate calls
        const interpreterCalled = await redisClient.get(
          `${originCallId}:interpreterCalled`,
        );
        if (!interpreterCalled) {
          await redisClient.set(`${originCallId}:interpreterCalled`, 'true');
          logger.info(
            `[THIRD_PARTY_STATUS] Calling interpreters for ${originCallId}`,
          );
          await callInterpretersFromStatusCallback(originCallId);
        } else {
          logger.info(
            `[THIRD_PARTY_STATUS] Interpreters already called for ${originCallId}, skipping duplicate call`,
          );
        }
      } else {
        logger.info(
          `[THIRD_PARTY_STATUS] Third party did not connect (${CallStatus}), NOT calling interpreters for ${originCallId}`,
        );
      }
    } else {
      logger.info(
        `[THIRD_PARTY_STATUS] skipThirdParty=true, interpreters should have been called already from callInterpreter function`,
      );
    }

    res.status(200).send('OK');
  },
);

// Helper function to call interpreters from status callback (used by thirdPartyStatusResult)
async function callInterpretersFromStatusCallback(originCallId: string) {
  // Retrieve stored parameters from Redis
  const sourceLanguage = await redisClient.get(
    `${originCallId}:sourceLanguage`,
  );
  const targetLanguage = await redisClient.get(
    `${originCallId}:targetLanguage`,
  );
  const interpreterCallType = await redisClient.get(
    `${originCallId}:interpreterCallType`,
  );
  const fallbackEnabled =
    (await redisClient.get(`${originCallId}:fallbackEnabled`)) === 'true';
  const fallbackNumber = await redisClient.get(
    `${originCallId}:fallbackNumber`,
  );
  const phone_number_id = await redisClient.get(
    `${originCallId}:phone_number_id`,
  );

  // Call the main interpreter calling function
  await callInterpretersForOrigin(
    originCallId,
    sourceLanguage,
    targetLanguage,
    interpreterCallType || 'simultaneous',
    fallbackEnabled,
    fallbackNumber || undefined,
    phone_number_id,
  );
}
