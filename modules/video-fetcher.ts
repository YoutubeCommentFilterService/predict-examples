import axios, { isAxiosError } from 'axios'
import type { FetchedVideo, YoutubeVideo, YoutubeVideoCategoryList, YoutubeVideoList } from '../types';
import { exec } from 'child_process'

export default class VideoFetcher {
    private youtubeDataKey: string | undefined;
    private enailRegex: RegExp = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    private dayMillisec = 1000 * 60 * 60 * 24;

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

    private removeShortsVideoItem = async (videos: YoutubeVideo[]) => {
        return (await Promise.all(
            videos.map(async (video) => {
                const isShortsVideo = await this.isShortsVideo(video)
                return isShortsVideo ? null : video
            })
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
        return new Promise((resolve, reject) => {
            if (!videoId) reject('plz input youtube videoId')
            exec(`yt-dlp -F 'https://www.youtube.com/watch?v=${videoId}'`, (err, stdout, stderr) => {
                if (err) reject(`exec error: ${err}`);
                if (stderr) reject(`stderr: ${stderr}`);

                const notStartsWith = ['[', '---', 'ID']

                const lines = stdout.trim().split('\n').filter(
                    line => line && !notStartsWith.some(prefix => line.startsWith(prefix))
                )
                
                const results = []
                for (let line of lines) {
                    const [id, ext, resolution, ...rest] = line.split(/\s+/)
                    if (!['webm', 'mp4'].includes(ext)) continue;
                    if (resolution === 'audio') continue;
                    results.push({id, ext, resolution})
                }
    
                const [width, height] = results.at(-1)?.resolution.toLowerCase().split('x') || []
                if (!width || !height) reject(`video ${videoId} resolution not found`);
    
                const videoRatio = Number(width) / Number(height)
                if (Number.isNaN(videoRatio)) reject(`video ${videoId} resolution calculation result is NaN`)
    
                resolve(videoRatio)
            })
        })
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