import dotenv from 'dotenv';
import VideoFetcher from '../modules/video-fetcher';

dotenv.config({path: '../.env'})

const videoFetcher = new VideoFetcher()
const categories = await videoFetcher.fetchCategories()
console.log(categories)