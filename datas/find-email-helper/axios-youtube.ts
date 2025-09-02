import axios, { isAxiosError } from 'axios'
import * as cheerio from 'cheerio'
import type { ServiceTracking, ServiceTrackingParam, YoutubeCrawlData } from '../types/youtube';

export async function fetchYoutubeBio(channelId: string): Promise<YoutubeCrawlData> {
    try {
        const { data: html } = await axios.get(`https://youtube.com/channel/${channelId}`)
        const $ = cheerio.load(html)

        const scriptEl = $('script')
            .toArray()
            .find(el => $(el).attr('nonce') && $(el).text().slice(0, 100).includes('ytInitialData'));
        const scriptText = scriptEl ? $(scriptEl).text() : '{}';

        const scriptJson = scriptText.replace(/^var\s+\w+\s*=\s*/, '').replace(/;$/, '');
        const parsedJson = JSON.parse(scriptJson);

        const trackingParams: ServiceTracking[] = parsedJson.responseContext.serviceTrackingParams
        const csiParams: ServiceTrackingParam[] = trackingParams.find((x) => x.service === 'CSI')?.params ?? [];

        const clientName = csiParams.find(x => x.key === 'c')?.value;
        const clientVersion = csiParams.find(x => x.key === 'cver')?.value;

        const targetId = '$' + parsedJson['header']['pageHeaderRenderer']['content']['pageHeaderViewModel']['description']['descriptionPreviewViewModel']['rendererContext']['commandContext']['onTap']['innertubeCommand']['showEngagementPanelEndpoint']['identifier']['tag']
        const base64edTargetId = encodeURIComponent(Buffer.from(targetId, 'utf-8').toString('base64'))

        const continuation = '4qmFsgJg' + Buffer.from(`${channelId}D8gYrGimaASYK${base64edTargetId}`, 'utf-8').toString('base64')

        const body = {
            context: {
                client: {
                    hl: 'ko',
                    gl: 'KR',
                    clientName,
                    clientVersion
                }
            },
            continuation
        }
        const { data: info } = await axios.post('https://www.youtube.com/youtubei/v1/browse', body, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
                'Content-Type': 'application/json',
            }
        })

        const item = info['onResponseReceivedEndpoints'][0]['appendContinuationItemsAction']['continuationItems'][0]['aboutChannelRenderer']['metadata']['aboutChannelViewModel']
        const description = (item['description'] || 'undefined').replace(/\s+/g, ' ').trim()
        const externalLinks = (item['links'] || []).map(x => x['channelExternalLinkViewModel']['link']['content']).filter(Boolean)
        const handler = (item['displayCanonicalChannelUrl'] ?? '').trim().split('/')[1]

        return { description, externalLinks, handler, channelId, channelName: parsedJson['microformat']['microformatDataRenderer']['title'] || '' }
    } catch (e) {
        if (isAxiosError(e)) console.error(e.message)
        else console.error(e)
        return { description: '', externalLinks: [], handler: '', channelId, channelName: '' };
    }
}

if (require.main === module) {
    const channelId = 'UCJ9Mk-2MwdoS_zMKgkdVUNw'
    const result = await fetchYoutubeBio(channelId)
    console.log(result)
}