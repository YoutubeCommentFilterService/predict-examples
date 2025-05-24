import puppeteer, { Browser, Page } from 'puppeteer';
import axuis, { isAxiosError } from 'axios'
import pLimit from 'p-limit';
import fs from 'fs';
import appRootPath from 'app-root-path';
import axios from 'axios';
import dotenv from 'dotenv';
import { seperator } from '../modules/utils';

dotenv.config({ path: `${appRootPath}/env/.env` })

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
    }
}

const spinnerCarousel = (baseText = "FETCHING", interval = 100): Timer => {
    const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frameIndex = 0;
    let startTime = Date.now();
    
    const timer = setInterval(() => {
        const elapsedSeconds: string = ((Date.now() - startTime) / 1000).toFixed(1);
        const dots: string = '.'.repeat((Math.floor(Number(elapsedSeconds) / 2)) % 30);
        process.stdout.write(`\r${spinnerFrames[frameIndex]} ${baseText} [${elapsedSeconds}s] ${dots}`);
        frameIndex = (frameIndex + 1) % spinnerFrames.length;
    }, interval);
    
    return timer;
};

const fetchChannelInfo = async (browser: Browser, channelId: string) => {
    const moreButtonSelector = '#page-header > yt-page-header-renderer > yt-page-header-view-model > div > div.page-header-view-model-wiz__page-header-headline > div > yt-description-preview-view-model > truncated-text > button'
    const channelNameSelector = '#page-header > yt-page-header-renderer > yt-page-header-view-model > div > div.page-header-view-model-wiz__page-header-headline > div > yt-dynamic-text-view-model > h1 > span'
    const uuidComponentSelector = '#content > ytd-section-list-renderer'

    const page = await getPage(browser)

    const intervalRate = (0.5 + Math.random()) * 100 * MAX_THREAD_SIZE

    let intervalTimerId
    try {
        await page.goto(`https://youtube.com/channel/${channelId}`, { waitUntil: 'domcontentloaded' })

        intervalTimerId = setInterval(async () => { await page.bringToFront(); }, intervalRate);

        await page.waitForSelector(moreButtonSelector, { timeout: 3000 })

        const channelName = await page.$eval(channelNameSelector, el => el.innerText);

        await page.click(moreButtonSelector)
        await page.waitForSelector('#about-container', { timeout: 10000 })

        const uuid = (await page.$eval(uuidComponentSelector, element => element.getAttribute('panel-target-id')))!
    
        return { channelId, uuid, channelName }
    } catch (e) {
        retrySearches.push(channelId);
    } finally {
        await releasePage(page);
        if (intervalTimerId) clearInterval(intervalTimerId);
    }
}

const retrySearch = async (retryCount: number) => {
    let results;

    if (retryCount == 0) {
        results = await Promise.allSettled(
            toSearchEmailList.map(
                async (channelId) => emailFetchProcessLimit(
                    async () => fetchChannelInfo(browser, channelId)
                )
            )
        );
    } else {
        const retrySearchLen = retrySearches.length
        results = await Promise.allSettled(
            retrySearches.map(
                async (channelId) => emailFetchProcessLimit(
                    async () => fetchChannelInfo(browser, channelId)
                )
            )
        )
        retrySearches.splice(0, retrySearchLen)
    }
    console.log(` - ${retryCount}차 실패 개수: ${retrySearches.length}`)
    await releaseAllPage()
    return results;
}

const MAX_THREAD_SIZE = 16;
const MAX_RETRY_COUNT = 5;

const emailRegex: RegExp = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const dataPath = `${appRootPath}/datas`

const toSearchEmailListFile = `${dataPath}/to-search-emails.txt`
const toSearchEmailList = fs.readFileSync(toSearchEmailListFile, 'utf-8')
                            .trim().split('\n')
                            .slice(1).map(email => email.split(',')[0])

const emailFetchProcessLimit = pLimit(MAX_THREAD_SIZE)
const retrySearches: string[] = []
const totalSearches = [];
const pagePool: Page[] = [];

const getPage = async (browser: Browser) => {
    if (pagePool.length > 0) return pagePool.pop()!;

    const page = await browser.newPage()

    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) req.abort();
        else req.continue();
    });
    return page;
}

const releasePage = async (page: Page) => {
    if (pagePool.length < MAX_THREAD_SIZE) {
        pagePool.push(page);
    } else {
        if (!page.isClosed()) page.close();
    }
}

const releaseAllPage = async () => {
    await Promise.allSettled(pagePool.map(async page => {
        await page.close();
    }))
    pagePool.splice(0, pagePool.length);
}

// 채널 이름, 상세 페이지 json id 추출
const browser = await puppeteer.launch({ 
    headless: true, 
    args: [
        '--disable-gpu',
        '--window-size=720,1080',
    ], 
    defaultViewport: { width: 720, height: 1080 }
});

for (let retryCount = 0; ; retryCount++) {
    const timer = spinnerCarousel('CRAWLING CHANNEL UUID')
    totalSearches.push(...await retrySearch(retryCount))
    clearInterval(timer);
    if (retrySearches.length == 0) break;
    if (retryCount === MAX_RETRY_COUNT) break;
}

await browser.close()

const finalResults = totalSearches
    .filter(searchResult => searchResult.status === 'fulfilled' && searchResult.value != undefined)
    .map(result  => (result as PromiseFulfilledResult<any>).value)

console.log(`total search count  : ${totalSearches.length}`)
console.log(`success result count: ${finalResults.length}`)
console.log(`retry result count  : ${retrySearches.length}`)
const finalDict: {[key: string]: {uuid: string, channelName: string, emails: string[], channelHandler?: string}} = {}
finalResults.forEach(result => finalDict[result.channelId] = {
    channelName: result.channelName,
    uuid: result.uuid,
    emails: []
})

console.log('crawling failed - ', retrySearches)


const fetchChannelData = async (channelId: string, channelUUID: string) => {
    const executeUUID = `$${channelUUID}`;
    const toBase64 = 'â©²`' + channelId + 'D8gYrGimaASYK' + Buffer.from(executeUUID).toString('base64url') + '%3D%3D'

    try {
        const { data } = await axios.post('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
            "context": {
                "client": {
                    "clientName": "WEB",
                    "clientVersion": "2.20250331.01.00",
                    "gl": "KR",
                    "hl": "ko"
                }
            },
            "continuation": btoa(toBase64)
        })

        const continuationItem = data['onResponseReceivedEndpoints'][0]['appendContinuationItemsAction']['continuationItems'][0]
        const channelViewModel = continuationItem['aboutChannelRenderer']['metadata']['aboutChannelViewModel']

        const emailsFromDescription = (channelViewModel['description'] || '').replace(/[\n\r\t\f\v]+/g, '  ').match(emailRegex) || [];
        const emailsFromLinks = (channelViewModel['links'] || []).reduce((acc: string[], link) => {
            const content = link?.channelExternalLinkViewModel?.link?.content;
            if (emailRegex.test(content)) acc.push(content);
            return acc;
        }, [] as string[])
        
        return {
            channelId,
            channelHandler: channelViewModel['displayCanonicalChannelUrl'].split('/')[1],
            emails: [...new Set([...emailsFromDescription, ...emailsFromLinks])]
        }
    } catch (err) {
        console.error(err)
        return null;
    }
}

// uuid를 이용하여 채널 설명, 링크들에서 email 추출
const spinnerOfFetchDescriptionJson = spinnerCarousel('FETCH DESCRIPTION JSON')
const promises = Object.entries(finalDict).map(([channelId, channelData]) => fetchChannelData(channelId, channelData.uuid))
clearInterval(spinnerOfFetchDescriptionJson)

const results = (await Promise.allSettled(promises)).filter(promise => promise.status === 'fulfilled')
const successResults = results.filter(promise => promise.value !== null).map(promise => promise.value)

successResults.forEach(result => {
    if (result) {
        finalDict[result.channelId].channelHandler = result.channelHandler;
        finalDict[result.channelId].emails = [...finalDict[result.channelId].emails, ...result.emails];
    }
})

// 최신 동영상 id 추출
const videoIds: string[] = []
const spinnerOfFetchPlaylistItem = spinnerCarousel('FETCH PLAYLIST ITEM')
for (const channelId of Object.keys(finalDict)) {
    try {
        const playlistId = channelId.slice(0, 1) + 'U' + channelId.slice(2)
        const { data } = await axios.get<YoutubePlaylistItemResponse>('https://www.googleapis.com/youtube/v3/playlistItems', {
            params: {
                part: 'snippet,contentDetails',
                key: process.env.YOUTUBE_DATA_API_KEY,
                maxResults: 5,  // shorts에는 동영상 설명을 적지 않는 경우가 많더라... 일단 5로 하면 웬만하면 다 되는 것 같다. 내 토큰 ㅠㅠ...
                playlistId
            }
        })
        data.items.forEach(item => videoIds.push(item.contentDetails.videoId))
    } catch (err) {
        if (isAxiosError(err)) console.error(err.response?.data)
        else console.error(err)
    }
}
clearInterval(spinnerOfFetchPlaylistItem)

// 동영상 id를 이용하여 동영상 설명의 email 추출
const MAX_FETCH_VIDEO_LENGTH = 50
const spinnerOfFetchVideoInfo = spinnerCarousel('FETCH VIDEO INFO')
while (videoIds.length > 0) {
    const searchVideoIds = videoIds.splice(0, MAX_FETCH_VIDEO_LENGTH)
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
        const emails = new Set(snippet.description.match(emailRegex))
        finalDict[snippet.channelId]['emails'] = [...new Set([...finalDict[snippet.channelId]['emails'], ...emails])]
    })
}
clearInterval(spinnerOfFetchVideoInfo)

const emailDatas: string[] = []
const emailNotFoundDatas: string[] = []

for (const [id, data] of Object.entries(finalDict)) {
    const emails = data.emails.length;
    const insertData = `${id}${seperator}${data.channelHandler}${seperator}${data.channelName}${seperator}${data.emails.join(' ')}`;
    (emails === 0 ? emailNotFoundDatas : emailDatas).push(insertData)
}

await Promise.all([
    fs.promises.appendFile(`${dataPath}/emails.txt`, emailDatas.join('\n') + ((emailDatas.length > 0) ? '\n' : '')),
    fs.promises.appendFile(`${dataPath}/not-found.txt`, emailNotFoundDatas.join('\n') + ((emailNotFoundDatas.length > 0) ? '\n' : '')),
    fs.promises.appendFile(`${dataPath}/retry-failed.txt`, retrySearches.join('\n') + ((retrySearches.length > 0) ? '\n' : '')),
    fs.promises.rm(toSearchEmailListFile)
])