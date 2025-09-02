export interface YoutubeChannelBioResponse {
    onResponseReceivedEndpoints: YoutubeOnResponseRecievedEndpoint[]
}

interface YoutubeOnResponseRecievedEndpoint {
    appendContinuationItemsAction: {
        continuationItems: YoutubeContinuationItem[]
    }
}

interface YoutubeContinuationItem {
    aboutChannelRenderer: {
        metadata: { aboutChannelViewModel: YoutubeAboutChannelViewModel }
    }
}

interface YoutubeAboutChannelViewModel {
    description: string | undefined
    links?: { channelExternalLinkViewModel: {
        title: { 'content': string }
        link: { 'content': string }
    } }[]
    displayCanonicalChannelUrl: string
}

export interface YoutubePlaylistItemResponse {
    items: {
        id: string;
        contentDetails: { videoId: string }
    }[]
}

export interface YoutubeVideoResponse {
    items: {
        snippet: {
            channelId: string;
            description: string;
        }
    }[]
}

export interface FetchPlaylistItemResult {
    error: boolean
    items: string[]
}

export interface YoutubeChannelInfo {
    channelName: string
    channelHandler: string
    emails: string[]
    uuid?: string
}

export interface YoutubeChannelUUIDInfo {
    uuid?: string
    channelName?: string
    channelId: string
}

export interface YoutubeCrawlResult {
    succeed: YoutubeChannelUUIDInfo[]
    failed: YoutubeChannelUUIDInfo[]
}

export interface YoutubeChannelBio {
    channelId: string
    channelHandler?: string
    emails?: string[]
}

export interface ServiceTracking {
    service: string
    params: ServiceTrackingParam[]
}
export interface ServiceTrackingParam {
    key: string
    value: string
}
export interface YoutubeCrawlData {
    description: string
    externalLinks: string[]
    handler: string
    channelId: string
    channelName: string
}