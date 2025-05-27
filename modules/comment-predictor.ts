import axios from 'axios';
import type { ExtractedComment, PredictResponse, PredictResult, SpamContent, SpamResult } from '../types';
import fs from 'fs';
import appRootPath from 'app-root-path';

export default class CommentPredictor {
    private serverUrl: string | undefined;
    constructor() {
        this.serverUrl = process.env.PREDICT_SERVER_URL;
    }

    predictComment = async (originDatas: ExtractedComment[], videoId: string, debug: boolean = false): Promise<SpamContent[]> => {
        const predictSpamResults: SpamContent[] = [];
        const predictResults: { [key: string]: string[]} = {
            'normal': [],
            'rank': [],
            'beg': [],
            'nsee': [],
            'spam': [],
            'rq': [],
        }
        try {
            const items = originDatas.map((data) => ({
                nickname: data.nickname,
                comment: data.translatedText,
            }))
            const { data } = await axios.post<PredictResponse>(`${this.serverUrl}/predict`, { items })
            const { comment_categories: commentCategories, nickname_categories: nicknameCategories } = data;

            // 좀 더 안정적이려면 id를 비교해서 가져오는게 최고.
            // 하지만 요청때 데이터를 추론하기 때문에 크게 문제가 없을 것이다..!
            data.items.forEach((item, idx) => {
                const { nickname_predicted: nicknamePredicted, comment_predicted: commentPredicted } = item;
                const isSpamComment = nicknamePredicted === '스팸' || commentPredicted === '스팸'
                const isNormalNickname = nicknamePredicted === '정상'
                const isRankComment = isNormalNickname && commentPredicted === '순위'
                const isBegComment = isNormalNickname && commentPredicted === '구걸'
                const isNSeeComment = isNormalNickname && commentPredicted === '안봄'
                const isReQuest = isNormalNickname && commentPredicted === '요청/질문'

                const nicknameProb = item.nickname_predicted_prob.map((data, idx) => `${nicknameCategories[idx]}(${String(Math.floor(data*100)).padStart(3, ' ')}%)`).join(', ')
                const commentProb = item.comment_predicted_prob.map((data, idx) => `${commentCategories[idx]}(${String(Math.floor(data*100)).padStart(3, ' ')}%)`).join(', ')

                const comment = originDatas[idx].originalText

                const spamResult = {
                    nickname: originDatas[idx].nickname,
                    comment,
                    id: originDatas[idx].id,
                    profileImage: originDatas[idx].profileImage,
                    nicknamePredicted,
                    commentPredicted,
                    nicknameProb,
                    commentProb,
                    parentId: originDatas[idx].parentId,
                    updatedAt: new Date(originDatas[idx].updatedAt).toLocaleString('ko-KR', { "timeZone": "Asia/Seoul"})
                } as SpamContent;
                
                const crToSpace = comment.replace(/\r/g, '').replace(/\n/g, '  ')
                const writeData = `${originDatas[idx].profileImage}\n\t${originDatas[idx].nickname} - ${originDatas[idx].likes}, https://youtube.com/${originDatas[idx].nickname}\n\t${nicknameProb}\n\t${commentProb}\n\t${crToSpace}`
                if (isSpamComment) {
                    predictResults['spam'].push(writeData)
                    predictSpamResults.push(spamResult)
                }
                else if (debug) {
                    if (isRankComment) predictResults['rank'].push(writeData)
                    else if (isBegComment) predictResults['beg'].push(writeData)
                    else if (isNSeeComment) predictResults['nsee'].push(writeData)
                    else if (isReQuest) predictResults['rq'].push(writeData)
                    else predictResults['normal'].push(writeData)
                }
            })
        } catch (err) {
            if (axios.isAxiosError(err)) console.error(err.response?.data);
            else console.error(err)
        }
        Object.keys(predictResults).forEach(key => {
            if (!debug && key !== "spam") return;
            if (predictResults[key].length > 0) this.saveResult(key, videoId, predictResults[key])
        })
        return predictSpamResults;
    }

    private saveResult = (type: string, videoId: string, datas: string[]): void => {
        const fname = `${appRootPath}/predict-results/predicts/${videoId}.${type}.txt`
        const writeData = datas.join('\n')
        fs.writeFile(fname, writeData, (err) => {
            if (err) console.error(err)
        })
    }
}