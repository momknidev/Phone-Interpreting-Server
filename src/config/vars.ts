import dotenv from 'dotenv';
import { parseNumber } from '../utils/parsers/parseNumber';
import { parseString } from '../utils/parsers/parseString';
import { parseBoolean } from '../utils/parsers/parseBoolean';

dotenv.config();

export const vars = Object.freeze({
  env: parseString(process.env.NODE_ENV, 'develop'),
  port: parseNumber(process.env.PORT, 8000),
  domain: parseString(process.env.DOMAIN, 'http://localhost:8000'),
  isLocal: parseBoolean(process.env.IS_LOCAL, true),
  secret_key: process.env.SECRET_KEY,
  postgres: {
    host: parseString(process.env.POSTGRES_HOST, 'localhost'),
    port: parseNumber(process.env.POSTGRES_PORT, 5432),
    db: parseString(process.env.POSTGRES_DB, 'phone_interpreter_db'),
    user: parseString(process.env.POSTGRES_USER, 'postgres'),
    password: parseString(process.env.POSTGRES_PASSWORD, 'postgres'),
  },
  redis: {
    uri: parseString(process.env.REDIS_URI, 'redis://redis:6379'),
  },
  twilio: {
    accountSid: parseString(process.env.TWILIO_ACCOUNT_SID, ''),
    authToken: parseString(process.env.TWILIO_AUTH_TOKEN, ''),
  },
  fallbackPhoneNumber: parseString(process.env.FALLBACK_PHONE_NUMBER, ''),
});
