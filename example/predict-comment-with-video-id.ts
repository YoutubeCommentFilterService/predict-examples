import type { FetchedComment } from '../types';
import CommentFetcher from '../modules/comment-fetcher';
import CommentPredicter from '../modules/comment-predicter';
import MailerService from '../modules/mailer-service';
import dotenv from 'dotenv'

dotenv.config({
    path: '../.env'
})

console.log(process.env.YOUTUBE_DATA_API_KEY)
const commentFetcher = new CommentFetcher();
const commentPredicter = new CommentPredicter();
const mailerService = new MailerService();

const videoId = 'SIN1HYksQ-0'
const fetchedComments: FetchedComment[] = await commentFetcher.fetchComment(videoId)
const predictedComments = await commentPredicter.predictComment(fetchedComments, videoId);

if (predictedComments.length !== 0) {
    const data = {
        video: {
            id: videoId,
            title: "asdf",
        },
        comments: predictedComments
    };

    mailerService.sendMail("gkstkdgus821@gmail.com", data);
}