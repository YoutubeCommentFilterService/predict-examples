import dotenv from 'dotenv';
import { Services, seperator, resizeStr } from '../modules';
import fs from 'fs';
import type { ChannelInfo, FetchedVideo, SendMailData } from '../types';
import appRootPath from 'app-root-path';
import pLimit from 'p-limit'

dotenv.config({ path: `${appRootPath}/.env` })

let flag
if (process.argv.length !== 3) {
    console.warn('if argv[2] is not provided, "async" process is default')
    flag = 'async'
}
if (!['sync', 'async'].includes(process.argv[2])) {
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
const alreadyPredictedVideo = fs.readFileSync(alreadyPredictedVideoDB, 'utf-8').trim().split('\n').reduce((acc, item) => {
    if (!item) return acc;
    const [baseTime, videoId, title] = item.split(seperator).map(data => data.trim())
    acc[videoId] = { baseTime, title }
    return acc;
}, {} as {[key: string]: {baseTime: string, title: string}});

const emailDB = fs.readFileSync(`${appRootPath}/datas/emails.txt`, 'utf-8').trim().split('\n').map(data => data.trim())
// const canSeekEmailDB = fs.readFileSync(`${appRootPath}/datas/can-find-emails.txt`, 'utf-8').trim().split('\n').map(data => data.trim())
const skipSeekEmailDB = fs.readFileSync(`${appRootPath}/datas/skip-emails.txt`, 'utf-8').trim().split('\n').map(data => data.trim())

const mailDB = new Services.MailDB(emailDB);
// const canSeekMailDB = new Services.MailDB(canSeekEmailDB)
const skipSeekMailDB = new Services.MailDB(skipSeekEmailDB)

const videoFetcher = new Services.VideoFetcher();
const commentFetcher = new Services.CommentFetcher();
const commentPredictor = new Services.CommentPredictor();
const mailerService = new Services.MailerService();

const videoFetchProcessLimit = pLimit(1)

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

console.time('fetch - promise')
let fetchedVideosList: FetchedVideo[] = (await Promise.all(
    categories.map(categoryId => videoFetchProcessLimit(() => videoFetcher.fetchVideoByCategoryId(categoryId, 50, false, 1, notFetchFilter)))
)).flat();
console.timeEnd('fetch - promise')

let fetchedVideosSet = Array.from(new Map(fetchedVideosList.map(video => [video.id, video])).values().filter(video => !skipSeekMailDB.existUser(video.channelId)))
fetchedVideosList = null as any;

// 메일 DB에 없다면 찾아야 할 것으로 넣기
const toSearchEmailTxt = `${appRootPath}/datas/to-search-emails.txt`
fs.writeFileSync(toSearchEmailTxt, `${"id".padEnd(24, ' ')}, email\n`, 'utf-8');
[...new Set(fetchedVideosSet.map(video => video.channelId))].forEach(channelId => {
    if (mailDB.getEmail(channelId) || skipSeekMailDB.existUser(channelId)) return
    fs.appendFileSync(toSearchEmailTxt, `${channelId}, \n`, 'utf-8')
})

// 동영상의 댓글 가져오고 추론하기
const predictedVideoFormat: string[] = []
const predictDebugFlag = false

const totalPredictStart = performance.now()

flag = flag || process.argv[2]
if (flag === 'sync') {
    for (let [index, video] of fetchedVideosSet.entries()) {
        console.log(`${new String(index + 1).padEnd(3, ' ')} / ${fetchedVideosSet.length} = fetch ${video.id}'s comment - ${video.title}(${video.categoryId})`)
        const fetchCommentsStart = performance.now()
        let {comments, lastSearchTime} = await commentFetcher.fetchCommentsByVideoId(video.id, 100, alreadyPredictedVideo[video.id]?.baseTime);
        const fetchCommentsEnd = performance.now() - fetchCommentsStart
        predictedVideoFormat.push(`${lastSearchTime}${seperator}${video.id}${seperator}${video.title}`)
        comments = comments.filter(comment => getKoreanRatio(comment.translatedText) > 20 && comment.translatedText.length > 4)
    
        if (comments.length === 0) continue; // 403, 즉 동영상이 댓글을 닫은 경우
                                             // 400, 즉 동영상에 댓글이 없는 경우(거의 없긴 하다)
    
        const predictCommentsStart = performance.now()
        const predictedAsSpam = await commentPredictor.predictComment(comments, video.id, predictDebugFlag);
        const predictCommentsEnd = performance.now() - predictCommentsStart
    
        console.log(`${new String(index + 1).padEnd(3, ' ')} / ${fetchedVideosSet.length} = fetch(${comments.length}): ${Math.floor(fetchCommentsEnd) / 1000}s predict: ${Math.floor(predictCommentsEnd) / 1000}s`)
    
        if (predictedAsSpam.length === 0) continue; // 스팸으로 판명된 것이 없음
        // 이메일 DB에 이메일이 없다면? 이메일 없음으로 이동
        const email = mailDB.getEmail(video.channelId);
        if (!email) {
            const originalPredictedFile = `${appRootPath}/predicts/${video.id}.spam.txt`;
            const noEmailPredictedFile = `${appRootPath}/email-not-found/${video.channelId}.${video.id}.spam.txt`;
            if (fs.existsSync(originalPredictedFile)) fs.rename(originalPredictedFile, noEmailPredictedFile, (err) => {
                if (err) console.error(err)
            });
            continue
        }
        // 메일 보내기
        const mailData: SendMailData = {
            video: {
                id: video.id,
                title: video.title,
            },
            comments: predictedAsSpam
        }
        await mailerService.sendMail(email, mailData);
        // await mailerService.sendMail('gkstkdgus821@gmail.com', mailData);
        const beforeSpamFile = `${appRootPath}/predicts/${video.id}.spam.txt`;
        const sentSpamFile = `${appRootPath}/predicts-sent/${video.id}.spam.txt`;
        if (fs.existsSync(beforeSpamFile)) fs.rename(beforeSpamFile, sentSpamFile, (err) => {
            if (err) console.error(err)
        });
    }
} else if (process.argv[2] === 'async') {
    const predictCommentProcessLimit = pLimit(5) // 10 이상부터는 크게 차이가 없고, 5로도 충분하다.

    const predictCommentPromises = fetchedVideosSet.map((video, index) => {
        return predictCommentProcessLimit(async () => {
            console.log(`${new String(index + 1).padEnd(3, ' ')} / ${fetchedVideosSet.length} = fetch ${video.id}'s comment - ${video.title}(${video.categoryId})`)
            const fetchCommentsStart = performance.now()
            let {comments, lastSearchTime} = await commentFetcher.fetchCommentsByVideoId(video.id, 100, alreadyPredictedVideo[video.id]?.baseTime);
            const fetchCommentsEnd = performance.now() - fetchCommentsStart
            predictedVideoFormat.push(`${lastSearchTime}${seperator}${video.id}${seperator}${video.title}`)
            comments = comments.filter(comment => getKoreanRatio(comment.translatedText) > 20 && comment.translatedText.length > 4)
        
            if (comments.length === 0) return; // 403, 즉 동영상이 댓글을 닫은 경우
                                                 // 400, 즉 동영상에 댓글이 없는 경우(거의 없긴 하다)
        
            const predictCommentsStart = performance.now()
            const predictedAsSpam = await commentPredictor.predictComment(comments, video.id, predictDebugFlag);
            const predictCommentsEnd = performance.now() - predictCommentsStart
        
            console.log(`${new String(index + 1).padEnd(3, ' ')} / ${fetchedVideosSet.length} = fetch(${comments.length}): ${Math.floor(fetchCommentsEnd) / 1000}s predict: ${Math.floor(predictCommentsEnd) / 1000}s`)
        
            if (predictedAsSpam.length === 0) return; // 스팸으로 판명된 것이 없음
            // 이메일 DB에 이메일이 없다면? 이메일 없음으로 이동
            const email = mailDB.getEmail(video.channelId);
            if (!email) {
                const originalPredictedFile = `${appRootPath}/predicts/${video.id}.spam.txt`;
                const noEmailPredictedFile = `${appRootPath}/email-not-found/${video.channelId}.${video.id}.spam.txt`;
                if (fs.existsSync(originalPredictedFile)) fs.rename(originalPredictedFile, noEmailPredictedFile, (err) => {
                    if (err) console.error(err)
                });
                return
            }
            // 메일 보내기
            const mailData: SendMailData = {
                video: {
                    id: video.id,
                    title: video.title,
                },
                comments: predictedAsSpam
            }
            await mailerService.sendMail(email, mailData);
            // await mailerService.sendMail('gkstkdgus821@gmail.com', mailData);
            const beforeSpamFile = `${appRootPath}/predicts/${video.id}.spam.txt`;
            const sentSpamFile = `${appRootPath}/predicts-sent/${video.id}.spam.txt`;
            if (fs.existsSync(beforeSpamFile)) fs.rename(beforeSpamFile, sentSpamFile, (err) => {
                if (err) console.error(err)
            });
        })
    })
    
    await Promise.all(predictCommentPromises)
}
console.log(`predict total ${Math.floor(performance.now() - totalPredictStart) / 1000}s`)

fs.writeFileSync(alreadyPredictedVideoDB, predictedVideoFormat.join('\n'), 'utf-8')
