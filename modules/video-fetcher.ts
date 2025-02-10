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
        notFetchFilter?: { categoryId?: string[], title?: string[]},
        fetchFilter?: { categoryId?: string[], title?: string[]},
    ): Promise<FetchedVideo[]> => {
        if (maxResults <= 0) maxResults = 10
        else if (maxResults > 50) maxResults = 50

        let nextPageToken: string | undefined = "";
        let videos: YoutubeVideo[] = []
        do {
            const response: AxiosResponse<YoutubeVideoList> = await axios.get<YoutubeVideoList>("https://www.googleapis.com/youtube/v3/videos", {
                params: {
                    key: this.youtubeDataKey,
                    part: "snippet",
                    maxResults,
                    regionCode: "KR",
                    chart: "mostPopular",
                    pageToken: nextPageToken,
                }
            })
            videos.push(...response.data.items)
            nextPageToken = response.data.nextPageToken
        } while(nextPageToken);

        if (notFetchFilter) {
            videos = videos.filter(video => {
                const result = 
                    !(notFetchFilter.categoryId?.includes(`${video.snippet.categoryId}`)) &&
                    !(notFetchFilter.title?.some(title => video.snippet.title.includes(title)))
                    // console.log(`${!(notFetchFilter.categoryId?.includes(video.snippet.categoryId))}, ${!(notFetchFilter.title?.some(title => video.snippet.title.includes(title)))} ==> category - ${video.snippet.categoryId.padStart(2, ' ')}, ${video.snippet.title}`)
                return result
            })
        }
        if (fetchFilter) {
            videos = videos.filter(video => 
                ((fetchFilter.categoryId?.length ?? 0) === 0 || fetchFilter.categoryId?.includes(video.snippet.categoryId)) ||
                ((fetchFilter.title?.length ?? 0) === 0 || fetchFilter.title?.some(title => video.snippet.title.includes(title)))
            )
        }

        return videos.map(video => ({
            id: video.id,
            title: video.snippet.title,
            thumbnail: video.snippet.thumbnails.medium.url,
            description: video.snippet.description,
            channelId: video.snippet.channelId,
            channelTitle: video.snippet.channelTitle,
            publishedAt: video.snippet.publishedAt,
            categoryId: video.snippet.categoryId,
        })) as FetchedVideo[]
    }

    fetchCategories = async (): Promise<{}> => {
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