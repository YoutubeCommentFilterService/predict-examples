import axios, { type AxiosResponse } from 'axios'
import type { FetchedVideo, YoutubeVideo, YoutubeVideoCategoryList, YoutubeVideoList } from '../types';

export default class VideoFetcher {
    private youtubeDataKey: string | undefined;
    constructor() {
        this.youtubeDataKey = process.env.YOUTUBE_DATA_API_KEY;
        if (!this.youtubeDataKey) return;
    }

    fetchVideo = async (
        maxResults: number = 10, 
        includeShorts: boolean = false
    ): Promise<FetchedVideo[]> => {
        if (maxResults <= 0) maxResults = 10
        else if (maxResults > 50) maxResults = 50

        let nextPageToken: string | undefined = "";
        let videos: YoutubeVideo[] = []
        do {
            const response: AxiosResponse<YoutubeVideoList> = await axios.get<YoutubeVideoList>("https://www.googleapis.com/youtube/v3/videos", {
                params: {
                    ...this.defaultParams(maxResults, nextPageToken),
                }
            })
            videos.push(...response.data.items)
            nextPageToken = response.data.nextPageToken
        } while(nextPageToken);

        if (!includeShorts) videos = videos.filter(video => !this.isShortsVideo(video))

        return this.generateCommonVideoDatas(videos);
    }

    fetchVideoByCategoryId = async(videoCategoryId: string | number, maxResults: number, includeShorts: boolean = false): Promise<FetchedVideo[]> => {
        if (maxResults <= 0) maxResults = 10
        else if (maxResults > 50) maxResults = 50
        let nextPageToken: string | undefined = "";
        let videos: YoutubeVideo[] = []
        do {
            const response: AxiosResponse<YoutubeVideoList> = await axios.get<YoutubeVideoList>("https://www.googleapis.com/youtube/v3/videos", {
                params: {
                    ...this.defaultParams(maxResults, nextPageToken),
                    videoCategoryId: `${videoCategoryId}`,
                }
            })
            videos.push(...response.data.items)
            nextPageToken = response.data.nextPageToken
        } while(nextPageToken);
        
        if (!includeShorts) videos = videos.filter(video => !this.isShortsVideo(video))

        return this.generateCommonVideoDatas(videos)
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
        chart: "mostPopular",
        pageToken: nextPageToken,
    })

    private isShortsVideo = (video: YoutubeVideo): boolean => {
        const isUnderMinutes = this.convertISO8601ToSecond(video.contentDetails.duration) <= 120 // 2분
        const isDescriptionIncludesHashtag = /#shorts/gi.test(video.snippet.description)
        return isUnderMinutes || isDescriptionIncludesHashtag;
    };

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
            console.error(err)
        }
        return categories;
    }
}