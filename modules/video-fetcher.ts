import axios, { type AxiosResponse } from 'axios'
import type { YoutubeVideo, YoutubeVideoCategoryList, YoutubeVideoList } from '../types';

export default class VideoFetcher {
    private youtubeDataKey: string | undefined;
    constructor() {
        this.youtubeDataKey = process.env.YOUTUBE_DATA_API_KEY;
        if (!this.youtubeDataKey) return;
    }

    fetchVideo = async (categoryId: string = '0', maxResults: number = 10): Promise<YoutubeVideo[]> => {
        if (maxResults <= 0) maxResults = 10
        else if (maxResults > 50) maxResults = 50

        let nextPageToken: string | undefined = "";
        const videos: YoutubeVideo[] = []
        // try {
        //     const response = await axios.get<YoutubeVideoList>("https://www.googleapis.com/youtube/v3/videos", {
        //         params: {
        //             key: this.youtubeDataKey,
        //             part: "snippet",
        //             maxResults: 50,
        //             regionCode: "KR",
        //             chart: "mostPopular",
        //             pageToken: nextPageToken,
        //             videoCategoryId: categoryId,
        //         }
        //     })
        //     videos.push(...response.data.items)
        // } catch (err) {}
        do {
            const response: AxiosResponse<YoutubeVideoList> = await axios.get<YoutubeVideoList>("https://www.googleapis.com/youtube/v3/videos", {
                params: {
                    key: this.youtubeDataKey,
                    part: "snippet",
                    maxResults: 50,
                    regionCode: "KR",
                    chart: "mostPopular",
                    pageToken: nextPageToken,
                }
            })
            videos.push(...response.data.items)
            nextPageToken = response.data.nextPageToken
        } while(nextPageToken);
        return videos;
    }

    fetchCategories = async (): Promise<{}> => {
        const categories = {}
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
            console.log(err)
        }
        return categories;
    }
}