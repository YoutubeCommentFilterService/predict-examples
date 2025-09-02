import fs from 'fs';
import appRootPath from 'app-root-path';
import axios, { isAxiosError } from 'axios';
import dotenv from 'dotenv';
import { seperator } from '../modules/utils';
import { EMAIL_LIST_FILE_PATH, EMAIL_REGEX, MAX_FETCH_VIDEO_LENGTH, NOT_FOUND_EMAIL_LIST_FILE_PATH, RETRY_EMAIL_LIST_FILE_PATH, SEARCH_EMAIL_LIST_FILE_PATH } from './find-email-helper/constants';

import spinnerCarousel from './find-email-helper/spinner-carousel';
import type { FetchPlaylistItemResult, YoutubeChannelInfo, YoutubeChannelUUIDInfo, YoutubePlaylistItemResponse, YoutubeVideoResponse } from './types/youtube';

function clearCraousel(carouselId: number | Timer) {
    clearInterval(carouselId)
    console.log()
}

const youtubeChannelEmailRecord: Record<string, YoutubeChannelInfo> = {}
const failed: YoutubeChannelUUIDInfo[] = []
dotenv.config({ path: `${appRootPath}/env/.env` })
/* ============================== 이전 버전은 직접 브라우저 크롤링으로 했다 ==============================
import { closeBrowser, crawlingStart, openBrowser } from './find-email-helper/crawling-youtube';
import { fetchChannelData } from './find-email-helper/fetch-bio';

// 채널 이름, 상세 페이지 json id 추출
const browser = await openBrowser()
const { succeed, failed } = await crawlingStart(browser)
await closeBrowser(browser)

for (const data in succeed) {
    youtubeChannelEmailRecord[data.channelId] = {
        channelName: data.channelName ?? '',
        channelHandler: '',
        uuid: data.uuid ?? '',
        emails: []
    }
}
console.log(`${succeed.length + failed.length} of ${succeed.length} succeed`)

// uuid를 이용하여 채널 설명, 링크들에서 email 추출
const spinnerOfFetchDescriptionJson = spinnerCarousel('FETCH DESCRIPTION JSON')

const fetchYoutubeBioPromises = Object.entries(youtubeChannelEmailRecord).map(([channelId, channelData]) => fetchChannelData(channelId, channelData.uuid))
const bioResults = await Promise.all(fetchYoutubeBioPromises)
bioResults.filter(res => res.emails).forEach(res => {
    const data = youtubeChannelEmailRecord[res.channelId]
    data.channelHandler = res.channelHandler ?? ''
    data.emails = [ ...data.emails, ...res.emails ?? [] ]
})
clearCraousel(spinnerOfFetchDescriptionJson)
*/ // =============================================================================================

// ============================== 이제는 axios로 대체 ==============================
import { fetchYoutubeBio } from './find-email-helper/axios-youtube';
import { fetchSiteChannelDescription } from './find-email-helper/fetch-bio';
let retryFailedIds: string[] = []
let toSearchIds: string[] = []
try {
    retryFailedIds = fs.readFileSync(RETRY_EMAIL_LIST_FILE_PATH, { encoding: 'utf-8' }).split('\n').filter(Boolean).map(x => x.trim().replace(/\,/g, ''))
} catch (e) {}
try {
    toSearchIds = fs.readFileSync(SEARCH_EMAIL_LIST_FILE_PATH, { encoding: 'utf-8' }).split('\n').filter(Boolean).splice(1).map(x => x.trim())
} catch (e) {}
const targetIds: string[] = [...retryFailedIds, ...toSearchIds]
console.log(targetIds)

const spinnerOfFetchDescriptionJson = spinnerCarousel('FETCH DESCRIPTION JSON')
const bioInfos = await Promise.all(targetIds.map(fetchYoutubeBio))
const resultMaps = bioInfos.map(async (data) => {
    const emails = (data?.description || '').match(EMAIL_REGEX) || []
    const promiseResults = (await Promise.all(data?.externalLinks.map(link => link.startsWith('http') ? link : `https://${link}`).map(fetchSiteChannelDescription))).flat()
    return {
        channelId: data.channelId,
        channelHandler: data.handler,
        channelName: data.channelName,
        emails: [...new Set([...emails, ...promiseResults])]
    }
})
const results = await Promise.all(resultMaps)
for (const result of results) {
    if (result.channelHandler) {
        youtubeChannelEmailRecord[result.channelId] = {
            channelName: result.channelName,
            channelHandler: result.channelHandler,
            emails: [...result.emails]
        }
    } else {
        failed.push({
            channelId: result.channelId
        })
    }
}
clearCraousel(spinnerOfFetchDescriptionJson)

// ===============================================================================

// 최신 동영상 id 추출
const videoIds: string[] = []
const retryFetchPlaylistChannelIds: string[] = []
const spinnerOfFetchPlaylistItem = spinnerCarousel('FETCH PLAYLIST ITEM')

async function fetchPlaylistItem(channelId: string): Promise<FetchPlaylistItemResult> {
    const playlistId = channelId.slice(0, 1) + 'U' + channelId.slice(2)
    try {
        const { data } = await axios.get<YoutubePlaylistItemResponse>('https://www.googleapis.com/youtube/v3/playlistItems', {
            params: {
                part: 'snippet,contentDetails',
                key: process.env.YOUTUBE_DATA_API_KEY,
                maxResults: 5,  // shorts에는 동영상 설명을 적지 않는 경우가 많더라... 일단 5로 하면 웬만하면 다 되는 것 같다. 내 토큰 ㅠㅠ...
                playlistId
            }
        })
        return {
            error: false,
            items: data.items.map(item => item.contentDetails.videoId)
        }
    } catch (err) {
        if (isAxiosError(err)) console.error(err.response?.data)
        return {
            error: true,
            items: [ channelId ]
        }
    }
}

async function retryFetchPlaylistItems(channelIds: string[]) {
    return await Promise.all(channelIds.map(fetchPlaylistItem))
}

const fetchPlaylistItemResults = await retryFetchPlaylistItems(Object.keys(youtubeChannelEmailRecord))
fetchPlaylistItemResults.forEach(res => (res.error ? retryFetchPlaylistChannelIds : videoIds).push(...res.items))

do {
    const fetchPlaylistItemResults = await retryFetchPlaylistItems(retryFetchPlaylistChannelIds)
    const succeedList = fetchPlaylistItemResults.filter(res => !res.error).flatMap(item => item.items)
    const failedList = fetchPlaylistItemResults.filter(res => res.error).flatMap(item => item.items)
    retryFetchPlaylistChannelIds.push(...succeedList)
    retryFetchPlaylistChannelIds.splice(0, retryFetchPlaylistChannelIds.length, ...failedList)
} while (retryFetchPlaylistChannelIds.length > 0)
clearCraousel(spinnerOfFetchPlaylistItem)

// 동영상 id를 이용하여 동영상 설명의 email 추출
const spinnerOfFetchVideoInfo = spinnerCarousel('FETCH VIDEO INFO')
let searchVideoIds = []
while (videoIds.length > 0) {
    searchVideoIds = videoIds.splice(0, MAX_FETCH_VIDEO_LENGTH)
    try {
        const { data } = await axios.get<YoutubeVideoResponse>('https://www.googleapis.com/youtube/v3/videos', {
            params: {
                key: process.env.YOUTUBE_DATA_API_KEY,
                part: "snippet",
                hl: 'ko',
                id: searchVideoIds.join(','),
                maxResults: 50,
            }
        })
        data.items.forEach(item => {
            const snippet = item.snippet
            if (snippet.description.trim() === '') return;
            youtubeChannelEmailRecord[snippet.channelId].emails = [...new Set([...youtubeChannelEmailRecord[snippet.channelId].emails, ...new Set(snippet.description.match(EMAIL_REGEX) || [])])]
        })
    } catch (e) {
        if (isAxiosError(e)) console.error(e.message)
        videoIds.push(...searchVideoIds)
    }
}
clearCraousel(spinnerOfFetchVideoInfo)

const emailFoundDatas = Object.entries(youtubeChannelEmailRecord).filter(obj => obj[1].emails.length > 0)
    .map(([key, val]) => [ key, val.channelHandler, val.channelName, val.emails.join(' ') ].join(seperator))
const emailNotFoundDatas = Object.entries(youtubeChannelEmailRecord).filter(obj => obj[1].emails.length === 0)
    .map(([key, val]) => [ key, val.channelHandler, val.channelName ].join(seperator) + seperator)

const toLogText = (arr: string[]) => arr.length === 0 ? '' : arr.join('\n') + '\n'

await Promise.allSettled([
    fs.promises.appendFile(EMAIL_LIST_FILE_PATH, toLogText(emailFoundDatas)),
    fs.promises.appendFile(NOT_FOUND_EMAIL_LIST_FILE_PATH, toLogText(emailNotFoundDatas)),
    fs.promises.writeFile(RETRY_EMAIL_LIST_FILE_PATH, toLogText(failed.map(item => item.channelId))),
    fs.promises.rm(SEARCH_EMAIL_LIST_FILE_PATH, { force: true })
])

console.log('append and remove files done')