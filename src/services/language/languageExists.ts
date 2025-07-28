import { languageCodes } from '../../const/language/languageCodes';

interface IArgs {
    language_code: number,
}

export const languageExists = ({ language_code }: IArgs) => languageCodes[language_code] !== undefined;
