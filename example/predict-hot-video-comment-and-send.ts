import dotenv from 'dotenv';
import { Services, seperator } from '../modules';
import fs from 'fs/promises';
import type { FetchedVideo, PredictResult, PredictResultStastic, SpamPredictResult } from '../types';
import appRootPath from 'app-root-path';
import pLimit from 'p-limit'
import axios from 'axios';
import { exec as execCallback } from 'child_process'
import { promisify } from 'util';
import path from 'path';
import { generateMailDataV2 } from '../modules/generate-mail-data';

const exec = promisify(execCallback)
const { stdout, stderr } = await exec('sudo yt-dlp -U')
console.log(stderr)

dotenv.config({ path: `${appRootPath}/env/.env` })

const dateDiff = 5;
const includeShortsVideo = true;
const predictDebugFlag = true

try {
    await axios.get(`${process.env.PREDICT_SERVER_URL}/status`, {
        timeout: 1000,
    });
} catch (err) {
    console.error('server not connected')
    process.exit(-1)
}

let flag
if (process.argv.length !== 3) {
    console.warn('if argv[2] is not provided, "async" process is default')
    flag = 'async'
}
else if (!['sync', 'async'].includes(process.argv[2])) {
    console.error('parameter is "async" or "sync"')
    process.exit(-1)
}

const imojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1FAFF}]|[\u{2600}-\u{26FF}]/gu
const trimRegex = /[\s]/g
const koreanRegex = /[가-힣ㄱ-ㅎㅏ-ㅣ0-9]/g

const getKoreanRatio = (text: string): number => {
    const cleanedText = text.replace(trimRegex, '');
    const imojis = cleanedText.match(imojiRegex);
    // 이모지가 많은 경우 그냥 원본을 쓰자. 저렇게 병적으로 쓰는 경우는 거의 없다.
    if (imojis && imojis.length / cleanedText.length * 100 > 40) return 100;
    const koreans = cleanedText.match(koreanRegex);
    if (!koreans) return 0;
    return koreans.length / cleanedText.length * 100;
}

const alreadyPredictedVideoDB = `${appRootPath}/datas/already-predicted.txt`

const alreadyPredictedVideo = (await fs.readFile(alreadyPredictedVideoDB, 'utf-8')).trim().split('\n').reduce((acc, item) => {
    if (!item) return acc;
    const [baseTime, videoId, title] = item.split(seperator).map(data => data.trim())
    acc[videoId] = { baseTime, title }
    return acc;
}, {} as {[key: string]: {baseTime: string, title: string}});


const emailDBTxt = (await fs.readFile(`${appRootPath}/datas/emails.txt`, 'utf-8')).trim().split('\n').map(data => data.trim())
const skipEmailDBTxt = (await fs.readFile(`${appRootPath}/datas/skip-emails.txt`, 'utf-8')).trim().split('\n').map(data => data.trim())

const mailDB = new Services.MailDB(emailDBTxt);
const skipMailDB = new Services.MailDB(skipEmailDBTxt)

const videoFetcher = new Services.VideoFetcher();
const commentFetcher = new Services.CommentFetcher();
const commentPredictor = new Services.CommentPredictor();
const mailerService = new Services.MailerService();


// 댓글을 가져오지 않을 것들 설정 - 실급동에서만 제거하면 무방할거같긴 한데... 모르겠고 전체로 실행
const notFetchFilter: {categoryId: (number | string)[], title: string[]} = {
    categoryId: ['10', '25', '17', '24'], // 10: music, 25: 정치/뉴스, 17: 스포츠, 24: 엔터테인먼트
    title: ['직캠', 'm/v', 'mv', '#shorts', 'music video', '트롯', 'en', 'sub'] // 자막이 있으면 외국어 댓글이 많다. 금전적 이슈 때문에라도 일단 pass
}

// 카테고리별 인급동 가져오기
// 0  // 기본값         - 200       => 4
// 1  // 애니메이션		- 200		=> 4
// 15 // 동물			- 200		=> 4
// 20 // 게임			- 94(100)	=> 2
// 22 // 인물/블로그	- 22(50)	=> 1
// 23 // 코미디			- 200		=> 4
// 24 // 엔터테인먼트	- 200		=> 4
// 26 // 노하우/스타일	- 200		=> 4
// 28 // 과학기술		- 100		=> 2
const categories: (number | string)[] = [0, 15, 20, 22, 23, 26, 28]

const videoFetchProcessLimit = pLimit(categories.length)
console.time('fetch - promise')
let fetchedVideosList: FetchedVideo[] = (await Promise.all(
    categories.map(categoryId => videoFetchProcessLimit(() => videoFetcher.fetchVideoByCategoryId(categoryId, 50, includeShortsVideo, dateDiff, notFetchFilter)))
)).flat();
console.timeEnd('fetch - promise')

let fetchedVideosSet = Array.from(new Map(fetchedVideosList.map(video => [video.id, video])).values().filter(video => !skipMailDB.existUser(video.channelId)))
fetchedVideosList = null as any;

// 메일 DB에 없다면 찾아야 할 것으로 넣기
const toSearchEmailTxt = `${appRootPath}/datas/to-search-emails.txt`
await fs.writeFile(toSearchEmailTxt, `${"id".padEnd(24, ' ')}, email\n`, 'utf-8');
for (const channelId of [...new Set(fetchedVideosSet.map(video => video.channelId))]) {
    if (mailDB.getEmail(channelId) || skipMailDB.existUser(channelId)) continue
    await fs.appendFile(toSearchEmailTxt, `${channelId}, \n`, 'utf-8')
}

// 동영상의 댓글 가져오고 추론하기
const predictedVideoFormat: {[key: string]: {baseTime: string, title: string}} = {}


const predictRootDir = path.join(appRootPath.path, 'predict-results')
const buildFilePath = (videoId: string, category: string, size: number) => {
    const fileName = `${videoId}.${category}.${size.toString().padStart(4, '0')}.txt`
    return {
        before: path.join(predictRootDir, 'predicts', fileName),
        sent: path.join(predictRootDir, 'predicts-sent', fileName),
        emailNotFound: path.join(predictRootDir, 'email-not-found', fileName),
    }
}

const predictCommentFunc = async (index: number, video: FetchedVideo, predictDebugFlag: boolean) => {
    const { id: videoId, title: videoTitle } = video
    console.log(`${new String(index + 1).padEnd(3, ' ')} / ${fetchedVideosSet.length} = fetch ${videoId}'s comment - ${videoTitle}(${video.categoryId})`)

    const fetchCommentsStart = performance.now()
    let {comments, lastSearchTime} = await commentFetcher.fetchCommentsByVideoId(videoId, video.channelId, 100, alreadyPredictedVideo[videoId]?.baseTime);
    const fetchCommentsEnd = performance.now() - fetchCommentsStart

    predictedVideoFormat[videoId] = {
        baseTime: lastSearchTime,
        title: videoTitle,
    }

    comments = comments.filter(comment => getKoreanRatio(comment.translatedText) > 20 && comment.translatedText.length > 4)
    if (comments.length === 0) return { video }

    const predictCommentsStart = performance.now()
    const predictResult = await commentPredictor.predictComment(comments, videoId, predictDebugFlag);
    const predictCommentsEnd = performance.now() - predictCommentsStart

    console.log(`${new String(index + 1).padEnd(3, ' ')} / ${fetchedVideosSet.length} = fetch(${comments.length}): ${Math.floor(fetchCommentsEnd) / 1000}s predict: ${Math.floor(predictCommentsEnd) / 1000}s`)
    if (predictResult.result.length === 0) return { video }

    return {
        video: video,
        result: predictResult
    }
}

const sendSpamPredictedEmail = async (predictedData: PredictResult) => {
    const commentPredicted = predictedData.result?.result.filter(data => data.commentPredicted === '스팸') || []
    if (!predictedData.result || commentPredicted.length === 0) return
    const mailDataV2 = generateMailDataV2(predictedData.video, commentPredicted)
    mailDataV2.statistics = predictedData.result!.statistic
    await mailerService.sendMail('gkstkdgus821@gmail.com', mailDataV2, 'v2')
    return
    const emails = mailDB.getEmail(predictedData.video.channelId);
    for (const email of emails) {
        await mailerService.sendMail(email, mailDataV2, 'v2');
    }
}

const moveFiles = async(channelId: string, videoId: string, statistic: PredictResultStastic) => {
    const spamPath = buildFilePath(videoId, 'spam', statistic.spam || 0)

    const emails = mailDB.getEmail(channelId);
    const targets = [spamPath].map(p => 
        fs.rename(
            p.before, 
            emails ? p.sent : p.emailNotFound
        ).catch((err: any) => {
            if (err.code !== 'ENOENT') console.error(err)
        })
    )
    await Promise.all(targets);
}

const totalPredictStart = performance.now()

flag = flag || process.argv[2]
const predictCommentResults: PredictResult[] = [];
if (flag === 'sync') {
    for (let [index, video] of fetchedVideosSet.entries()) {
        predictCommentResults.push(await predictCommentFunc(index, video, predictDebugFlag))
    }
} else if (flag === 'async') {
    const predictCommentProcessLimit = pLimit(5) // 10 이상부터는 크게 차이가 없고, 5로도 충분하다.
    const predictCommentPromises = fetchedVideosSet.map((video, index) =>
        predictCommentProcessLimit(() => predictCommentFunc(index, video, predictDebugFlag))
    )
    
    predictCommentResults.push(...await Promise.all(predictCommentPromises))
}
console.log(`predict total ${Math.floor(performance.now() - totalPredictStart) / 1000}s`)

await Promise.all(predictCommentResults.map(result => 
    moveFiles(result.video.channelId, result.video.id, result.result?.statistic || {})
))

// const emailPLimit = pLimit(10)
// await Promise.all(
//     predictCommentResults
//         .filter(result => result.result)
//         .map(result => emailPLimit(() => sendSpamPredictedEmail(result)))
// )

// 이미 추론한 것들을 저장해야할까? 삭제 안했을수도 있지 않을까?
Object.assign(alreadyPredictedVideo, predictedVideoFormat);
const writeData = Object.entries(alreadyPredictedVideo)
    .map(([key, val]) => `${val.baseTime}${seperator}${key}${seperator}${val.title}`)

await fs.writeFile(alreadyPredictedVideoDB, writeData.join('\n'), 'utf-8')

// 혹시나 옮겨지지 못한 spam data가 있을 수 있으니 옮긺

const predictedFilePath = path.join(predictRootDir, 'predicts')
const spamFilePath = path.join(predictRootDir, 'email-not-found')
const spamfileRegex = /\.(?:spam|poli)\./;
let promises = (await fs.readdir(predictedFilePath, { encoding: 'utf-8' }))
    .filter(filename => spamfileRegex.test(filename))
    .map(filename => fs.rename(
        path.join(predictedFilePath, filename),
        path.join(spamFilePath, filename)
    ))
await Promise.all(promises)
console.log('normal file count: ', (await fs.readdir(predictedFilePath)).length)

await import(`${appRootPath}/datas/find-emails`)