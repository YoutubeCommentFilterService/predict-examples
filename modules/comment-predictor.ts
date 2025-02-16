import axios from 'axios';
import type { ExtractedComment, PredictResponse, PredictResult, SpamContent } from '../types';
import fs from 'fs';
import appRootPath from 'app-root-path';
import { seperator } from './utils';
import { resourceLimits } from 'worker_threads';

export default class CommentPredictor {
    private serverUrl: string | undefined;
    constructor() {
        this.serverUrl = process.env.SERVER_URL;
    }

    predictComment = async (originDatas: ExtractedComment[], videoId: string, debug: boolean = false): Promise<SpamContent[]> => {
        const predictSpamResults: SpamContent[] = [];
        try {
            const items = originDatas.map((data) => ({
                id: data.id,
                nickname: data.nickname,
                comment: data.translatedText,
            }))
            const response = await axios.post<PredictResponse>(`${this.serverUrl}/predict`, {
                items
            })
            console.log(response.data.model_type);
            response.data.items.forEach((item, idx) => {
                const nick_p = item.nickname_predicted;
                const comm_p = item.comment_predicted;
                const spamFlag = nick_p === '스팸' || comm_p === '스팸'

                const spamResult = {
                    'nickname': originDatas[idx].nickname,
                    'comment': originDatas[idx].originalText,
                    'id': item.id,
                    'profileImage': originDatas[idx].profileImage,
                    'nickname_p': nick_p,
                    'comment_p': comm_p,
                }
                if (spamFlag || debug) {
                    predictSpamResults.push(spamResult)
                }
                // this.saveComment(originDatas[idx], item, videoId);
            })
        } catch (err) {
            if (axios.isAxiosError(err)) console.error(err.response?.data);
            else console.error(err)
        }
        if (predictSpamResults.length > 1) this.saveAsSpam(videoId, predictSpamResults, originDatas);
        return predictSpamResults;
    }

private saveAsSpam = (videoId: string, predictSpamResults: SpamContent[], originDatas: ExtractedComment[]): void => {
        const outputFile = `${appRootPath}/predicts/${videoId}.spam.csv`
        
        fs.writeFileSync(outputFile, '')
        predictSpamResults.forEach((result, idx) => {
            const outputText = `${result.profileImage}\n\t(${result.nickname_p}) - ${result.nickname}\n\t(${result.comment_p}) - ${originDatas[idx].originalText.replaceAll('\r\n', ' ').replaceAll('\n', ' ')}\n\t(${result.comment_p}) - ${originDatas[idx].translatedText}\n`
            fs.appendFileSync(outputFile, outputText);
        })
    }
}