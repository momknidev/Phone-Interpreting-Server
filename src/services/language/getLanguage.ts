import { and, eq } from 'drizzle-orm';
import { db } from '../../config/postgres';
import { Languages, LanguagesTarget } from '../../models';


interface IArgs {
    language_code: number;
    phone_number: string; // Optional for target languages
}
export const getSourceLanguageByNumber = async ({ phone_number }: { phone_number: string }) => {
    return await db
        .select()
        .from(Languages)
        .where(eq(Languages.phone_number, phone_number))
};
export const getTargetLanguageByNumber = async ({ phone_number }: { phone_number: string }) => {
    return await db
        .select()
        .from(LanguagesTarget)
        .where(eq(LanguagesTarget.phone_number, phone_number))

};
// Fetch source language by code
export const getSourceLanguage = async ({ language_code, phone_number }: IArgs) => {
    return await db
        .select()
        .from(Languages)
        .where(and(eq(Languages.language_code, language_code), eq(Languages.phone_number, phone_number)))
        .limit(1)
};

// Check if source language exists
export const sourceLanguageExists = async ({ language_code, phone_number }: IArgs) => {
    const language = await getSourceLanguage({ language_code, phone_number });
    return language !== undefined;
};

// Fetch target language by code
export const getTargetLanguage = async ({ language_code, phone_number }: IArgs) => {
    return await db
        .select()
        .from(LanguagesTarget)
        .where(and(eq(LanguagesTarget.language_code, language_code), eq(LanguagesTarget.phone_number, phone_number)))
        .limit(1)
};

// Check if target language exists
export const targetLanguageExists = async ({ language_code, phone_number }: IArgs) => {
    const language = await getTargetLanguage({ language_code, phone_number });
    return language !== undefined;
};
