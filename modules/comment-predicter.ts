import axios from 'axios';
import type { FetchedComment, PredictResponse, PredictResult, SpamContent } from '../types';
import fs from 'fs';
import appRootPath from 'app-root-path';

export default class CommentPredicter {
    private serverUrl: string | undefined;
    constructor() {
        this.serverUrl = process.env.SERVER_URL;
    }

    predictComment = async (originDatas: FetchedComment[], videoId: string): Promise<SpamContent[]> => {
        const predictSpamResults: SpamContent[] = [];
        try {
            const items = originDatas.map((data) => ({
                id: data.id,
                nickname: data.nickname,
                comment: data.trimmedText,
            }))
            const response = await axios.post<PredictResponse>(`${this.serverUrl}/predict/batch`, {
                items
            })
            response.data.items.forEach((item, idx) => {
                const nick_p = item.nickname_predicted;
                const comm_p = item.comment_predicted;
                if (nick_p === '스팸' || comm_p === '스팸') {
                    predictSpamResults.push({
                        'nickname': originDatas[idx].nickname,
                        'comment': originDatas[idx].originalText,
                        'id': item.id,
                        'profileImage': originDatas[idx].profileImage,
                        'nickname_p': nick_p,
                        'comment_p': comm_p,
                    })
                }
                // this.saveComment(originDatas[idx], item, videoId);
            })
        } catch (err) {
            console.log(err)
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
        const outputFile = `${appRootPath}/predicts/predict-result.${videoId}.spam.csv`

        if (!fs.existsSync(`${appRootPath}/predicts`)) fs.mkdirSync(`${appRootPath}/predicts`)
        
        fs.appendFileSync(outputFile, 'id,profile_image,nickname,comment\n')
        for (let result of predictSpamResults) {
            const outputText = `${result.id},${result.profileImage},${result.nickname}|(${result.nickname_p}),${result.comment.replaceAll('\r\n', ' ').replaceAll('\n', ' ')}|(${result.comment_p})\n`
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