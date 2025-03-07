import dotenv from 'dotenv';
import VideoFetcher from '../modules/video-fetcher';
import appRootPath from 'app-root-path';

dotenv.config({ path: `${appRootPath}/env/.env` })

const videoFetcher = new VideoFetcher();
const videos = await videoFetcher.fetchVideo();
for (let video of videos) {
    console.log(video)
}