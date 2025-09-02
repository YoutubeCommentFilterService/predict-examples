import axios, { isAxiosError } from 'axios';
import type { YoutubeChannelBio, YoutubeChannelBioResponse } from "../types/youtube";
import type { FacebookLeftPannelDescription } from '../types/facebook';
import type { XBioDescription } from '../types/x-twitter';
import * as cheerio from 'cheerio';
import emailRegex from './email-regex';
import { EMAIL_REGEX } from './constants';
import appRootPath from 'app-root-path';
import dotenv from 'dotenv';

dotenv.config({ path: `${appRootPath}/env/.env` })

const csrfToken = process.env.X_TWITTER_CSRF_TOKEN
const authToken = process.env.X_TWITTER_AUTH_TOKEN
const twitterToken = process.env.X_TWITTER_TEST_BEARER

const baseAxiosHeader = {
    'User-Agent': ' Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
}

const handlerMap = new Map<string, (content: string) => Promise<string[]>>([
    ['facebook', fetchFacebookInfo],
    ['chzzk', fetchChzzkInfo],
    ['soop', fetchAfreecaInfo],
    ['twitter', fetchXInfo],
    ['x', fetchXInfo],
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

async function fetchXInfo(url: string) {
    const features = '%7B%22verified_phone_label_enabled%22:false,%22creator_subscriptions_tweet_preview_api_enabled%22:false,%22highlights_tweets_tab_ui_enabled%22:false,%22rweb_tipjar_consumption_enabled%22:false,%22subscriptions_verification_info_verified_since_enabled%22:false,%22hidden_profile_subscriptions_enabled%22:false,%22subscriptions_feature_can_gift_premium%22:false,%22profile_label_improvements_pcf_label_in_post_enabled%22:false,%22responsive_web_graphql_timeline_navigation_enabled%22:false,%22subscriptions_verification_info_is_identity_verified_enabled%22:false,%22responsive_web_graphql_skip_user_profile_image_extensions_enabled%22:false,%22responsive_web_twitter_article_notes_tab_enabled%22:false,%22payments_enabled%22:false%7D'
    const variables = encodeURI(`{"screen_name":"${url.split('/').at(-1)}","withGrokTranslatedBio":false}`)
    const queryParam = `variables=${variables}&features=${features}`

    const cookies = {
        'auth_token': authToken,
        'ct0': csrfToken
    }
    const cookieHeader = Object.entries(cookies)
        .map(([key, val]) => `${key}=${val}`)
        .join(';')

    try {
        const { data } = await axios.get<XBioDescription>(`https://x.com/i/api/graphql/IHyLL37gkgw1TgIXAL6Wlw/UserByScreenName?${queryParam}`, {
            headers: {
                Authorization: `Bearer ${twitterToken}`,
                'x-csrf-token': csrfToken,
                Cookie: cookieHeader
            },
        })
        return data.data.user.result.legacy.description.match(emailRegex) || []
    } catch (err) {
        if (isAxiosError(err)) console.error(err.response?.data, '아마 csrf와 token의 문제')
        return []
    }
}

export async function fetchSiteChannelDescription(url: string) {
    // bio link에도 이메일을 적는 경우가 종종 있다
    url = url.trim()
    if (emailRegex.test(url)) return url.match(EMAIL_REGEX) || []
    const hostname = new URL(url).hostname
    for (const [keyword, handler] of handlerMap) {
        if (hostname.includes(keyword)) return await handler(url)
    }
    return []
}

export async function fetchChannelData(channelId: string, channelUUID: string): Promise<YoutubeChannelBio> {
    const toBase64 = `â©²\`${channelId}D8gYrGimaASYK${Buffer.from(`$${channelUUID}`).toString('base64url')}%3D%3D`

    try {
        const { data } = await axios.post<YoutubeChannelBioResponse>(
            'https://www.youtube.com/youtubei/v1/browse', {
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
    const channelId = 'UCUmX_vGkidKTdJ-s-vsNN0g'
    const uuid = '702c66bc-0000-211f-b0cc-582429c411e4'

    console.log(await fetchChannelData(channelId, uuid))
}