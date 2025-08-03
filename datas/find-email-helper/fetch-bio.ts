import axios from 'axios';
import type { YoutubeChannelBio, YoutubeChannelBioResponse } from "../types/youtube";
import type { FacebookLeftPannelDescription } from '../types/facebook';
import * as cheerio from 'cheerio';
import emailRegex from './email-regex';
import { EMAIL_REGEX } from './constants';

const baseAxiosHeader = {
    'User-Agent': ' Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
}

const handlerMap = new Map<string, (content: string) => Promise<string[]>>([
    ['facebook', fetchFacebookInfo],
    ['chzzk', fetchChzzkInfo],
    ['soop', fetchAfreecaInfo],
])

async function fetchAfreecaInfo(url: string) {
    const channelId = url.split('/')[1]

    const headers = { ...baseAxiosHeader }
    try {
        const { data } = await axios.get(`https://chapi.sooplive.co.kr/api/${channelId}/station`, { headers })
        const channelDescription = data.get('station', {}).get('display', {}).get('profile_text', '') as string
        return channelDescription.match(emailRegex) || []
    } catch (e) {
        return []
    }
}

async function fetchChzzkInfo(url: string) {
    const channelId = url.split('/')[1]

    const headers = { ...baseAxiosHeader }
    try {
        const { data } = await axios.get(`https://api.chzzk.naver.com/service/v1/channels/${channelId}`, { headers })
        const channelDescription = data.get('content', {}).get('channelDescription', '') as string
        return channelDescription.match(EMAIL_REGEX) || []
    } catch (e) {
        return []
    }
}

async function fetchFacebookInfo(url: string) {
    const headers = {
        ...baseAxiosHeader,
        'accept': 'text/html,application/xhtml+xml',
        'accept-language': 'ko,en;q=0.9,en-US;q=0.8,zh-CN;q=0.7,zh;q=0.6',
    }
    try {
        const { data: html } = await axios.get(url, { headers })

        const $ = cheerio.load(html)
        const leftpannel_json_stringified = [ ...$('body').find('script') ].filter(el => $(el).text().includes('ProfileTileViewContextListRenderer'))[0]
        const parsed = JSON.parse($(leftpannel_json_stringified).text()) as FacebookLeftPannelDescription

        return parsed.require?.[0]?.[3]
                    ?.filter(el => el.__bbox?.require)
                    ?.flatMap(el => el.__bbox.require!)
                    ?.filter(req => req[0] === "RelayPrefetchedStreamCache")
                    ?.flatMap(req => req[3]?.[1]?.__bbox?.result?.data?.profile_tile_sections?.edges || [])
                    ?.filter(edge => edge.node.profile_tile_section_type === "INTRO")
                    ?.flatMap(edge => edge.node.profile_tile_views.nodes)
                    ?.flatMap(view => view.view_style_renderer?.view.profile_tile_items.nodes || [])
                    ?.map(item =>
                        item.node.profile_status_text?.text ?? 
                        item.node.timeline_context_item?.renderer.context_item.title.text ??
                        ''
                    )
                    .map(decodeURIComponent)
                    .flatMap(description => description.match(EMAIL_REGEX) || [])
    } catch (e) {
        return []
    }
}

async function fetchSiteChannelDescription(url: string) {
    // bio link에도 이메일을 적는 경우가 종종 있다
    url = url.trim()
    if (emailRegex.test(url)) return [url]
    for (const [keyword, handler] of handlerMap) {
        if (url.includes(keyword)) return await handler(url)
    }
    return []
}

async function fetchChannelData(channelId: string, channelUUID: string): Promise<YoutubeChannelBio> {
    const toBase64 = `â©²\`${channelId}D8gYrGimaASYK${Buffer.from(`$${channelUUID}`).toString('base64url')}%3D%3D`

    try {
        const { data } = await axios.post<YoutubeChannelBioResponse>(
            'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
                "context": {
                    "client": {
                        "clientName": "WEB",
                        "clientVersion": "2.20250331.01.00",
                        "gl": "KR",
                        "hl": "ko"
                    }
                },
                "continuation": btoa(toBase64),
            }, {
                headers: { ...baseAxiosHeader }
            }
        )

        const youtubeBio = data.onResponseReceivedEndpoints
            .flatMap(endpoint => endpoint.appendContinuationItemsAction.continuationItems || [])
            .flatMap(continuation => continuation.aboutChannelRenderer.metadata.aboutChannelViewModel || [])
        const youtubeBioLinks = youtubeBio.flatMap(bio => bio.links || [])
            .map(link => {
                const url = link.channelExternalLinkViewModel.link.content
                return url.startsWith('http') ? url : `https://${url}`
            })
        const youtubeDescription = youtubeBio.flatMap(bio => bio.description)[0] || ''
        const canonicalChannelUrl = youtubeBio.flatMap(bio => bio.displayCanonicalChannelUrl)[0] || ''

        const emailsFromDescription = youtubeDescription.replace(/[\n\r\t\f\v]+/g, '  ').match(emailRegex) || [];
        const promiseResults = (await Promise.all(  youtubeBioLinks.map(fetchSiteChannelDescription) )).flat()

        return {
            channelId,
            channelHandler: canonicalChannelUrl.split('/')[1],
            emails: [...new Set([...emailsFromDescription, ...promiseResults])]
        }
    } catch (err) {
        console.error(err)
        return { channelId };
    }
}

if (require.main === module) {
    const channelId = 'UC1q4Ihlv_YhLELw-ijE0Diw'
    const uuid = '6d318ed2-0000-21a9-8dde-582429af5440'

    console.log(await fetchChannelData(channelId, uuid))
}

export default fetchChannelData;