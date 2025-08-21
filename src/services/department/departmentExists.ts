import { eq, and } from 'drizzle-orm';
import { db } from '../../config/postgres';
import { ClientCode } from '../../models';

interface IArgs {
    phone_number: string;
    client_code: number;
}

export const codeExists = async ({ phone_number, client_code }: IArgs): Promise<boolean> => {
    const result = await db
        .select()
        .from(ClientCode)
        .where(and(
            eq(ClientCode.phone_number, phone_number),
            eq(ClientCode.client_code, Number(client_code))
        ))
        .limit(1);

    return result.length > 0;
};

export const getCode = async ({ phone_number, client_code }: IArgs): Promise<any> => {
    const result = await db
        .select()
        .from(ClientCode)
        .where(and(
            eq(ClientCode.phone_number, phone_number),
            eq(ClientCode.client_code, Number(client_code))
        ))
        .limit(1);

    if (result.length === 0) {
        throw new Error(`Code not found for phone_number ${phone_number} and client_code ${client_code}`);
    }

    return result[0]; // adjust property name if needed
};