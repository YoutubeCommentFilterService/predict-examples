import axios, { isAxiosError } from 'axios'
import type { FetchedVideo, YoutubeVideo, YoutubeVideoCategoryList, YoutubeVideoList } from '../types';
import { exec, spawn as spawn } from 'child_process'
import pLimit from 'p-limit';

export default class VideoFetcher {
    private youtubeDataKey: string | undefined;
    private resolutionRegex = /(\d+x\d+)/i;
    private dayMillisec = 1000 * 60 * 60 * 24;
    private ytdlpFormatSpawn = (cmd: string, args: string[]): Promise<Set<string>> => new Promise((resolve, reject) => {
        const proc = spawn(cmd, args)

        const mediaFormats: Set<string> = new Set()
        proc.on('error', reject)
        proc.stdout.on('data', data => {
            const message: string = data.toString()
            message.split('\n').forEach(line => {
                if (this.resolutionRegex.test(line)) mediaFormats.add(line.match(this.resolutionRegex)?.at(0) || '')
            })
        })
        proc.on('close', code => code === 0 ? resolve(mediaFormats) : reject(new Error(`Exit code with ${code}`)))
    })

    constructor() {
        this.youtubeDataKey = process.env.YOUTUBE_DATA_API_KEY;
        if (!this.youtubeDataKey) return;
    }

    fetchVideo = async (
        maxResults: number = 10, 
        includeShorts: boolean = false, 
        maxDuration: number = 1000,
        notFetchFilter?: {categoryId: (number | string)[], title: string[]}
    ): Promise<FetchedVideo[]> => {
        if (maxResults <= 0) maxResults = 10
        else if (maxResults > 50) maxResults = 50

        let nextPageToken: string | undefined = "";
        let videos: YoutubeVideo[] = []
        do {
            let { data }: { data: YoutubeVideoList } = await axios.get<YoutubeVideoList>("https://www.googleapis.com/youtube/v3/videos", {
                params: {
                    ...this.defaultParams(maxResults, nextPageToken),
                    chart: "mostPopular",
                }
            })
            let items = data.items.filter(video => this.doNotFetchVideoFilter(video, notFetchFilter))
            videos.push(...this.filterOldVideos(items, maxDuration))
            nextPageToken = data.nextPageToken
            data = null as any;
        } while(nextPageToken);

        if (!includeShorts) await this.removeShortsVideoItem(videos)

        return this.generateCommonVideoDatas(videos);
    }

    fetchVideoByCategoryId = async (
        videoCategoryId: string | number, 
        maxResults: number = 10, 
        includeShorts: boolean = false, 
        maxDuration: number = 1000,
        notFetchFilter?: {categoryId: (number | string)[], title: string[]}
    ): Promise<FetchedVideo[]> => {
        if (maxResults <= 0) maxResults = 0
        else if (maxResults > 50) maxResults = 50
        let nextPageToken: string | undefined = "";
        let videos: YoutubeVideo[] = []
        do {
            let { data }: { data: YoutubeVideoList } = await axios.get<YoutubeVideoList>("https://www.googleapis.com/youtube/v3/videos", {
                params: {
                    ...this.defaultParams(maxResults, nextPageToken),
                    videoCategoryId: `${videoCategoryId}`,
                    chart: "mostPopular",
                }
            })
            let items = data.items.filter(video => !this.doNotFetchVideoFilter(video, notFetchFilter))
            videos.push(...this.filterOldVideos(items, maxDuration))
            nextPageToken = data.nextPageToken
            data = null as any;
        } while(nextPageToken);
        
        if (!includeShorts) videos = await this.removeShortsVideoItem(videos)

        return this.generateCommonVideoDatas(videos)
    }

    fetchVideoById = async (
        videoIds: string[],
        maxResults: number = 50,
    ) => {
        try {
            let { data }: { data: YoutubeVideoList } = await axios.get<YoutubeVideoList>("https://www.googleapis.com/youtube/v3/videos", {
                params: {
                    ...this.defaultParams(maxResults, ""),
                    id: videoIds.join(',')
                }
            })
            return this.generateCommonVideoDatas(data.items);
        } catch (err) {
            if (isAxiosError(err)) console.error(err.response)
            return []
        }
    }

    private doNotFetchVideoFilter = (video: YoutubeVideo, notFetchFilter?: {categoryId: (number | string)[], title: string[]}) => {
        const videoTitle = video.snippet.title.toLowerCase();
        let notFetchFilterFlag = false
        const isKoreanInclude = /[가-힣]+/.test(videoTitle);
        if (notFetchFilter) {
            const { categoryId: categoryIds, title: titles } = notFetchFilter;
            notFetchFilterFlag = categoryIds?.includes(video.snippet.categoryId) ||
                                    titles?.some(title => videoTitle.includes(title))
        }
        return !isKoreanInclude || notFetchFilterFlag;
    }

    private filterOldVideos = (videos: YoutubeVideo[], daysLimit: number) => {
        return videos.filter(video => {
            const millisecDiff = new Date().setHours(0, 0, 0, 0) - new Date(video.snippet.publishedAt).setHours(0, 0, 0, 0)
            return millisecDiff / this.dayMillisec <= daysLimit
        })
    }

    private removeShortsVideoItem = async (videos: YoutubeVideo[]): Promise<YoutubeVideo[]> => {
        const limit = pLimit(10)
        return (await Promise.all(
            videos.map(async (video) => limit(
                async() => {
                    const isShortsVideo = await this.isShortsVideo(video)
                    return isShortsVideo ? null : video
                })
            )
        )).filter(video => video !== null) 
    }

    private generateCommonVideoDatas = (videos: YoutubeVideo[]): FetchedVideo[] => videos.map(video => ({
        id: video.id,
        title: video.snippet.title,
        thumbnail: video.snippet.thumbnails.medium.url,
        description: video.snippet.description,
        channelId: video.snippet.channelId,
        channelTitle: video.snippet.channelTitle,
        publishedAt: video.snippet.publishedAt,
        categoryId: video.snippet.categoryId,
    }));

    private defaultParams = (maxResults: number, nextPageToken: string) => ({
        key: this.youtubeDataKey,
        part: "snippet, contentDetails",
        maxResults,
        regionCode: "KR",
        pageToken: nextPageToken,
    })

    private isShortsVideo = async (video: YoutubeVideo): Promise<boolean> => {
        const videoRatio = await this.getVideoResolutionRatio(video.id);
        const isUnderMinutes = this.convertISO8601ToSecond(video.contentDetails.duration) <= 3 * 60 // 3분
        return isUnderMinutes && videoRatio <= 1;
    };

    private getVideoResolutionRatio = async (videoId: string): Promise<number> => {
        try {
            const mediaFormats: Set<string> = await this.ytdlpFormatSpawn('yt-dlp', ['-F', videoId])
            const [width, height] = mediaFormats.values().next().value?.split('x') as [string, string]
            return parseInt(width) / (parseInt(height))
        } catch {
            return -1
        }
    }

    private convertISO8601ToSecond = (duration: string): number => {
        const matched = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/)
        if (!matched) return NaN
        const [hour, minute, second] = matched.slice(1, 4).map(time => parseInt(time) || 0);
        return hour * 3600 + minute * 60 + second
    }

    fetchCategories = async (): Promise<{[key: string]: string}> => {
        const categories: {[key: string]: string} = {}
        try {
            const response = await axios.get<YoutubeVideoCategoryList>('https://www.googleapis.com/youtube/v3/videoCategories', {
                params: {
                    key: this.youtubeDataKey,
                    part: 'snippet',
                    hl: 'ko_KR',
                    regionCode: 'KR'
                },
            })
            for (let category of response.data.items) {
                categories[category.id] = category.snippet.title
            }
        } catch (err) {
            if (isAxiosError(err)) console.error(err)
        }
        return categories;
    }
}