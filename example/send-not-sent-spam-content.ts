import dotenv from 'dotenv'
import fs from 'fs';
import appRootPath from 'app-root-path';
import { Services } from '../modules';
import type { FetchedVideo, MailDataTree, SendMailData, SendMailDataV2, SpamContent } from '../types';
import { resourceLimits } from 'worker_threads';

dotenv.config({ path: `${appRootPath}/env/.env` })

const emailDBTxt = fs.readFileSync(`${appRootPath}/datas/emails.txt`, 'utf-8').trim().split('\n').map(data => data.trim())

const mailDB = new Services.MailDB(emailDBTxt);
const videoFetcher = new Services.VideoFetcher();

const mailerService = new Services.MailerService();

const predictedFilePath = `${appRootPath}/predict-results/predicts`
const spamFilePath = `${appRootPath}/predict-results/email-not-found`
const moveToPath = `${appRootPath}/predict-results/predicts-sent`

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
// 혹시나 옮겨지지 못한 spam data가 있을 수 있으니 옮긺
const spamfileRegex = /\.spam\./;
const notMovedSpamFiles = fs.readdirSync(predictedFilePath, { encoding: 'utf-8' }).filter((fileName) => spamfileRegex.test(fileName))
let promises = notMovedSpamFiles.map(filename => {
    return new Promise((resolve, reject) => {
        fs.rename(
            `${predictedFilePath}/${filename}`, 
            `${spamFilePath}/${filename}`, 
            (err) => {
                if (err) {
                    console.error(err)
                    reject(err);
                } else {                   
                    resolve(0)
                }
            }
        )
    })
})
await Promise.all(promises)

// 모든 파일을 읽는다
const files = fs.readdirSync(spamFilePath, { encoding: 'utf-8' }).map((fileName) => fileName.split('.')[0])

const toSendVideoInfos: FetchedVideo[] = []
const toSendSpamDatas: {[key: string]: SpamContent[]} = {}

function parseProbabilities(line: string) {
    return line.split(',').map(item => {
        const match = item.trim().match(/(.+?)\((\s*\d+)%\)/) as RegExpMatchArray;
        return {
            label: match[1].trim(),
            percent: parseInt(match[2], 10)
        };
    }).filter(Boolean);
}

function getTopLabel(line: string) {
    const probs = parseProbabilities(line);
    const top = probs.reduce((max, curr) => (curr.percent > max.percent ? curr : max), probs[0]);
    return top.label;
}

// email db에 없는 동영상의 경우 무시
while (files.length != 0) {
    const videoIds = files.splice(0, 50)
    const results = await videoFetcher.fetchVideoById(videoIds, 50)
    toSendVideoInfos.push(...(results?.filter(result => mailDB.existUser(result.channelId)) ?? []))
}

// email db에 있는 유저의 것들 전부 가져오기
for (const videoInfo of toSendVideoInfos) {
    const file = fs.readFileSync(`${spamFilePath}/${videoInfo.id}.spam.txt`, {encoding: "utf-8"})
    const lines = file.trim().split('\n').map(line => line.trim())
    while (lines.length > 0) {
        const spamData = lines.splice(0, 5)
        const [profileImage, nickname, nicknameProb, commentProb, comment] = spamData
        const nicknamePredicted = getTopLabel(nicknameProb)
        const commentPredicted = getTopLabel(commentProb)
        
        const data: SpamContent = {
            profileImage,
            nicknamePredicted,
            commentPredicted,
            nickname: nickname.split(' ')[0],
            comment,
            nicknameProb,
            commentProb,
        };
        (toSendSpamDatas[videoInfo.id] ??= []).push(data)
    }
}

promises = toSendVideoInfos.map(async (videoInfo) => {
    const mailData = generateMailData(videoInfo, toSendSpamDatas[videoInfo.id]);
    const emails = mailDB.getEmail(videoInfo.channelId);

    await Promise.all(emails.map((email) => mailerService.sendMail(email, mailData, 'v0')))

    return new Promise((resolve, reject) => {
        fs.rename(
            `${spamFilePath}/${videoInfo.id}.spam.txt`, 
            `${moveToPath}/${videoInfo.id}.spam.txt`, 
            (err) => {
                if (err) {
                    console.error(err)
                    reject(err);
                } else {                   
                    resolve(0)
                }
            }
        )
    })
})
await Promise.all(promises);

// for (const videoInfo of toSendVideoInfos) {
//     const mailData = generateMailData(videoInfo, toSendSpamDatas[videoInfo.id]);
//     const emails = mailDB.getEmail(videoInfo.channelId)
//     for (const email of emails) {
//         await mailerService.sendMail(email, mailData, 'v0');
//     }
//     fs.rename(`${spamFilePath}/${videoInfo.id}.spam.txt`, `${moveToPath}/${videoInfo.id}.spam.txt`, (err) => {
//         if (err) console.error(err)
//     })
// }