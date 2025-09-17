import { eq, and } from 'drizzle-orm';
import { db } from '../../config/postgres';
import { ClientCode } from '../../models';
import { logger } from '../../config/logger';

interface IArgs {
  phone_number_id: string;
  client_code: number;
}

export const codeExists = async ({
  phone_number_id,
  client_code,
}: IArgs): Promise<boolean> => {
  const result = await db
    .select()
    .from(ClientCode)
    .where(
      and(
        eq(ClientCode.phone_number_id, phone_number_id),
        eq(ClientCode.client_code, Number(client_code)),
      ),
    )
    .limit(1);

  return result.length > 0;
};

export const getCode = async ({
  phone_number_id,
  client_code,
}: IArgs): Promise<any> => {
  const result = await db
    .select()
    .from(ClientCode)
    .where(
      and(
        eq(ClientCode.phone_number_id, phone_number_id),
        eq(ClientCode.client_code, Number(client_code)),
      ),
    )
    .limit(1);

  if (result.length === 0) {
    logger.warn(
      `Code not found for phone_number_id ${phone_number_id} and client_code ${client_code}`,
    );
    return null;
  }

  return result[0]; // adjust property name if needed
};
