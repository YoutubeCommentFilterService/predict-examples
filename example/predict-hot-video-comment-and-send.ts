import dotenv from 'dotenv';
import { Services, seperator } from '../modules';
import fs from 'fs';
import type { ChannelInfo, FetchedVideo, SendMailData } from '../types';
import appRootPath from 'app-root-path';

dotenv.config({ path: `${appRootPath}/.env` })

const alreadySentVideoDB = '../datas/already-sent.txt'
const alreadySentVideo = fs.readFileSync(alreadySentVideoDB, 'utf-8').trim().split('\n')

const alreadySentvideoMap = alreadySentVideo.reduce((prev, val: string) => {
    const [id, title] = val.split(seperator)
    return prev
}, {} as {[key: string]: string})

const alreadyPredictedVideoDB = `${appRootPath}/datas/already-predicted.txt`
const alreadyPredictedVideo = fs.readFileSync(alreadyPredictedVideoDB, 'utf-8').trim().split('\n')
const emailDB = fs.readFileSync(`${appRootPath}/datas/emails.txt`, 'utf-8').trim().split('\n').map(db => db.split(',').map(data => data.trim()))

const mailDB = new Services.MailDB(emailDB);
const channelInfoFercher = new Services.ChannelInfoFetcher();
const videoFetcher = new Services.VideoFetcher();
const commentFetcher = new Services.CommentFetcher();
const commentPredictor = new Services.CommentPredictor();
const mailerService = new Services.MailerService();

function resizeStr(str: string, maxLength: number, char: string = ' ') {
    if (!str) return;
    const koreanCount = (str.match(/[가-힣]/g) || []).length;
    maxLength = maxLength - koreanCount
    return str.padEnd(maxLength, char)
}

const notFetchFilter = {
    categoryId: ['10', '25'], // 10: music, 25: 정치/뉴스, 24: 엔터테인먼트, 17: 스포츠
    title: ['직캠', 'M/V', 'MV']
}

const fetchFilter = {
    categoryId: [],
    title: []
}

// 인급동 200개 가져오기
const fetchedVideos: FetchedVideo[] = await videoFetcher.fetchVideo(50, notFetchFilter, fetchFilter);
const predictTargetVideos = fetchedVideos.filter(video => !alreadyPredictedVideo.includes(video.id))

// channelId 가져오기
const fetchTargetChannelIds: string[] = [];
for (let video of predictTargetVideos) {
    // console.log(`category - ${video.categoryId.padStart(2, ' ')}, ${video.title}`)
    if (!fetchTargetChannelIds.includes(video.channelId)) fetchTargetChannelIds.push(video.channelId)
}

// channelId와 연관된 handler 가져오기. 실제로는 필요없긴 하지만, 이메일이 없는 경우에도 해야한다...
const step = 50
const fetchedChannelInfos: ChannelInfo[] = [];
for (let i = 0; i < fetchTargetChannelIds.length; i += step) {
    const channelInfos = await channelInfoFercher.fetchChannelInfoByChannelIds(fetchTargetChannelIds.slice(i, i+step), step)
    fetchedChannelInfos.push(...channelInfos);
}

// 만약 없다면? 찾아야하는 메일로 넣기
const toSearchEmailTxt = `${appRootPath}/datas/to-search-emails.txt`
fs.writeFileSync(toSearchEmailTxt, `${"handler".padEnd(30, ' ')}, ${"id".padEnd(24, ' ')}  ,  email\n`, 'utf-8')
fetchedChannelInfos.forEach(channelInfo => {
    if (mailDB.getEmail(channelInfo.id)) return
    fs.appendFileSync(toSearchEmailTxt, `${resizeStr(channelInfo.handler, 30, ' ') || ' '.repeat(30)}, ${channelInfo.id}  , \n`, 'utf-8')
})

// 동영상의 댓글 가져오고 추론하기
for (let video of predictTargetVideos) {
    // if (['Z51Zn6iHvhE', 'vzjVUWS3P1g', 'hCBZqVzVL_U'].includes(video.id)) continue
    console.log(`fetch ${video.id}'s comment started... - ${video.title}(${video.categoryId})`)
    if ((video.title.match(/[가-힣]/g) || []).length === 0) {
        console.log(`no korean found at """${video.title}""". skip fetch comments`)
        continue
    }
    const email = mailDB.getEmail(video.channelId);

    const comments = await commentFetcher.fetchComment(video.id, 50, video.categoryId, true);

    if (comments.length === 0) continue; // 403, 즉 동영상이 댓글을 닫은 경우
                                         // 400, 즉 동영상에 댓글이 없는 경우(거의 없긴 하다)

    console.time(`${video.id}'s comment Count: ${comments.length}`)
    const predicted = await commentPredictor.predictComment(comments, video.id, true);
    console.timeEnd(`${video.id}'s comment Count: ${comments.length}`)

    if (predicted.length === 0) continue; // 스팸으로 판명된 것이 없음

    const saveData = `${video.id}${seperator}${video.title.slice(0, 20)}`

    alreadyPredictedVideo.push(saveData)
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
    if (fs.existsSync(beforeSpamFile)) {
        alreadySentVideo.push(saveData);
        fs.renameSync(beforeSpamFile, sentSpamFile);
    }
}

// fs.writeFileSync(alreadySentVideoDB, '', 'utf-8')
// fs.appendFileSync(alreadySentVideoDB, alreadySentVideo.join('\n'), 'utf-8')

// fs.writeFileSync(alreadyPredictedVideoDB, '', 'utf-8')
// fs.appendFileSync(alreadyPredictedVideoDB, alreadyPredictedVideo.join('\n'), 'utf-8')
