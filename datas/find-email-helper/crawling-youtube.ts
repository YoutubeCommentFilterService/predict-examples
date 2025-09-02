import puppeteer, { Browser, Page } from 'puppeteer';
import { MAX_RETRY_COUNT, MAX_THREAD_SIZE, RETRY_EMAIL_LIST_FILE_PATH, SEARCH_EMAIL_LIST_FILE_PATH } from './constants';
import fs from 'fs';
import pLimit from 'p-limit';
import spinnerCarousel from './spinner-carousel';
import { seperator } from '../../modules';
import type { YoutubeChannelUUIDInfo, YoutubeCrawlResult } from '../types/youtube';

const pagePool: Page[] = []
const emailFetchProcessLimit = pLimit(MAX_THREAD_SIZE)

const tagSeperator = new RegExp(`[,${seperator}]`, 'g');
let emailSearchTargetByChannelId: string[] = []
try {
    emailSearchTargetByChannelId = fs.readFileSync(SEARCH_EMAIL_LIST_FILE_PATH, 'utf-8')
                                .trim().split('\n')
                                .slice(1).map(line => line.split(tagSeperator)[0])
} catch(e) {
    emailSearchTargetByChannelId = []
}

const retryTargetByChannelId = fs.readFileSync(RETRY_EMAIL_LIST_FILE_PATH, 'utf-8')
                            .trim().split('\n')
                            .map(line => line.split(tagSeperator)[0])
const searchTargetChannelIds = [ ...emailSearchTargetByChannelId, ...retryTargetByChannelId ].filter(channelId => channelId)

async function openBrowser(args: string[] = []): Promise<Browser> {
    return await puppeteer.launch({ 
        headless: true, 
        args: [
            '--disable-gpu',
            '--window-size=720,1080',
            ...args
        ], 
        defaultViewport: { width: 720, height: 1080 }
    });
}

async function closeBrowser(browser: Browser) {
    await browser.close()
}

async function crawlingStart(browser: Browser): Promise<YoutubeCrawlResult> {
    const crawlSucceedList: YoutubeChannelUUIDInfo[] = []
    const crawlFaildList: YoutubeChannelUUIDInfo[] = []
    for (let retryCount = 0; ; retryCount++) {
        const timer = spinnerCarousel('CRAWLING CHANNEL UUID')
        const { succeed: succeedList, failed: retryList } = await retrySearch(browser, retryCount, crawlFaildList.map(item => item.channelId).filter(channelId => channelId))
        crawlSucceedList.push(...succeedList)
        crawlFaildList.splice(0, crawlFaildList.length, ...retryList)
        clearInterval(timer);
        if (crawlFaildList.length == 0) break;
        if (retryCount === MAX_RETRY_COUNT) break;
    }
    return { succeed: crawlSucceedList, failed: crawlFaildList }
}

async function fetchYoutubeChannelUUID(
    browser: Browser, 
    channelId: string, 
    maxThreadSize: number = 16
): Promise<YoutubeChannelUUIDInfo> {
    const moreButtonSelector = '#page-header > yt-page-header-renderer > yt-page-header-view-model > div > div.page-header-view-model-wiz__page-header-headline > div > yt-description-preview-view-model'
    const channelNameSelector = '#page-header > yt-page-header-renderer > yt-page-header-view-model > div > div.page-header-view-model-wiz__page-header-headline > div > yt-dynamic-text-view-model > h1 > span'
    const uuidComponentSelector = '#content > ytd-section-list-renderer'

    const page = await getPage(browser)

    const intervalRate = (0.5 + Math.random()) * 100 * maxThreadSize

    let intervalTimerId
    try {
        await page.goto(`https://youtube.com/channel/${channelId}`, { waitUntil: 'domcontentloaded' })

        intervalTimerId = setInterval(async () => { await page.bringToFront(); }, intervalRate);

        await page.waitForSelector(moreButtonSelector, { timeout: 10000 })

        const channelName = await page.$eval(channelNameSelector, el => el.innerText);

        await page.click(moreButtonSelector)
        await page.waitForSelector('#about-container', { timeout: 10000 })

        const uuid = (await page.$eval(uuidComponentSelector, element => element.getAttribute('panel-target-id')))!
    
        return { channelId, uuid, channelName }
    } catch (e) {
        return { channelId }
    } finally {
        await releasePage(page);
        if (intervalTimerId) clearInterval(intervalTimerId);
    }
}

async function retrySearch(browser: Browser, retryCount: number, retrySearchChannelIds: string[]): Promise<YoutubeCrawlResult> {
    const channelIds = retryCount === 0 ? searchTargetChannelIds : retrySearchChannelIds
    let retryList: YoutubeChannelUUIDInfo[] = []
    try {
        const reuslt = await Promise.all(
            channelIds.map(
                channelId => processLimitedFetchYoutubeChannelUUID(browser, channelId)
            )
        )
        const finishedList: YoutubeChannelUUIDInfo[] = reuslt.filter(res => res.uuid)
        retryList = reuslt.filter(res => !res.uuid)

        return { succeed: finishedList, failed: retryList }
    } finally {
        retrySearchChannelIds.splice(0, retrySearchChannelIds.length, ...retryList.map(item => item.channelId))
        console.log(` - ${retryCount}차 실패 개수: ${retrySearchChannelIds.length}`)
        await releaseAllPage()
    }
}

function processLimitedFetchYoutubeChannelUUID(browser: Browser, channelId: string) {
    return emailFetchProcessLimit(() => fetchYoutubeChannelUUID(browser, channelId))
}

async function getPage(browser: Browser) {
    if (pagePool.length > 0) {
        const page = pagePool.pop()!;
        if (!page.isClosed()) return page;
    }

    const page = await browser.newPage()

    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) req.abort();
        else req.continue();
    });
    return page;
}

async function releasePage(page: Page) {
    if (pagePool.length < MAX_THREAD_SIZE) {
        pagePool.push(page);
    } else {
        if (!page.isClosed()) page.close();
    }
}

async function releaseAllPage() {
    await Promise.allSettled(pagePool.map(async page => {
        await page.close();
    }))
    pagePool.splice(0, pagePool.length);
}


export { openBrowser, closeBrowser, crawlingStart }