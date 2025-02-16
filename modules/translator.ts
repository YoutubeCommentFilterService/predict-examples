import { Translate } from "@google-cloud/translate/build/src/v2";

export default class Translator {
    private google_project_id: string | undefined;
    private translator: Translate;
    constructor() {
        this.google_project_id = process.env.GOOGLE_PROJECT_ID
        this.translator = new Translate({projectId: this.google_project_id})
    }

    translate = async(text: string, destLang: string = "ko"): Promise<string> => {
        const [result] = await this.translator.translate(text, destLang);
        return result;
    }
}