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
        const predictCommonResults: { [key: string]: string[]} = {
            'normal': [],
            'rank': [],
            'beg': [],
            'nsee': [],
        }
        try {
            const items = originDatas.map((data) => ({
                id: data.id,
                nickname: data.nickname,
                comment: data.translatedText,
            }))

            const response = await axios.post<PredictResponse>(`${this.serverUrl}/predict`, {
                items
            })

            const data = response.data
            const comment_categories = data.comment_categories;
            const nickname_categories = data.nickname_categories;
            data.items.forEach((item, idx) => {
                const nickname_predicted = item.nickname_predicted;
                const comment_predicted = item.comment_predicted;
                const spamFlag = nickname_predicted === '스팸' || comment_predicted === '스팸'
                const rankFlag = nickname_predicted === '정상' && comment_predicted === '순위'
                const begFlag = nickname_predicted === '정상' && comment_predicted === '구걸'
                const nSeeFlag = nickname_predicted === '정상' && comment_predicted === '안봄'

                const nickname_prob = item.nickname_predicted_prob.map((data, idx) => `${nickname_categories[idx]}(${String(Math.floor(data*100)).padStart(3, ' ')}%)`).join(', ')
                const comment_prob = item.comment_predicted_prob.map((data, idx) => `${comment_categories[idx]}(${String(Math.floor(data*100)).padStart(3, ' ')}%)`).join(', ')

                const comment = originDatas[idx].originalText

                const spamResult = {
                    'nickname': originDatas[idx].nickname,
                    'comment': comment,
                    'id': item.id,
                    'profileImage': originDatas[idx].profileImage,
                    nickname_predicted,
                    comment_predicted,
                    nickname_prob,
                    comment_prob
                }
                if (spamFlag) predictSpamResults.push(spamResult)
                else if (debug) {
                    const crToSpace = comment.replace(/\r/g, '').replace(/\n/g, '   ')
                    const removeGolbangE = originDatas[idx].nickname.substring(1)
                    const writeData = `${nickname_prob}, ${removeGolbangE}\n\t${comment_prob}, ${crToSpace}`
                    if (rankFlag) predictCommonResults['rank'].push(writeData)
                    else if (begFlag) predictCommonResults['beg'].push(writeData)
                    else if (nSeeFlag) predictCommonResults['nsee'].push(writeData)
                    else predictCommonResults['normal'].push(writeData)
                }
            })
        } catch (err) {
            if (axios.isAxiosError(err)) console.error(err.response?.data);
            else console.error(err)
        }
        if (predictSpamResults.length > 0) this.saveAsSpam(videoId, predictSpamResults);
        Object.keys(predictCommonResults).forEach(key => {
            if (predictCommonResults[key].length > 0) this.saveCommonResult(key, videoId, predictCommonResults[key])
        })
        return predictSpamResults;
    }

    private saveAsSpam = (videoId: string, predictSpamResults: SpamContent[]): void => {
        const fname = `${appRootPath}/predicts/${videoId}.spam.txt`
        const writeData = predictSpamResults.map(result => `${result.profileImage}\n\t(${result.nickname_predicted}), ${result.nickname_prob} - ${result.nickname}\n\t${result.comment_prob} - ${result.comment.replaceAll('\r\n', ' ').replaceAll('\n', ' ')}`).join('\n')
        fs.writeFileSync(fname, writeData + '\n')
    }

    private saveCommonResult = (type: string, videoId: string, datas: string[]): void => {
        const fname = `${appRootPath}/predicts/${videoId}.${type}.txt`
        const writeData = datas.join('\n')
        fs.writeFile(fname, writeData, (err) => {
            if (err) console.error(err)
        })
    }
}