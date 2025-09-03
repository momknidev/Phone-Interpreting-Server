import { Router } from 'express';
import * as controller from './controller';

const twilioRouter = Router();

twilioRouter.post('/call', controller.call);
twilioRouter.post('/requestCode', controller.requestCode);

twilioRouter.post('/validateCode', controller.validateCode);

twilioRouter.post('/requestSourceLanguage', controller.requestSourceLanguage);

twilioRouter.post('/validateSourceLanguage', controller.validateSourceLanguage);
twilioRouter.post('/requestTargetLanguage', controller.requestTargetLanguage);

twilioRouter.post('/validateTargetLanguage', controller.validateTargetLanguage);

twilioRouter.post('/callInterpreter', controller.callInterpreter);

twilioRouter.post('/machineDetectionResult', controller.machineDetectionResult);

twilioRouter.post('/callStatusResult', controller.callStatusResult);

twilioRouter.post('/conferenceStatusResult', controller.conferenceStatusResult);

twilioRouter.post('/noAnswer', controller.noAnswer);
twilioRouter.post('/creditExhausted', controller.creditExhausted);

export { twilioRouter };
