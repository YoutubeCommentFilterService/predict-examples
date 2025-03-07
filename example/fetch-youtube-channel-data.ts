import dotenv from 'dotenv';
import ChannelInfoFetcher from '../modules/channel-info-fetcher';
import appRootPath from 'app-root-path';

dotenv.config({ path: `${appRootPath}/env/.env` })

const channelInfoFetcher = new ChannelInfoFetcher();

const byChannelHandler = await channelInfoFetcher.fetchChannelInfoByChannelHandler("김도랜드")
const byChannelId = await channelInfoFetcher.fetchChannelInfoByChannelId(byChannelHandler.id);

console.log(byChannelHandler, byChannelId);