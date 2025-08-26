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
}: {
  originCallId: string;
  targetCallId: string;
  sourceLanguageID: string;
  targetLanguageID: string;
  priority: number;
  fallbackCalled: boolean;
}) => {
  const originCall = await twilioClient.calls(originCallId).fetch();

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

  if (fallbackCalled) {
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

  let interpreters = [];
  let currentPriority = priority;
  let currentFallbackCalled: boolean = fallbackCalled;

  do {
    // eslint-disable-next-line no-await-in-loop
    interpreters = await getInterpreters({
      phone_number: '',
      priority: Number(currentPriority),
      source_language_id: sourceLanguageID,
      target_language_id: targetLanguageID,
    });
    currentPriority++;
  } while (interpreters.length === 0 && currentPriority <= 5);

  if (interpreters.length === 0 && currentPriority > 5) {
    currentFallbackCalled = true;
    interpreters = [{ phone: vars.fallbackPhoneNumber }];
  }

  const createdCalls = await Promise.all(
    interpreters.map(({ phone }) =>
      twilioClient.calls.create({
        url:
          `${TWILIO_WEBHOOK}/machineDetectionResult?originCallId=${originCallId}` +
          `&sourceLanguageID=${sourceLanguageID}&targetLanguageID=${targetLanguageID}&priority=${currentPriority}&fallbackCalled=${currentFallbackCalled}`,
        to: phone,
        from: '+39800932464',
        machineDetection: 'Enable',
        machineDetectionTimeout: 10,
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
      .select()
      .from(callRoutingSettings)
      .where(eq(callRoutingSettings.phone_number, calledNumber))
      .limit(1);
    if (routeSettings.length === 0) {
      twiml.say(
        { language: 'en-GB' },
        'Hello Welcome to Phone mediation. Please update your settings.',
      );
      res.type('text/xml').send(twiml.toString());
      return;
    }
    twiml.say({ language: 'en-GB' }, 'Hello Welcome to Phone mediation.');

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
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
    return;
  }

  const gather = twiml.gather({
    numDigits: 2,
    timeout: 15,
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
  // await redisClient.set(`${originCallId}:phone_number`, calledNumber);
  const phoneNumber = await redisClient.get(`${originCallId}:phone_number`);

  logger.info(
    `requesting code /validateCode ${phoneNumber}, ${clientCode}, ${retriesAmount}, ${errorsAmount}`,
  );

  const department = await getCode({
    client_code: clientCode,
    phone_number: phoneNumber || '',
  });
  logger.info(
    `validateCode /validateCode department: ${JSON.stringify(department)}`,
  );
  if (department) {
    await redisClient.set(`${originCallId}:clientCode`, clientCode);
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

    logger.info(`requesting source Language /requestSourceLanguage`);

    const languages = await getSourceLanguageByNumber({
      phone_number: calledNumber,
    });
    logger.info(
      `requesting source Language /requestSourceLanguage languages: ${JSON.stringify(
        languages,
      )}`,
    );
    if (!languages || languages.length === 0) {
      twiml.say(
        { language: 'en-GB' },
        'No language available for this number.',
      );
      twiml.hangup();
      res.type('text/xml').send(twiml.toString());
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
      // numDigits: 2,
      timeout: 8,
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
    logger.info(
      `validating source Language /validateSourceLanguage ${originCallId}, ${languageCode}`,
    );
    const languages = await getSourceLanguage({
      language_code: languageCode,
      phone_number: calledNumber,
    });
    logger.info(
      `validating source Language /validateSourceLanguage languages: ${JSON.stringify(
        languages,
      )}`,
    );
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
    logger.info(`requesting target Language /requestTargetLanguage.`);
    const languages = await getTargetLanguageByNumber({
      phone_number: calledNumber,
    });
    logger.info(
      `requesting target Language /requestTargetLanguage languages:${calledNumber}: ${JSON.stringify(
        languages,
        calledNumber,
      )}`,
    );
    if (!languages || languages.length === 0) {
      twiml.say({ language: 'en-GB' }, 'No language available for this number');
      twiml.hangup();
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

    const gather = twiml.gather({
      // numDigits: 2,
      timeout: 8,
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
    logger.info(
      `validating target Language /validateTargetLanguage ${originCallId}, ${languageCode}`,
    );
    const languages = await getTargetLanguage({
      language_code: languageCode,
      phone_number: calledNumber,
    });
    logger.info(
      `validating target Language /validateTargetLanguage languages: ${JSON.stringify(
        languages,
      )}`,
    );
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
  // const callType = settings.interpreterCallType || 'simultaneous';
  let fallbackCalled = false;

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

  do {
    // eslint-disable-next-line no-await-in-loop
    interpreters = await getInterpreters({
      priority,
      source_language_id: sourceLanguage || '',
      target_language_id: targetLanguage || '',
      phone_number: calledNumber,
    });
    priority++;
    logger.info(
      `Calling interpreters with priority ${priority - 1}: ${JSON.stringify(
        interpreters,
      )}`,
    );
  } while (interpreters.length === 0 && priority <= 5);

  if (interpreters.length === 0 && priority > 5) {
    fallbackCalled = true;
    interpreters = [{ phone: vars.fallbackPhoneNumber }];
  }

  const createdCalls = await Promise.all(
    interpreters.map(({ phone }) =>
      twilioClient.calls.create({
        url:
          `${TWILIO_WEBHOOK}/machineDetectionResult?originCallId=${originCallId}` +
          `&priority=${priority}&fallbackCalled=${fallbackCalled}`,
        to: phone,
        from: '+39800932464',
        machineDetection: 'Enable',
        machineDetectionTimeout: 10,
        statusCallback:
          `${TWILIO_WEBHOOK}/callStatusResult?originCallId=${originCallId}` +
          `&priority=${priority}&fallbackCalled=${fallbackCalled}`,
        statusCallbackMethod: 'POST',
        timeout: 15,
      }),
    ),
  );

  await Promise.all(
    createdCalls.map(({ sid }) => redisClient.lPush(originCallId, sid)),
  );
});

export const machineDetectionResult = convertMiddlewareToAsync(
  async (req, res) => {
    const { AnsweredBy, CallSid: targetCallId } = req.body;
    const originCallId = String(req.query.originCallId ?? '');
    const priority = Number(req.query.priority);
    const sourceLanguage = await redisClient.get(
      `${originCallId}:sourceLanguage`,
    );
    const targetLanguage = await redisClient.get(
      `${originCallId}:targetLanguage`,
    );
    const fallbackCalled = req.query.fallbackCalled === 'true';

    if (AnsweredBy === 'unknown' || AnsweredBy === 'human') {
      const twiml = new VoiceResponse();
      const interpretersCallsSid = await redisClient.lRange(
        originCallId,
        0,
        -1,
      );
      const filteredInterpretersCallsSid = interpretersCallsSid.filter(
        (interpreterCallSid) => interpreterCallSid !== targetCallId,
      );

      let calls = await Promise.all(
        filteredInterpretersCallsSid.map((interpreterCallSid) => {
          twilioClient.calls(interpreterCallSid).update({
            status: 'completed',
          });
        }),
      );
      twiml.dial().conference(originCallId);
      res.type('text/xml');
      res.send(twiml.toString());
    } else {
      await twilioClient.calls(targetCallId).update({
        status: 'completed',
      });
      await removeAndCallNewTargets({
        originCallId,
        targetCallId,
        sourceLanguageID: sourceLanguage || '',
        targetLanguageID: targetLanguage || '',
        priority,
        fallbackCalled,
      });
    }
  },
);

export const callStatusResult = convertMiddlewareToAsync(async (req) => {
  const { CallSid: targetCallId, CallStatus } = req.body;
  const originCallId = String(req.query.originCallId ?? '');
  const priority = Number(req.query.priority);
  const fallbackCalled = req.query.fallbackCalled === 'true';
  const sourceLanguage = await redisClient.get(
    `${originCallId}:sourceLanguage`,
  );
  const targetLanguage = await redisClient.get(
    `${originCallId}:targetLanguage`,
  );
  if (
    CallStatus === 'failed' ||
    CallStatus === 'no-answer' ||
    CallStatus === 'canceled' ||
    CallStatus === 'busy'
  ) {
    await removeAndCallNewTargets({
      originCallId,
      targetCallId,
      sourceLanguageID: sourceLanguage || '',
      targetLanguageID: targetLanguage || '',
      priority,
      fallbackCalled,
    });
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
