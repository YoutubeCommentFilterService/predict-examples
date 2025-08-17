import axios from 'axios';
import type { ExtractedComment, PredictResponse, PredictResult, SpamContent, SpamPredictResult, SpamResult } from '../types';
import fs from 'fs';
import appRootPath from 'app-root-path';

export default class CommentPredictor {
    private serverUrl: string | undefined;
    private typeMap: { [key: string]: string } = {
        '순위': 'rank',
        '구걸': 'beg',
        '안봄': 'nsee',
        '요청/질문': 'rq',
        '정치/비난': 'poli',
    }
    constructor() {
        this.serverUrl = process.env.PREDICT_SERVER_URL;
    }

    predictComment = async (originDatas: ExtractedComment[], videoId: string, debug: boolean = false): Promise<SpamPredictResult> => {
        const predictSpamResults: SpamContent[] = [];
        const predictResults: { [key: string]: string[]} = {
            'normal': [],
            'rank': [],
            'beg': [],
            'nsee': [],
            'spam': [],
            'rq': [],
            'poli': [],
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
                const isSpamContent = nicknamePredicted === '스팸' || commentPredicted === '스팸'
                const dictKey = isSpamContent ? 'spam' : this.typeMap[commentPredicted] || 'normal'
                const isPoliticOrblameContent = dictKey === 'poli'

                const nicknameProb = item.nickname_predicted_prob.map((data, idx) => `${nicknameCategories[idx]}(${String(Math.floor(data*100)).padStart(3, ' ')}%)`).join(', ')
                const commentProb = item.comment_predicted_prob.map((data, idx) => `${commentCategories[idx]}(${String(Math.floor(data*100)).padStart(3, ' ')}%)`).join(', ')

                const comment = originDatas[idx].originalText

                const crToSpace = comment.replace(/\r/g, '').replace(/\n/g, '  ')
                const writeData = `${originDatas[idx].profileImage}\n\t${originDatas[idx].nickname} - ${originDatas[idx].likes}, https://youtube.com/${originDatas[idx].nickname}\n\t${nicknameProb}\n\t${commentProb}\n\t${crToSpace}`
                predictResults[dictKey].push(writeData);
                if (isSpamContent || isPoliticOrblameContent) {
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
                    predictSpamResults.push(spamResult)
                }
            })
        } catch (err) {
            if (axios.isAxiosError(err)) console.error(err.response?.data);
            else console.error(err)
        }
        Object.keys(predictResults).forEach(key => {
            if (!debug && !(key === 'spam' || key === 'poli')) return;
            if (predictResults[key].length > 0) this.saveResult(key, videoId, predictResults[key])
        })
        const spamPredictResult: SpamPredictResult = {
            result: predictSpamResults,
            statistic: {
                total: originDatas.length || 0,
                spam: Object.values(predictResults['spam']).length || 0,
                politic: Object.values(predictResults['poli']).length || 0
            }
        }
        return spamPredictResult;
    }

    private saveResult = (type: string, videoId: string, datas: string[]): void => {
        const fname = `${appRootPath}/predict-results/predicts/${videoId}.${type}.txt`
        const writeData = datas.join('\n')
        fs.writeFile(fname, writeData, (err) => {
            if (err) console.error(err)
        })
    }
}