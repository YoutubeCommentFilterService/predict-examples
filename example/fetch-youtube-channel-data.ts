import dotenv from 'dotenv';
import fs from 'fs';
import ChannelInfoFetcher from '../modules/channel-info-fetcher';

dotenv.config({path: '../.env'})

const channelInfoFetcher = new ChannelInfoFetcher();

const byChannelHandler = await channelInfoFetcher.fetchChannelInfoByChannelHandler("김도랜드")
const byChannelId = await channelInfoFetcher.fetchChannelInfoByChannelId(byChannelHandler.id);

console.log(byChannelHandler, byChannelId);