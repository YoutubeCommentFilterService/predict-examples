import axios from 'axios';
import type { FetchedComment, PredictResponse, PredictResult, SpamContent } from '../types';
import fs from 'fs';
import appRootPath from 'app-root-path';
import { seperator } from './utils';

export default class CommentPredictor {
    private serverUrl: string | undefined;
    constructor() {
        this.serverUrl = process.env.SERVER_URL;
    }

    predictComment = async (originDatas: FetchedComment[], videoId: string, debug: boolean = false): Promise<SpamContent[]> => {
        const predictSpamResults: SpamContent[] = [];
        try {
            const items = originDatas.map((data) => ({
                id: data.id,
                nickname: data.nickname,
                comment: data.trimmedText,
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
            console.error(err)
        }
        if (predictSpamResults.length > 1) this.saveAsSpam(predictSpamResults, videoId);
        return predictSpamResults;
    }

    private saveComment = (origin: FetchedComment, predicted: PredictResult, videoId: string): void => {
        const outputFile = `${appRootPath}/predicts/predict-result.${videoId}.csv`

        if (!fs.existsSync(`${appRootPath}/predicts`)) fs.mkdirSync(`${appRootPath}/predicts`)

        const likes = origin.likes;
        const comment = origin.trimmedText;
        const comment_p = predicted.comment_predicted;
        const nickname = origin.nickname;
        const nickname_p = predicted.nickname_predicted;

        const outputText = `${String(likes).padEnd(10, " ")}, ${this.appendPad(nickname, 30)}, ${nickname_p}, ${comment_p}, ${comment}\n`
        fs.appendFileSync(outputFile, outputText);
    }

    private saveAsSpam = (predictSpamResults: SpamContent[], videoId: string): void => {
        const outputFile = `${appRootPath}/predicts/${videoId}.spam.csv`

        if (!fs.existsSync(`${appRootPath}/predicts`)) fs.mkdirSync(`${appRootPath}/predicts`)
        
        fs.appendFileSync(outputFile, `id${seperator}profile_image${seperator}nickname${seperator}comment\n`)
        for (let result of predictSpamResults) {
            const outputText = `${result.id}${seperator}${result.nickname}|(${result.nickname_p})${seperator}${result.comment.replaceAll('\r\n', ' ').replaceAll('\n', ' ')}|(${result.comment_p})\n`
            fs.appendFileSync(outputFile, outputText);
        }
    }

    private appendPad = (str: string, length: number, padChar: string=" "): string => {
        const totalAscii = [...str].filter(c => /[a-zA-Z0-9\.\-_\s]/.test(c)).length;
        const totalNotAscii = str.length - totalAscii;

        let currLength = totalAscii + Math.ceil(totalNotAscii * 1.7)
        if (currLength < length) str = str + padChar.repeat(length - currLength);
        return str;
    }
}