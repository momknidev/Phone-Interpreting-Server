import { languageCodes } from '../../const/language/languageCodes';

interface IArgs {
    language_code: number,
}

export const getLanguage = ({ language_code }: IArgs) => languageCodes[language_code];
