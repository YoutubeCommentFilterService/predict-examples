import axios, { type AxiosResponse } from 'axios'
import type { ChannelInfo, YoutubeChannelList, YoutubeChannelResource } from '../types';

export default class ChannelInfoFetcher {
    private youtubeDataKey: string | undefined;
    constructor() {
        this.youtubeDataKey = process.env.YOUTUBE_DATA_API_KEY
    }

    fetchChannelInfoByChannelId = async (channelId: string): Promise<ChannelInfo> => {
        try {
            const response = await axios.get<YoutubeChannelList>('https://www.googleapis.com/youtube/v3/channels', {
                params: {
                    key: this.youtubeDataKey,
                    part: 'contentDetails,snippet',
                    id: channelId,
                    totalResults: 1,
                }
            })
            const data = response.data;
            return this.getChannelDefaultInfo(data.items[0]);
        } catch (err) {
            if (axios.isAxiosError(err)) console.error(err.response?.data)
            else console.error(err)
            return {
                id: '',
                playlistId: '',
                handler: '',
            }
        }
    }

    fetchChannelInfoByChannelIds = async (channelIds: string[], totalResults: number): Promise<ChannelInfo[]> => {
        try {
            const response = await axios.get<YoutubeChannelList>('https://www.googleapis.com/youtube/v3/channels', {
                params: {
                    key: this.youtubeDataKey,
                    part: 'contentDetails,snippet',
                    id: channelIds.join(','),
                    totalResults,
                }
            })
            const data = response.data;
            return data.items.map((item) => this.getChannelDefaultInfo(item))
        }catch (err) {
            if (axios.isAxiosError(err)) console.error(err.response?.data)
            else console.error(err)
            return [{
                id: '',
                playlistId: '',
                handler: '',
            }]
        }
    }

    fetchChannelInfoByChannelHandler = async (channelHandle: string): Promise<ChannelInfo> => {
        try {
            const response = await axios.get<YoutubeChannelList>('https://www.googleapis.com/youtube/v3/channels', {
                params: {
                    key: this.youtubeDataKey,
                    part: 'contentDetails,snippet',
                    forHandle: channelHandle,
                    totalResults: 1,
                }
            })
            const data = response.data;
            return this.getChannelDefaultInfo(data.items[0]);
        } catch (err) {
            if (axios.isAxiosError(err)) console.error(err.response?.data)
            else console.error(err)
            return {
                id: '',
                playlistId: '',
                handler: ''
            }
        }
    }

    private getChannelDefaultInfo = (info: YoutubeChannelResource): ChannelInfo => ({
        id: info.id,
        playlistId: info.contentDetails.relatedPlaylists.uploads,
        handler: info.snippet.customUrl,
    })
}