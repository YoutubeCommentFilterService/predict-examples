import dotenv from 'dotenv';
import { Services, seperator, resizeStr } from '../modules';
import fs from 'fs';
import type { ChannelInfo, FetchedVideo, SendMailData } from '../types';
import appRootPath from 'app-root-path';
import { title } from 'process';

dotenv.config({ path: `${appRootPath}/.env` })

const alreadyPredictedVideoDB = `${appRootPath}/datas/already-predicted.txt`
const alreadyPredictedVideo = fs.readFileSync(alreadyPredictedVideoDB, 'utf-8').trim().split('\n').reduce((acc, item) => {
    if (!item) return acc;
    const [baseTime, videoId, title] = item.split(seperator).map(data => data.trim())
    acc[videoId] = { baseTime, title }
    return acc;
}, {} as {[key: string]: {baseTime: string, title: string}});

const emailDB = fs.readFileSync(`${appRootPath}/datas/emails.txt`, 'utf-8').trim().split('\n').map(data => data.trim())
const canSeekEmailDB = fs.readFileSync(`${appRootPath}/datas/can-find-emails.txt`, 'utf-8').trim().split('\n').map(data => data.trim())
const skipSeekEmailDB = fs.readFileSync(`${appRootPath}/datas/skip-emails.txt`, 'utf-8').trim().split('\n').map(data => data.trim())

const mailDB = new Services.MailDB(emailDB);
const canSeekMailDB = new Services.MailDB(canSeekEmailDB)
const skipSeekMailDB = new Services.MailDB(skipSeekEmailDB)

const videoFetcher = new Services.VideoFetcher();
const commentFetcher = new Services.CommentFetcher();
const commentPredictor = new Services.CommentPredictor();
const mailerService = new Services.MailerService();

// 댓글을 가져오지 않을 것들 설정
const notFetchFilter: {categoryId: (number | string)[], title: string[]} = {
    categoryId: ['10', '25', '17'], // 10: music, 25: 정치/뉴스, 17: 스포츠, 24: 엔터테인먼트
    title: ['직캠', 'm/v', 'mv', '#shorts', 'music video', '트롯']
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
const fetchedVideosList: FetchedVideo[] = []
const categories: (number | string)[] = [0, 1, 15, 20, 22, 23, 24, 26, 28]
for (let categoryId of categories) {
    const fetchedVideos = await videoFetcher.fetchVideoByCategoryId(categoryId, 50, false)
    fetchedVideosList.push(...fetchedVideos);
}

let fetchedVideosSet = Array.from(new Map(fetchedVideosList.map(video => [video.id, video])).values())
// 본 서비스는 오직 한국 영상으로만!!!
fetchedVideosSet = fetchedVideosSet.filter(video => /[가-힣]+/.test(video.title))
if (notFetchFilter) {
    fetchedVideosSet = fetchedVideosSet.filter(video => {
        const { categoryId: categoryIds, title: titles } = notFetchFilter;
        const targetVideoTitle = video.title.toLowerCase()
        return !(categoryIds?.includes(`${video.categoryId}`) ||
                titles?.some(title => targetVideoTitle.includes(title)))
    })
}
fetchedVideosSet = fetchedVideosSet.filter(video => !skipSeekMailDB.existUser(video.channelId))

// channelId 가져오기 - 중복 없애기
const fetchTargetChannelIds: string[] = [...new Set(fetchedVideosSet.map(video => video.channelId))]

// 메일 DB에 없다면 찾아야 할 것으로 넣기
const toSearchEmailTxt = `${appRootPath}/datas/to-search-emails.txt`
fs.writeFileSync(toSearchEmailTxt, `${"id".padEnd(24, ' ')}, email\n`, 'utf-8')
fetchTargetChannelIds.forEach(channelId => {
    if (mailDB.getEmail(channelId)) return
    if (canSeekMailDB.existUser(channelId) || skipSeekMailDB.existUser(channelId)) return;
    fs.appendFileSync(toSearchEmailTxt, `${channelId}, \n`, 'utf-8')
})

// 동영상의 댓글 가져오고 추론하기
const predictedVideoFormat: string[] = []
for (let video of fetchedVideosSet) {
    console.log(`fetch ${video.id}'s comment started... - ${video.title}(${video.categoryId})`)
    const email = mailDB.getEmail(video.channelId);

    const {comments, lastSearchTime} = await commentFetcher.fetchCommentsByVideoId(video.id, 100, alreadyPredictedVideo[video.id]?.baseTime);

    predictedVideoFormat.push(`${lastSearchTime.padEnd(26, ' ')}${seperator}${video.id}${seperator}${video.title}`)

    if (comments.length === 0) continue; // 403, 즉 동영상이 댓글을 닫은 경우
                                         // 400, 즉 동영상에 댓글이 없는 경우(거의 없긴 하다)

    console.time(`${video.id}'s comment Count: ${comments.length}`)
    const predicted = await commentPredictor.predictComment(comments, video.id);
    console.timeEnd(`${video.id}'s comment Count: ${comments.length}`)
    process.exit(0)
    
    if (predicted.length === 0) continue; // 스팸으로 판명된 것이 없음
    // 이메일 DB에 이메일이 없다면? 이메일 없음으로 이동
    if (!email) {
        const originalPredictedFile = `${appRootPath}/predicts/${video.id}.spam.csv`;
        const noEmailPredictedFile = `${appRootPath}/email-not-found/${video.channelId}.${video.id}.spam.csv`;
        if (fs.existsSync(originalPredictedFile)) fs.renameSync(originalPredictedFile, noEmailPredictedFile);
        continue
    }
    // 메일 보내기
    const mailData: SendMailData = {
        video: {
            id: video.id,
            title: video.title,
        },
        comments: predicted
    }
    // await mailerService.sendMail(email, mailData);
    const beforeSpamFile = `${appRootPath}/predicts/${video.id}.spam.csv`;
    const sentSpamFile = `${appRootPath}/predicts-sent/${video.id}.spam.csv`;
    if (fs.existsSync(beforeSpamFile)) fs.renameSync(beforeSpamFile, sentSpamFile);
    
}

fs.appendFileSync(alreadyPredictedVideoDB, predictedVideoFormat.join('\n'), 'utf-8')
