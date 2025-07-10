import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';

import { departmentExists } from '../../../services/department/departmentExists';
import { getInterpreters } from '../../../services/interpreter/getInterpreters';
import { languageExists } from '../../../services/language/languageExists';

import { convertMiddlewareToAsync } from '../../../utils/rest/middlewares/convertMiddlewareToAsync';

import { TWILIO_WEBHOOK } from '../../../const/http/ApiUrl';

import { twilioClient } from '../../../config/twilio';
import { redisClient } from '../../../config/redis';
import { vars } from '../../../config/vars';
import { logger } from '../../../config/logger';
import { createRequest } from '../../../services/request/createRequest';

const removeAndCallNewTargets = async ({
    originCallId,
    targetCallId,
    langaugeCode,
    priority,
    fallbackCalled,
}: {
    originCallId: string,
    targetCallId: string,
    langaugeCode: number,
    priority: number,
    fallbackCalled: boolean,
}) => {
    const originCall = await twilioClient.calls(originCallId).fetch();

    if (
        originCall.status === 'completed'
        || originCall.status === 'canceled'
        || originCall.status === 'busy'
        || originCall.status === 'failed'
        || originCall.status === 'no-answer'
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
    const isAllNumbersUnavailable = !await redisClient.exists(originCallId);

    if (!isAllNumbersUnavailable) {
        return;
    }

    let interpreters = [];
    let currentPriority = priority;
    let currentFallbackCalled: boolean = fallbackCalled;

    do {
        // eslint-disable-next-line no-await-in-loop
        interpreters = await getInterpreters({ priority: currentPriority, languageCode: langaugeCode });
        currentPriority++;
    } while (interpreters.length === 0 && currentPriority <= 5);

    if (interpreters.length === 0 && currentPriority > 5) {
        currentFallbackCalled = true;
        interpreters = [{ phone: vars.fallbackPhoneNumber }];
    }

    const createdCalls = await Promise.all(interpreters.map(({ phone }) => (
        twilioClient.calls.create({
            url: `${TWILIO_WEBHOOK}/machineDetectionResult?originCallId=${originCallId}`
                + `&langaugeCode=${langaugeCode}&priority=${currentPriority}&fallbackCalled=${currentFallbackCalled}`,
            to: phone,
            from: '+39800932464',
            machineDetection: 'Enable',
            machineDetectionTimeout: 10,
            statusCallback: `${TWILIO_WEBHOOK}/callStatusResult?originCallId=${originCallId}`
                + `&langaugeCode=${langaugeCode}&priority=${currentPriority}&fallbackCalled=${currentFallbackCalled}`,
            statusCallbackMethod: 'POST',
            timeout: 15,
        })
    )));

    await Promise.all(createdCalls.map(({ sid }) => redisClient.lPush(originCallId, sid)));
};

export const departmentCodeRequest = convertMiddlewareToAsync(async (req, res) => {
    const twiml = new VoiceResponse();

    const retriesAmount = Number(req.query.retriesAmount ?? 0);
    const errorsAmount = Number(req.query.errorsAmount ?? 0);

    if (retriesAmount >= 2) {
        twiml.say({
            language: 'it-IT',
        }, 'Siamo spiacenti, non è stato possibile elaborare la richiesta. La invitiamo a riprovare più tardi.');

        twiml.hangup();

        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }

    if (errorsAmount >= 3) {
        twiml.say({
            language: 'it-IT',
        }, 'Sono stati effettuati troppi tentativi non validi.'
        + 'La invitiamo a contattare l\'assistenza o riprovare più tardi.');
        twiml.hangup();

        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }

    const gather = twiml.gather({
        numDigits: 3,
        timeout: 15,
        action: `./departmentCodeValidation?retriesAmount=${retriesAmount}`
            + `&errorsAmount=${errorsAmount}`,
    });

    const actionRetry = Boolean(req.query.actionRetry);
    const actionError = Boolean(req.query.actionError);

    let phraseToSay = 'Benvenuti al servizio di interpretariato telefonico dell’AUSL di Bologna'
        + 'Per favore, inserire il codice identificativo del reparto.';

    if (actionRetry) {
        phraseToSay = 'Non abbiamo ricevuto alcun input. Inserisca il codice adesso, per favore.';
    }

    if (actionError) {
        phraseToSay = 'Il codice inserito non è valido. Si prega di riprovare.';
    }

    gather.say({
        language: 'it-IT',
    }, phraseToSay);

    twiml.redirect(`./departmentCodeRequest?retriesAmount=${retriesAmount + 1}`
        + `&errorsAmount=${errorsAmount}&actionRetry=true`);

    res.type('text/xml');
    res.send(twiml.toString());
});

export const departmentCodeValidation = convertMiddlewareToAsync(async (req, res) => {
    const twiml = new VoiceResponse();

    const retriesAmount = Number(req.query.retriesAmount ?? 0);
    const errorsAmount = Number(req.query.errorsAmount ?? 0);

    const departmentCode = Number(req.body.Digits);
    // Save department code in Redis
    const { CallSid: originCallId } = req.body;

    if (departmentCode && departmentExists({ departmentCode })) {
        await redisClient.set(`${originCallId}:departmentCode`, departmentCode);
        twiml.redirect('./languageCodeRequest');
    } else {
        twiml.redirect(`./departmentCodeRequest?retriesAmount=${retriesAmount}`
            + `&errorsAmount=${errorsAmount + 1}&actionError=true`);
    }

    res.type('text/xml');
    res.send(twiml.toString());
});

export const languageCodeRequest = convertMiddlewareToAsync(async (req, res) => {
    const twiml = new VoiceResponse();

    const retriesAmount = Number(req.query.retriesAmount ?? 0);
    const errorsAmount = Number(req.query.errorsAmount ?? 0);

    if (retriesAmount >= 2) {
        twiml.say({
            language: 'it-IT',
        }, 'Siamo spiacenti, non è stato possibile elaborare la richiesta. La invitiamo a riprovare più tardi.');

        twiml.hangup();

        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }

    if (errorsAmount >= 3) {
        twiml.say({
            language: 'it-IT',
        }, 'Sono stati effettuati troppi tentativi non validi.'
        + 'La invitiamo a contattare l\'assistenza o riprovare più tardi.');

        twiml.hangup();

        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }

    const gather = twiml.gather({
        numDigits: 2,
        timeout: 15,
        action: `./languageCodeValidation?retriesAmount=${retriesAmount}`
            + `&errorsAmount=${errorsAmount + 1}&actionRetry=true`,
    });

    const actionRetry = Boolean(req.query.actionRetry);
    const actionError = Boolean(req.query.actionError);

    let phraseToSay = 'Inserire ora il codice della lingua richiesta.';

    if (actionRetry) {
        phraseToSay = 'Non abbiamo ricevuto alcun input. Inserisca il codice adesso, per favore.';
    }

    if (actionError) {
        phraseToSay = 'Il codice lingua inserito non è valido. Si prega di riprovare.';
    }

    gather.say({
        language: 'it-IT',
    }, phraseToSay);

    twiml.redirect(`./languageCodeRequest?retriesAmount=${retriesAmount}&errorsAmount=${errorsAmount + 1}`);

    res.type('text/xml');
    res.send(twiml.toString());
});

export const languageCodeValidation = convertMiddlewareToAsync(async (req, res) => {
    const twiml = new VoiceResponse();

    const retriesAmount = Number(req.query.retriesAmount ?? 0);
    const errorsAmount = Number(req.query.errorsAmount ?? 0);

    const languageCode = Number(req.body.Digits);
    const { CallSid: originCallId } = req.body;

    if (languageCode && languageExists({ languageCode })) {
        await redisClient.set(`${originCallId}:languageCode`, languageCode);
        twiml.redirect(`./callInterpreter?langaugeCode=${languageCode}`);
    } else {
        twiml.redirect(`./languageCodeRequest?retriesAmount=${retriesAmount}`
            + `&errorsAmount=${errorsAmount + 1}&actionError=true`);
    }

    res.type('text/xml');
    res.send(twiml.toString());
});

export const callInterpreter = convertMiddlewareToAsync(async (req, res) => {
    const twiml = new VoiceResponse();
    const { CallSid: originCallId, } = req.body;
    // Store start time in Redis

    const langaugeCode = Number(req.query.langaugeCode);
    let priority = 1;
    let fallbackCalled = false;

    twiml.dial().conference({
        statusCallback: `${TWILIO_WEBHOOK}/conferenceStatusResult?originCallId=${originCallId}`,
        statusCallbackEvent: ['leave'],
        statusCallbackMethod: 'POST',
        endConferenceOnExit: true,
        maxParticipants: 2,
        record: 'record-from-start',
    }, originCallId);

    res.type('text/xml');
    res.send(twiml.toString());

    let interpreters = [];

    do {
        // eslint-disable-next-line no-await-in-loop
        interpreters = await getInterpreters({ priority, languageCode: langaugeCode });
        priority++;
    } while (interpreters.length === 0 && priority <= 5);

    if (interpreters.length === 0 && priority > 5) {
        fallbackCalled = true;
        interpreters = [{ phone: vars.fallbackPhoneNumber }];
    }

    const createdCalls = await Promise.all(interpreters.map(({ phone }) => (
        twilioClient.calls.create({
            url: `${TWILIO_WEBHOOK}/machineDetectionResult?originCallId=${originCallId}`
                + `&langaugeCode=${langaugeCode}&priority=${priority}&fallbackCalled=${fallbackCalled}`,
            to: phone,
            from: '+39800932464',
            machineDetection: 'Enable',
            machineDetectionTimeout: 10,
            statusCallback: `${TWILIO_WEBHOOK}/callStatusResult?originCallId=${originCallId}`
                + `&langaugeCode=${langaugeCode}&priority=${priority}&fallbackCalled=${fallbackCalled}`,
            statusCallbackMethod: 'POST',
            timeout: 15,
        })
    )));

    await Promise.all(createdCalls.map(({ sid }) => redisClient.lPush(originCallId, sid)));
});

export const machineDetectionResult = convertMiddlewareToAsync(async (req, res) => {
    const { AnsweredBy, CallSid: targetCallId, } = req.body;
    const originCallId = String(req.query.originCallId ?? '');
    const langaugeCode = Number(req.query.langaugeCode);
    const priority = Number(req.query.priority);
    const fallbackCalled = req.query.fallbackCalled === 'true';

    if (AnsweredBy === 'unknown' || AnsweredBy === 'human') {
        const twiml = new VoiceResponse();
        const interpretersCallsSid = await redisClient.lRange(originCallId, 0, -1);
        const filteredInterpretersCallsSid = interpretersCallsSid.filter(
            (interpreterCallSid) => interpreterCallSid !== targetCallId,
        );

        let calls = await Promise.all(filteredInterpretersCallsSid.map((interpreterCallSid) => {
            twilioClient.calls(interpreterCallSid).update({
                status: 'completed',
            });
        }));
        twiml.dial().conference(originCallId);
        res.type('text/xml');
        res.send(twiml.toString());
    } else {
        await twilioClient.calls(targetCallId).update({
            status: 'completed',
        });
        await removeAndCallNewTargets({
            originCallId, targetCallId, langaugeCode, priority, fallbackCalled,
        });
    }
});

export const callStatusResult = convertMiddlewareToAsync(async (req) => {
    const { CallSid: targetCallId, CallStatus } = req.body;
    const originCallId = String(req.query.originCallId ?? '');
    const langaugeCode = Number(req.query.langaugeCode);
    const priority = Number(req.query.priority);
    const fallbackCalled = req.query.fallbackCalled === 'true';

    if (
        CallStatus === 'failed'
        || CallStatus === 'no-answer'
        || CallStatus === 'canceled'
        || CallStatus === 'busy'
    ) {
        await removeAndCallNewTargets({
            originCallId, targetCallId, langaugeCode, priority, fallbackCalled,
        });
    }
});

export const conferenceStatusResult = convertMiddlewareToAsync(async (req) => {
    const { StatusCallbackEvent, EndConferenceOnExit } = req.body;
    const originCallId = String(req.query.originCallId ?? '');
    if (StatusCallbackEvent !== 'participant-leave') {
        return;
    }


    const participants = await twilioClient.conferences(req.body.ConferenceSid)
        .participants
        .list();

    const data = await Promise.all(
        participants.map(({ callSid }) => twilioClient.calls(callSid).update({
            status: 'completed',
        })),
    );


    await redisClient.del(originCallId);
    const [
        departmentCode,
        languageCode,
    ] = await Promise.all([
        redisClient.get(`${originCallId}:departmentCode`),
        redisClient.get(`${originCallId}:languageCode`),
    ]);
    try {
        await createRequest({
            request: req.body,
            EndConferenceOnExit,
            originCallId: req.body?.CallSid,
            departmentCode: Number(departmentCode),
            languageCode: Number(languageCode),
            conferenceSid: req.body?.ConferenceSid,
        });


    } catch (error) {
        logger.error(`Failed to create call record: ${error}`);
    }


    await Promise.all([
        redisClient.del(originCallId),
        redisClient.del(`${originCallId}:departmentCode`),
        redisClient.del(`${originCallId}:languageCode`),
    ]);
});

export const noAnswer = convertMiddlewareToAsync(async (req, res) => {
    const twiml = new VoiceResponse();
    twiml.say({
        language: 'it-IT',
    }, 'Al momento non sono disponibili interpreti per la lingua selezionata.'
    + 'Si prega di riprovare più tardi.');

    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
});
