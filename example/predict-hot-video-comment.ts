import dotenv from 'dotenv'
import VideoFetcher from '../modules/video-fetcher';
import CommentFetcher from '../modules/comment-fetcher';
import CommentPredictor from '../modules/comment-predictor';
import MailerService from '../modules/mailer-service';

dotenv.config({
    path: '../.env'
})
const videoFetcher = new VideoFetcher();
const commentFetcher = new CommentFetcher();
const commentPredicter = new CommentPredictor();
const mailerService = new MailerService();

const excludeCategory = ['음악', '뉴스/정치']
const excludeTitle = ['MV', 'M/V', 'mv', 'm/v', '직캠']

const categories = await videoFetcher.fetchCategories();
let videos = await videoFetcher.fetchVideo()

for (let video of videos) {
    const comments = await commentFetcher.fetchComment(video.id);
    const predictResults = await commentPredicter.predictComment(comments, video.id);

    // const mailData = {
    //     video: {
    //         id: video.id,
    //         title: video.snippet.title,
    //     },
    //     comments: predictResults
    // }
    // mailerService.sendMail("gkstkdgus821@gmail.com", mailData);
}