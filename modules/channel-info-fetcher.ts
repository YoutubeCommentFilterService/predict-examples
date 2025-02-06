export default class ChannelInfoFetcher {
    private youtubeDataKey: string | undefined;
    constructor() {
        this.youtubeDataKey = process.env.YOUTUBE_DATA_API_KEY
    }

    fetchChannelInfo = async (channelId: string) => {
        
    }
}