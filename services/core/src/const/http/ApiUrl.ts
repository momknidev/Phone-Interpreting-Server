import { vars } from '../../config/vars';

export const CORE_ROOT = vars.isLocal
    ? vars.domain
    : `${vars.env}-${vars.domain}`;

export const API_ROOT = `${CORE_ROOT}/api`;

export const WEBHOOK = `${API_ROOT}/webhook`;

export const TWILIO_WEBHOOK = `${WEBHOOK}/twilio`;
