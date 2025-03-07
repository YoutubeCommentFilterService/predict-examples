import dotenv from 'dotenv';
import VideoFetcher from '../modules/video-fetcher';
import appRootPath from 'app-root-path';

dotenv.config({ path: `${appRootPath}/env/.env` })

const videoFetcher = new VideoFetcher()
const categories = await videoFetcher.fetchCategories()
console.log(categories)