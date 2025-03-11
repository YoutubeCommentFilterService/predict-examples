import dotenv from 'dotenv';
import { Services, seperator, resizeStr } from '../modules';
import fs from 'fs';
import type { FetchedVideo, MailDataTree, SendMailData, SendMailDataV2, SpamContent } from '../types';
import appRootPath from 'app-root-path';
import pLimit from 'p-limit'

dotenv.config({ path: `${appRootPath}/env/.env` })

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
const predictedVideoFormat: {[key: string]: {baseTime: string, title: string}} = {}

const generateMailData = (videoInfo: FetchedVideo, spamContent: SpamContent[]): SendMailData => {
    return {
        video: {
            id: videoInfo.id,
            title: videoInfo.title,
            thumbnail: videoInfo.thumbnail
        }, 
        comments: spamContent
    }
}

const generateMailDataV2 = (videoInfo: FetchedVideo, spamComments: SpamContent[]): SendMailDataV2 => {
    const printMailDataV2Tree = (mailData: MailDataTree) => {
        Object.entries(mailData).forEach(([key, val]) => {
            const {root, items} = val;
            console.log(root.id, root.comment.replace(/\r/g, '').replace(/\n/g, ' '))
            items.forEach(item => {
                console.log('\t', item.id, item.parentId, item.comment.replace(/\r/g, '').replace(/\n/g, ' '))
            })
        })
    }
    spamComments.sort((a, b) => a.parentId.length - b.parentId.length)
    const mailDataTree: MailDataTree = {}
    const parentIds: string[] = [...new Set(spamComments.map(spamComment => spamComment.id.startsWith('U') ? spamComment.id : '').filter(id => id !== ''))]
    spamComments.forEach(data => {
        if (data.parentId === '') {
            mailDataTree[data.id] = {
                root: data,
                items: []
            }
        } else {
            if (parentIds.includes(data.parentId)) {
                mailDataTree[data.parentId].items.push(data)
            } else {
                mailDataTree[data.id] = {
                    root: data,
                    items: []
                }
            }
        }
    })
    // printMailDataV2Tree(mailDataTree);
    return {
        video: {
            id: videoInfo.id,
            title: videoInfo.title,
            thumbnail: videoInfo.thumbnail,
        },
        comments: mailDataTree
    }
}

const predictCommentFunc = async (index: number, video: FetchedVideo, predictDebugFlag: boolean) => {
    const { id: videoId, title: videoTitle, channelId } = video
    console.log(`${new String(index + 1).padEnd(3, ' ')} / ${fetchedVideosSet.length} = fetch ${videoId}'s comment - ${videoTitle}(${video.categoryId})`)

    const fetchCommentsStart = performance.now()
    let {comments, lastSearchTime} = await commentFetcher.fetchCommentsByVideoId(videoId, video.channelId, 100, alreadyPredictedVideo[videoId]?.baseTime);
    const fetchCommentsEnd = performance.now() - fetchCommentsStart

    predictedVideoFormat[videoId] = {
        baseTime: lastSearchTime,
        title: videoTitle,
    }
    comments = comments.filter(comment => getKoreanRatio(comment.translatedText) > 20 && comment.translatedText.length > 4)
    if (comments.length === 0) return; // 403, 즉 동영상이 댓글을 닫은 경우
                                         // 400, 즉 동영상에 댓글이 없는 경우(거의 없긴 하다)

    const predictCommentsStart = performance.now()
    const predictedAsSpam = await commentPredictor.predictComment(comments, videoId, predictDebugFlag);
    const predictCommentsEnd = performance.now() - predictCommentsStart

    console.log(`${new String(index + 1).padEnd(3, ' ')} / ${fetchedVideosSet.length} = fetch(${comments.length}): ${Math.floor(fetchCommentsEnd) / 1000}s predict: ${Math.floor(predictCommentsEnd) / 1000}s`)
    if (predictedAsSpam.length === 0) return; // 스팸으로 판명된 것이 없음

    // 이메일 DB에 이메일이 없다면? 이메일 없음으로 이동
    const email = mailDB.getEmail(channelId);
    if (!email) {
        const originalPredictedFile = `${appRootPath}/predicts/${videoId}.spam.txt`;
        const noEmailPredictedFile = `${appRootPath}/email-not-found/${channelId}.${videoId}.spam.txt`;
        if (fs.existsSync(originalPredictedFile)) fs.rename(originalPredictedFile, noEmailPredictedFile, (err) => {
            if (err) console.error(err)
        });
        return
    }
    // 메일 보내기
    const mailDataV2 = generateMailDataV2(video, predictedAsSpam)
    await mailerService.sendMail(email, mailDataV2, 'v2');
    const beforeSpamFile = `${appRootPath}/predicts/${videoId}.spam.txt`;
    const sentSpamFile = `${appRootPath}/predicts-sent/${videoId}.spam.txt`;
    if (fs.existsSync(beforeSpamFile)) fs.rename(beforeSpamFile, sentSpamFile, (err) => {
        if (err) console.error(err)
    });
}


const predictDebugFlag = false
const totalPredictStart = performance.now()

flag = flag || process.argv[2]
if (flag === 'sync') {
    for (let [index, video] of fetchedVideosSet.entries()) {
        await predictCommentFunc(index, video, predictDebugFlag)
    }
} else if (flag === 'async') {
    const predictCommentProcessLimit = pLimit(5) // 10 이상부터는 크게 차이가 없고, 5로도 충분하다.

    const predictCommentPromises = fetchedVideosSet.map((video, index) =>
        predictCommentProcessLimit(() => predictCommentFunc(index, video, predictDebugFlag))
    )
    
    await Promise.all(predictCommentPromises)
}
console.log(`predict total ${Math.floor(performance.now() - totalPredictStart) / 1000}s`)

// 이미 추론한 것들을 저장해야할까? 삭제 안했을수도 있지 않을까?
Object.assign(alreadyPredictedVideo, predictedVideoFormat);
const writeData = Object.entries(alreadyPredictedVideo)
    .map(([key, val]) => `${val.baseTime}${seperator}${key}${seperator}${val.title}`)
fs.writeFileSync(alreadyPredictedVideoDB, writeData.join('\n'), 'utf-8')
