import CommentFetcher from '../modules/comment-fetcher';
import CommentPredictor from '../modules/comment-predictor';
import MailerService from '../modules/mailer-service';
import type { FetchedComment } from '../types';
import dotenv from 'dotenv'

dotenv.config({
    path: '../.env'
})

console.log(process.env.YOUTUBE_DATA_API_KEY)
const commentFetcher = new CommentFetcher();
const commentPredictor = new CommentPredictor();
const mailerService = new MailerService();

const videoId = '-SI22ZU0mFQ'
const fetchedComments: FetchedComment[] = await commentFetcher.fetchComment(videoId);
console.time("Execution Time")
const predictedComments = await commentPredictor.predictComment(fetchedComments, videoId);
console.timeEnd("Execution Time")

console.log(predictedComments)

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