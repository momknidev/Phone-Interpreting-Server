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
import { vars } from '../../../config/vars';
import { logger } from '../../../config/logger';
import {
  createRequest,
  updateRequest,
  updateRequestInformation,
} from '../../../services/request/createRequest';
import { db } from '../../../config/postgres';
import { CallReports, callRoutingSettings } from '../../../models';
import { eq } from 'drizzle-orm';
import uuidv4 from '../../../utils/uuidv4';

// Helper to save/update call history in DB
async function saveCallStep(id: string, data: any) {
  const existing = await db
    .select()
    .from(CallReports)
    .where(eq(CallReports.id, id))
    .limit(1);
  logger.info(`saveCallStep: ${existing.length}`);
  logger.info(`saveCallStep: ${id} ${data}`);
  if (existing.length === 0) {
    await createRequest({ id, ...data });
  } else {
    await updateRequest(id, data);
  }
}
const saveCallStepAsync = (id: string, data: any) => {
  logger.info(`Background saveCallStep: ${id} ${data}`);
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
  phone_number,
}: {
  originCallId: string;
  targetCallId: string;
  sourceLanguageID: string;
  targetLanguageID: string;
  priority: number;
  fallbackCalled: boolean;
  phone_number: string;
}) => {
  const originCall = await twilioClient.calls(originCallId).fetch();
  const credits = await redisClient.get(`${originCallId}:credits`);
  if (
    originCall.status === 'completed' ||
    originCall.status === 'canceled' ||
    originCall.status === 'busy' ||
    originCall.status === 'failed' ||
    originCall.status === 'no-answer'
  ) {
    twilioClient.calls(targetCallId).update({
      status: 'completed',
    });
    return;
  }

  // If we were already using fallback, go to noAnswer
  if (fallbackCalled) {
    logger.info(`Fallback number failed for ${originCallId}, calling noAnswer`);
    twilioClient.calls(originCallId).update({
      url: `${TWILIO_WEBHOOK}/noAnswer`,
      method: 'POST',
    });

    return;
  }

  await redisClient.lRem(originCallId, 0, targetCallId);
  const isAllNumbersUnavailable = !(await redisClient.exists(originCallId));

  if (!isAllNumbersUnavailable) {
    return;
  }

  let interpreters: any = [];
  let currentPriority = priority;
  let currentFallbackCalled: boolean = fallbackCalled;

  // Continue checking higher priorities (only if we haven't reached priority 5 yet)
  if (currentPriority <= 5) {
    do {
      interpreters = await getInterpreters({
        phone_number,
        priority: Number(currentPriority),
        source_language_id: sourceLanguageID,
        target_language_id: targetLanguageID,
      });
      currentPriority++;
    } while (interpreters.length === 0 && currentPriority <= 5);
  }

  // After checking all priorities (1-5), try fallback if enabled
  if (interpreters.length === 0 && currentPriority > 5) {
    const settings = JSON.parse(
      (await redisClient.get(`${originCallId}:settings`)) || '{}',
    );
    const fallbackEnabled = Boolean(settings?.enableFallback);

    if (fallbackEnabled && !currentFallbackCalled) {
      currentFallbackCalled = true;
      interpreters = [{ phone: vars.fallbackPhoneNumber }];
      logger.info(
        `No interpreters found in priorities 1-5, trying fallback number`,
      );
    } else {
      // No interpreters and no fallback available, call noAnswer
      logger.info(
        `No interpreters or fallback available for ${originCallId}, calling noAnswer`,
      );
      twilioClient.calls(originCallId).update({
        url: `${TWILIO_WEBHOOK}/noAnswer`,
        method: 'POST',
      });
      return;
    }
  }

  // If we still have no interpreters, call noAnswer
  if (interpreters.length === 0) {
    logger.info(
      `No interpreters available for ${originCallId}, calling noAnswer`,
    );
    twilioClient.calls(originCallId).update({
      url: `${TWILIO_WEBHOOK}/noAnswer`,
      method: 'POST',
    });
    return;
  }

  const createdCalls = await Promise.all(
    interpreters.map(({ phone }: { phone: any }) =>
      twilioClient.calls.create({
        url:
          `${TWILIO_WEBHOOK}/machineDetectionResult?originCallId=${originCallId}` +
          `&sourceLanguageID=${sourceLanguageID}&targetLanguageID=${targetLanguageID}&priority=${currentPriority}&fallbackCalled=${currentFallbackCalled}`,
        to: phone,
        from: '+13093321185',
        machineDetection: 'Enable',
        machineDetectionTimeout: 10,
        timeLimit: Number(credits) * 60 || 0,
        statusCallback:
          `${TWILIO_WEBHOOK}/callStatusResult?originCallId=${originCallId}` +
          `&sourceLanguageID=${sourceLanguageID}&targetLanguageID=${targetLanguageID}&priority=${currentPriority}&fallbackCalled=${currentFallbackCalled}`,
        statusCallbackMethod: 'POST',
        timeout: 15,
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
  logger.info(
    `Incoming call details: To=${calledNumber}, From=${callerNumber}, CallSid=${originCallId}`,
  );
  try {
    const routeSettings = await db
      .select({
        client_id: callRoutingSettings.client_id,
        phone_number: callRoutingSettings.phone_number,
        enable_code: callRoutingSettings.enable_code,
        callingCodePrompt: callRoutingSettings.callingCodePrompt,
        callingCodeError: callRoutingSettings.callingCodeError,
        askSourceLanguage: callRoutingSettings.askSourceLanguage,
        sourceLanguagePrompt: callRoutingSettings.sourceLanguagePrompt,
        sourceLanguageError: callRoutingSettings.sourceLanguageError,
        askTargetLanguage: callRoutingSettings.askTargetLanguage,
        targetLanguagePrompt: callRoutingSettings.targetLanguagePrompt,
        targetLanguageError: callRoutingSettings.targetLanguageError,
        interpreterCallType: callRoutingSettings.interpreterCallType,
        enableFallback: callRoutingSettings.enableFallback,
        fallbackNumber: callRoutingSettings.fallbackNumber,
        retryAttempts: callRoutingSettings.retryAttempts,
        creditError: callRoutingSettings.creditError,
        digitsTimeOut: callRoutingSettings.digitsTimeOut,
      })
      .from(callRoutingSettings)
      .where(eq(callRoutingSettings.phone_number, calledNumber))
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

    twiml.say({ language: 'en-GB' }, 'Welcome to Phone mediation.');

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
      phone_number: calledNumber,
      client_id: settings.client_id,
    });

    twiml.redirect(`./requestCode?originCallId=${originCallId}`);
    res.type('text/xml').send(twiml.toString());
  } catch (error) {
    logger.error(`Error fetching call route settings: ${error}`);
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
  logger.info(`settings: ${JSON.stringify(settings)}`);
  const retriesAmount = Number(req.query.retriesAmount ?? 0);
  const errorsAmount = Number(req.query.errorsAmount ?? 0);
  logger.info(`requesting code /requestCode `);
  if (!settings.enable_code) {
    twiml.redirect(`./requestSourceLanguage?originCallId=${originCallId}`);
    res.type('text/xml').send(twiml.toString());
    return;
  }

  if (retriesAmount >= 2 || errorsAmount >= 3) {
    twiml.say(
      { language: 'en-GB' },
      'Too many attempts. Please try again later.',
    );
    res.type('text/xml').send(twiml.toString());
    twiml.hangup();
    return;
  }

  const gather = twiml.gather({
    timeout: Number(settings.digitsTimeOut) || 5,
    action: `./validateCode?originCallId=${originCallId}&retriesAmount=${retriesAmount}&errorsAmount=${errorsAmount}`,
  });

  let phraseToSay = settings.callingCodePrompt;

  if (req.query.actionError) {
    phraseToSay = settings.callingCodeError;
  }
  gather.say({ language: 'en-GB' }, phraseToSay);

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
  // await redisClient.set(`${originCallId}:phone_number`, calledNumber);
  const phoneNumber = await redisClient.get(`${originCallId}:phone_number`);

  logger.info(
    `requesting code /validateCode ${phoneNumber}, ${clientCode}, ${retriesAmount}, ${errorsAmount}`,
  );

  const department = await getCode({
    client_code: clientCode,
    phone_number: phoneNumber || '',
  });
  if (department?.credits <= 0) {
    twiml.say(
      { language: 'en-GB' },
      settings?.creditError ||
        'No Credits are available please contact administrator.',
    );
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
    return;
  }
  if (department) {
    await redisClient.set(`${originCallId}:clientCode`, clientCode);
    await redisClient.set(`${originCallId}:credits`, department.credits);
    saveCallStepAsync(uuid || '', { client_code: department?.id });
    twiml.redirect(`./requestSourceLanguage?originCallId=${originCallId}`);
  } else {
    twiml.redirect(
      `./requestCode?originCallId=${originCallId}&retriesAmount=${retriesAmount}&errorsAmount=${
        errorsAmount + 1
      }&actionError=true`,
    );
  }
  res.type('text/xml').send(twiml.toString());
});

// Request source language, check available languages, select or ask
export const requestSourceLanguage = convertMiddlewareToAsync(
  async (req, res) => {
    const twiml = new VoiceResponse();
    const originCallId = req.query.originCallId as string;
    const settings = JSON.parse(
      (await redisClient.get(`${originCallId}:settings`)) || '{}',
    );
    const calledNumber = settings.phone_number;
    const uuid = await redisClient.get(`${originCallId}:uuid`);

    const languages = await getSourceLanguageByNumber({
      phone_number: calledNumber,
    });

    if (!languages || languages.length === 0) {
      twiml.say(
        { language: 'en-GB' },
        'No language available for this number.',
      );
      res.type('text/xml').send(twiml.toString());
      twiml.hangup();
      return;
    }

    if (!settings.askSourceLanguage || languages.length === 1) {
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

    const gather = twiml.gather({
      timeout: Number(settings.digitsTimeOut) || 5,
      action: `./validateSourceLanguage?originCallId=${originCallId}`,
    });
    gather.say(
      { language: 'en-GB' },
      settings.sourceLanguagePrompt || 'Select the source language',
    );
    twiml.redirect(`./requestSourceLanguage?originCallId=${originCallId}`);
    res.type('text/xml').send(twiml.toString());
  },
);

export const validateSourceLanguage = convertMiddlewareToAsync(
  async (req, res) => {
    const twiml = new VoiceResponse();
    const originCallId = req.query.originCallId as string;
    const languageCode = Number(req.body.Digits);
    const settings = JSON.parse(
      (await redisClient.get(`${originCallId}:settings`)) || '{}',
    );
    const uuid = await redisClient.get(`${originCallId}:uuid`);
    const calledNumber = settings.phone_number;
    const languages = await getSourceLanguage({
      language_code: languageCode,
      phone_number: calledNumber,
    });

    if (languages.length === 1) {
      await redisClient.set(`${originCallId}:sourceLanguage`, languages[0].id);
      saveCallStepAsync(uuid || '', { source_language_id: languages[0].id });
      twiml.redirect(`./requestTargetLanguage?originCallId=${originCallId}`);
    } else {
      twiml.say(
        { language: 'en-GB' },
        settings?.sourceLanguageError || 'Invalid language code. Try again',
      );
      twiml.redirect(`./requestSourceLanguage?originCallId=${originCallId}`);
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
    const calledNumber = settings.phone_number;
    const uuid = await redisClient.get(`${originCallId}:uuid`);
    const languages = await getTargetLanguageByNumber({
      phone_number: calledNumber,
    });

    if (!languages || languages.length === 0) {
      twiml.say({ language: 'en-GB' }, 'No language available for this number');
      res.type('text/xml').send(twiml.toString());
      twiml.hangup();
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

    const gather = twiml.gather({
      timeout: Number(settings.digitsTimeOut) || 5,
      action: `./validateTargetLanguage?originCallId=${originCallId}`,
    });
    gather.say(
      { language: 'en-GB' },
      settings.targetLanguagePrompt || 'Please enter code of target language',
    );
    twiml.redirect(`./requestTargetLanguage?originCallId=${originCallId}`);
    res.type('text/xml').send(twiml.toString());
  },
);

export const validateTargetLanguage = convertMiddlewareToAsync(
  async (req, res) => {
    const twiml = new VoiceResponse();
    const originCallId = req.query.originCallId as string;
    const languageCode = Number(req.body.Digits);
    const settings = JSON.parse(
      (await redisClient.get(`${originCallId}:settings`)) || '{}',
    );
    const calledNumber = settings.phone_number;
    const uuid = await redisClient.get(`${originCallId}:uuid`);

    const languages = await getTargetLanguage({
      language_code: languageCode,
      phone_number: calledNumber,
    });

    if (languages.length === 1) {
      await redisClient.set(`${originCallId}:targetLanguage`, languages[0].id);
      saveCallStepAsync(uuid || '', { target_language_id: languages[0].id });
      twiml.redirect(`./callInterpreter?originCallId=${originCallId}`);
    } else {
      twiml.say(
        { language: 'en-GB' },
        settings?.targetLanguageError || 'Invalid language code. Try again.',
      );
      twiml.redirect(`./requestTargetLanguage?originCallId=${originCallId}`);
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
  const calledNumber = settings.phone_number;
  logger.info(`calling interpreter /callInterpreter `);
  const sourceLanguage = await redisClient.get(
    `${originCallId}:sourceLanguage`,
  );
  const targetLanguage = await redisClient.get(
    `${originCallId}:targetLanguage`,
  );
  const callType = settings.interpreterCallType || 'simultaneous';
  const fallbackEnabled = Boolean(settings?.enableFallback);

  twiml.dial().conference(
    {
      statusCallback: `${TWILIO_WEBHOOK}/conferenceStatusResult?originCallId=${originCallId}`,
      statusCallbackEvent: ['leave'],
      statusCallbackMethod: 'POST',
      endConferenceOnExit: true,
      maxParticipants: 2,
      record: 'record-from-start',
    },
    originCallId,
  );

  res.type('text/xml');
  res.send(twiml.toString());

  let priority = 1;
  let interpreters = [];
  let fallbackCalled = false;

  // Get interpreters for current priority level (1-5)
  do {
    interpreters = await getInterpreters({
      priority,
      source_language_id: sourceLanguage || '',
      target_language_id: targetLanguage || '',
      phone_number: calledNumber,
    });
    if (interpreters.length > 0) break;
    priority++;
  } while (priority <= 5);

  // After checking all priorities (1-5), check fallback
  if (interpreters.length === 0 && priority > 5) {
    if (fallbackEnabled) {
      fallbackCalled = true;
      interpreters = [{ phone: vars.fallbackPhoneNumber }];
      logger.info(
        `No interpreters found in priorities 1-5, using fallback number`,
      );
    } else {
      // No interpreters and no fallback enabled, call noAnswer
      logger.info(
        `No interpreters available for ${originCallId} and fallback disabled, calling noAnswer`,
      );
      await twilioClient.calls(originCallId).update({
        url: `${TWILIO_WEBHOOK}/noAnswer`,
        method: 'POST',
      });
      return;
    }
  }

  logger.info(
    `Found ${interpreters.length} interpreters for priority ${priority}, callType: ${callType}, fallbackCalled: ${fallbackCalled}`,
  );

  if (callType === 'sequential') {
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
});
// Helper function for simultaneous calling
async function callInterpretersSimultaneously(
  interpreters: any[],
  originCallId: string,
  priority: number,
  fallbackCalled: boolean,
) {
  logger.info(`Calling ${interpreters.length} interpreters simultaneously`);
  const credits = await redisClient.get(`${originCallId}:credits`);
  const createdCalls = await Promise.all(
    interpreters.map(({ phone }) =>
      twilioClient.calls.create({
        url:
          `${TWILIO_WEBHOOK}/machineDetectionResult?originCallId=${originCallId}` +
          `&priority=${priority}&fallbackCalled=${fallbackCalled}&callType=simultaneous`,
        to: phone,
        from: '+13093321185',
        machineDetection: 'Enable',
        machineDetectionTimeout: 10,
        timeLimit: Number(credits) * 60,
        statusCallback:
          `${TWILIO_WEBHOOK}/callStatusResult?originCallId=${originCallId}` +
          `&priority=${priority}&fallbackCalled=${fallbackCalled}&callType=simultaneous`,
        statusCallbackMethod: 'POST',
        timeout: 15,
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
  logger.info(`Calling ${interpreters.length} interpreters sequentially`);

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
async function callNextInterpreterInSequence(originCallId: string) {
  const nextInterpreterData = await redisClient.lPop(`${originCallId}:queue`);
  const credits = await redisClient.get(`${originCallId}:credits`);
  if (!nextInterpreterData) {
    // No more interpreters in current queue, try next priority or fallback
    const settings = JSON.parse(
      (await redisClient.get(`${originCallId}:settings`)) || '{}',
    );
    const fallbackEnabled = Boolean(settings?.enableFallback);
    const callType = await redisClient.get(`${originCallId}:callType`);

    // Check if we were using fallback (queue would be empty after fallback fails)
    const queueLength = await redisClient.lLen(`${originCallId}:queue`);

    if (queueLength === 0) {
      // Try fallback if enabled and not already tried
      if (fallbackEnabled) {
        logger.info(
          `Sequential queue empty, trying fallback for ${originCallId}`,
        );

        // Add fallback to queue
        await redisClient.rPush(
          `${originCallId}:queue`,
          JSON.stringify({
            phone: vars.fallbackPhoneNumber,
            priority: 6, // Use priority 6 to indicate fallback
            fallbackCalled: true,
          }),
        );

        // Try calling fallback
        await callNextInterpreterInSequence(originCallId);
        return;
      } else {
        // No fallback available, call noAnswer
        logger.info(
          `No more interpreters in sequential queue for ${originCallId}, calling noAnswer`,
        );
        await redisClient.del(`${originCallId}:callType`);
        await twilioClient.calls(originCallId).update({
          url: `${TWILIO_WEBHOOK}/noAnswer`,
          method: 'POST',
        });
        logger.info(`Called noAnswer for ${originCallId}`);
        return;
      }
    }
  }

  if (!nextInterpreterData) {
    // No more interpreters to call, handle accordingly (already handled above)
    return;
  }
  const { phone, priority, fallbackCalled } = JSON.parse(nextInterpreterData);

  logger.info(
    `Sequential call to ${phone} for ${originCallId} (priority: ${priority}, fallback: ${fallbackCalled})`,
  );

  const call = await twilioClient.calls.create({
    url:
      `${TWILIO_WEBHOOK}/machineDetectionResult?originCallId=${originCallId}` +
      `&priority=${priority}&fallbackCalled=${fallbackCalled}&callType=sequential`,
    to: phone,
    from: '+13093321185',
    machineDetection: 'Enable',
    machineDetectionTimeout: 10,
    timeLimit: Number(credits) * 60,
    statusCallback:
      `${TWILIO_WEBHOOK}/callStatusResult?originCallId=${originCallId}` +
      `&priority=${priority}&fallbackCalled=${fallbackCalled}&callType=sequential`,
    statusCallbackMethod: 'POST',
    timeout: 15,
  });

  // Store only the current call SID
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
    const calledNumber = settings.phone_number;

    logger.info(
      `Machine detection result: ${AnsweredBy} for call ${targetCallId}, type: ${callType}`,
    );

    if (AnsweredBy === 'unknown' || AnsweredBy === 'human') {
      const twiml = new VoiceResponse();

      if (callType === 'sequential') {
        // Clear the queue and current call for sequential
        await redisClient.del(`${originCallId}:queue`);
        await redisClient.del(`${originCallId}:currentCall`);
        await redisClient.del(`${originCallId}:callType`);
        logger.info(`Sequential interpreter connected: ${targetCallId}`);
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
        logger.info(
          `Simultaneous interpreter connected: ${targetCallId}, cancelled ${filteredInterpretersCallsSid.length} other calls`,
        );
      }

      twiml.dial().conference(originCallId);
      res.type('text/xml');
      res.send(twiml.toString());
    } else {
      // Machine detected or voicemail
      logger.info(
        `Machine/voicemail detected for ${targetCallId}, call type: ${callType}`,
      );

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
            phone_number: calledNumber,
          });
        }
      }

      res.status(200).send('OK');
    }
  },
);
export const callStatusResult = convertMiddlewareToAsync(async (req) => {
  const { CallSid: targetCallId, CallStatus } = req.body;
  const originCallId = String(req.query.originCallId ?? '');
  const priority = Number(req.query.priority);
  const callType = req.query.callType || 'simultaneous';
  const fallbackCalled = req.query.fallbackCalled === 'true';
  const settings = JSON.parse(
    (await redisClient.get(`${originCallId}:settings`)) || '{}',
  );
  const calledNumber = settings.phone_number;

  logger.info(
    `Call status result: ${CallStatus} for call ${targetCallId}, type: ${callType} ${JSON.stringify(
      req.body,
    )}`,
  );

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
          phone_number: calledNumber,
        });
      }
    }
  }
});

export const conferenceStatusResult = convertMiddlewareToAsync(async (req) => {
  const { StatusCallbackEvent, EndConferenceOnExit } = req.body;
  const originCallId = String(req.query.originCallId ?? '');
  const uuid = await redisClient.get(`${originCallId}:uuid`);
  const settings = JSON.parse(
    (await redisClient.get(`${originCallId}:settings`)) || '{}',
  );
  const phone_number = settings.phone_number;
  if (StatusCallbackEvent !== 'participant-leave') {
    return;
  }

  const participants = await twilioClient
    .conferences(req.body.ConferenceSid)
    .participants.list();

  const data = await Promise.all(
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
      phone_number: phone_number,
    });
  } catch (error) {
    logger.error(`Failed to create call record: ${error}`);
  }
});

export const noAnswer = convertMiddlewareToAsync(async (req, res) => {
  const twiml = new VoiceResponse();
  const originCallId = String(req.query.originCallId ?? '');

  const uuid = await redisClient.get(`${originCallId}:uuid`);
  logger.info(`No answer handler for call ${originCallId}, uuid: ${uuid}`);
  saveCallStepAsync(uuid || '', { status: 'No-Answer' });

  twiml.say(
    {
      language: 'en-GB',
    },
    'No Answer.',
  );

  twiml.hangup();
  res.type('text/xml');
  res.send(twiml.toString());
});
