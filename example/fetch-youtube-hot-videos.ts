import dotenv from 'dotenv';
import CommentFetcher from '../modules/comment-fetcher';
import CommentPredictor from '../modules/comment-predictor';
import MailerService from '../modules/mailer-service';
import VideoFetcher from '../modules/video-fetcher';

dotenv.config({
    path: '../.env'
})
const videoFetcher = new VideoFetcher();

const videos = await videoFetcher.fetchVideo();
for (let video of videos) {
    console.log(video)
}