import axios, { isAxiosError } from 'axios';
import fs from 'fs';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer';
import appRootPath from 'app-root-path';

dotenv.config({ path: `${appRootPath}/env/.env` })

interface YoutubeChannelResponse {
    items: YoutubeChannel[];
}

interface YoutubeChannel {
    id: string;
    snippet: {
        description: string;
    }
    contentDetails: {
        relatedPlaylists: {
            uploads: string
        }
    }
}

interface YoutubePlaylistItemResponse {
    items: YoutubePlaylistItem[];
}

interface YoutubePlaylistItem {
    id: string;
    contentDetails: {
        videoId: string;
    }
}

interface YoutubeVideoResponse {
    items: YoutubeVideo[]
}

interface YoutubeVideo {
    snippet: {
        channelId: string;
        description: string;
        thumbnails: {
            [key: string]: {
                width: number;
                height: number;
            }
        }
    }
}

const emailRegex: RegExp = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const dataPath = `${appRootPath}/datas`

const toSearchEmailListFile = `${dataPath}/to-search-emails.txt`
const toSearchEmailList = fs.readFileSync(toSearchEmailListFile, 'utf-8').trim().split('\n').slice(1).map(email => email.split(',')[0])

const step = 50;
const toSearchChannelVideoInfoDict: {[key: string]: string} = {};
const searchResults: {[key: string]: string[]} = {};

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const results = await Promise.all(toSearchEmailList.map(async (channelId) => {
    const page = await browser.newPage();
    await page.goto(`https://youtube.com/channel/${channelId}`, { waitUntil: 'networkidle2' })

    const moreButton = '#page-header > yt-page-header-renderer > yt-page-header-view-model > div > div.page-header-view-model-wiz__page-header-headline > div > yt-description-preview-view-model > truncated-text > button'
    await page.waitForSelector(moreButton);
    await page.click(moreButton);

    await page.waitForSelector('#links-section')
    const emails = (await page.evaluate(() => {
        return Array.from(document.querySelectorAll('#link-list-container a')).map(a => (a as HTMLAnchorElement).innerText)
    })).filter(text => emailRegex.test(text))

    await page.close();
    return { channelId, emails }
}));
await browser.close();

for (let result of results) {
    if (result.emails.length !== 0) searchResults[result.channelId] = result.emails;
}

console.log('search channel - find email on description')
for (let i = 0; i < toSearchEmailList.length; i += step) {
    const targetChannelIds = toSearchEmailList.slice(i, i+step)
    try {
        const response = await axios.get<YoutubeChannelResponse>('https://www.googleapis.com/youtube/v3/channels', {
            params: {
                part: 'snippet,contentDetails',
                key: process.env.YOUTUBE_DATA_API_KEY,
                maxResults: 50,
                id: targetChannelIds.join(',')
            }
        })

        const data = response.data

        for (let channel of data.items) {
            const emails = new Set(channel.snippet.description.match(emailRegex))
            toSearchChannelVideoInfoDict[channel.id] = channel.contentDetails.relatedPlaylists.uploads
            if (emails.size !== 0) searchResults[channel.id] = [...new Set([...(searchResults[channel.id] || []), ...emails])]
        }
    } catch (err) {
        if (isAxiosError(err)) console.error(err.response?.data)
        else console.error(err)
    }
}
console.log(`result -- searched: ${Object.keys(searchResults).length}, notSearched: ${Object.keys(toSearchChannelVideoInfoDict).length}`)

console.log("search default playlist - get playlist's first video")
const searchChannelsEntry = Object.entries(toSearchChannelVideoInfoDict)
for (let [channelId, playlistId] of searchChannelsEntry) {
    try {
        const response = await axios.get<YoutubePlaylistItemResponse>('https://www.googleapis.com/youtube/v3/playlistItems', {
            params: {
                part: 'contentDetails',
                key: process.env.YOUTUBE_DATA_API_KEY,
                maxResults: 50,
                playlistId
            }
        })
        const data = response.data;

        toSearchChannelVideoInfoDict[channelId] = data.items[0].contentDetails.videoId;
    } catch (err) {
        if (isAxiosError(err)) console.error(err.response?.data)
        else console.error(err)
    }
}

console.log('search video - find email on description')
const searchVideos = Object.entries(toSearchChannelVideoInfoDict)
const notFoundEmails: string[] = []
for (let i = 0; i < searchVideos.length; i += step) {
    try {
        const searchVideoList = searchVideos.slice(i, i+step).map(video => video[1])
        const response = await axios.get<YoutubeVideoResponse>('https://www.googleapis.com/youtube/v3/videos', {
            params: {
                key: process.env.YOUTUBE_DATA_API_KEY,
                part: "snippet",
                id: searchVideoList.join(','),
                maxResults: 50,
            }
        })
        const data = response.data
        for (let video of data.items) {
            const snippet = video.snippet
            const emails = new Set(snippet.description.match(emailRegex))
            if (emails.size !== 0) searchResults[snippet.channelId] = [...new Set([...new Set([...(searchResults[snippet.channelId] || []), ...emails])])]
            else {
                if ((searchResults[snippet.channelId] || []).length === 0) notFoundEmails.push(snippet.channelId + ',')
            }
        }
    } catch (err) {
        if (isAxiosError(err)) console.error(err.response?.data)
        else console.error(err)
    }
}
console.log(`result -- searched: ${Object.keys(searchResults).length}, notSearched: ${Object.keys(notFoundEmails).length}`)

// TODO: 자동화를 통한 notFound 채널에 이메일 확인 버튼이 있다면 누르고 이메일 불러오기

const searchedEmailFile = `${dataPath}/emails.txt`
const notFoundEmailFile = `${dataPath}/skip-emails.txt`
const doubledEmailFile = `${dataPath}/doubled-emails.txt`

const doubledEmails = []
const foundEmails = []
for (let [id, emails] of Object.entries(searchResults)) {
    if (emails.length === 1) foundEmails.push(`${id}, ${emails}`)
    else doubledEmails.push(`${id}, ${emails}`)
}

fs.appendFile(searchedEmailFile, foundEmails.join('\n') + '\n', (err) => { err ? console.error(err) : console.log('채널ID - 이메일 저장 성공, e-mail 1개') })
fs.appendFile(doubledEmailFile, doubledEmails.join('\n') + '\n', (err) => { err ? console.error(err) : console.log('채널ID - 이메일 저장 성공, e-mail 2개 이상') })
fs.appendFile(notFoundEmailFile, notFoundEmails.join('\n') + '\n', (err) => { err ? console.error(err) : console.log('채널ID 저장 성공') })
fs.rm(toSearchEmailListFile, (err) => { err ? console.error(err) : console.log('원본 데이터 삭제')})