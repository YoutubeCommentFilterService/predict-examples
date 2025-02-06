import ejs from 'ejs';
import fs, { fdatasync } from 'fs';
import axios from 'axios';
import dotenv from 'dotenv';
import type { SendMailData, SpamContent } from '../types';
import MailerService from '../modules/mailer-service';

dotenv.config({ path: '../.env' })

const mailerService = new MailerService()

const files = fs.readdirSync('../predicts')
const videoIds = files.map(file => file.split('.')[1])

const resultVideos: {id: string, title: string, channelId: string}[] = []

const chunkSize = 50;

const alreadySent: string[] = fs.readFileSync('../datas/already-sent.txt', 'utf-8').trim().split('\n')

const sendMail = async (videosMap: {[title: string]: string}, videoId: string, byChannelId: {[id: string]: string}, byHandler: {[name: string]: string}) => {
    const [title, channelId] = videosMap[videoId].split('|||')
    const email = byChannelId[channelId] || byHandler[channelId]

    if (email === '' || email === undefined) return;

    const spamFile = `../predicts/predict-result.${videoId}.spam.csv`
    const toFile = `../predicts-sent/predict-result.${videoId}.spam.csv`

    const messages = fs.readFileSync(spamFile, 'utf-8').trim().split('\n').slice(1)
    // id,profile_image,nickname,comment
    const spamContents: SpamContent[] = messages.map(message => {
        const datas = message.split(',')
        const [nickname, nickname_p] = datas[2].split('|')
        const [comment, comment_p] = datas.slice(3).join(',').split('|')
        return {
            id: datas[0],
            profileImage: datas[1],
            nickname: nickname,
            nickname_p: nickname_p,
            comment: comment.replaceAll('\r\n', ' ').replaceAll('\r', ' ').replaceAll('\n', ' '),
            comment_p: comment_p
        }
    })
    
    const mailData: SendMailData = {
        video: {
            id: videoId,
            title: title,
        },
        comments: spamContents,
    }

    await mailerService.sendMail(email, mailData);
    fs.rename(spamFile, toFile, (err) => {
        if (err) {
            console.log('이동 중 오류 발생: ', err);
            return;
        }
    })
    fs.appendFileSync('../datas/already-sent.txt', `${videoId}\n`, 'utf-8')
}

try {
    for (let i = 0; i < videoIds.length; i += chunkSize) {
        const chunk = videoIds.slice(i, i+chunkSize);
        const url = `https://www.googleapis.com/youtube/v3/videos?key=${process.env.YOUTUBE_DATA_API_KEY}&part=snippet&id=${chunk.join(',')}`
        const response = await axios.get(url)

        response.data.items.forEach(video => {
            resultVideos.push({
                id: video.id,
                title: video.snippet.title,
                channelId: video.snippet.channelId,
            })
        })
    }

    const videosMap = resultVideos.reduce((prev, val) => {
        prev[val.id] = `${val.title}|||${val.channelId}`
        return prev
    }, {} as {[key: string]: string})

    const emailDb = fs.readFileSync('../datas/emails.txt', 'utf-8').split('\n').map(line => line.split(',').map(text => text.trim()))

    const byHandler: {[key: string]: string} = {}
    const byChannelId: {[key: string]: string}= {}
    emailDb.forEach(line => { 
        byHandler[line[0]] = line[2]
        byChannelId[line[1]] = line[2]
    })

    const sentVideoId: string[] = []
    for (let videoId of Object.keys(videosMap)) {
        if (alreadySent.includes(videoId)) continue;
        sentVideoId.push(videoId)
        await sendMail(videosMap, videoId, byChannelId, byHandler);
    }

    sentVideoId.forEach(sentId => {
        fs.appendFileSync('../datas/already-sent.txt', `${sentId}\n`, 'utf-8')
    })

} catch (err) {
    console.log(err)
}