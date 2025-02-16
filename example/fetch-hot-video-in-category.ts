import dotenv from 'dotenv';
import VideoFetcher from '../modules/video-fetcher';
import CommentFetcher from '../modules/comment-fetcher';
import CommentPredictor from '../modules/comment-predictor';
import MailerService from '../modules/mailer-service';

dotenv.config({path: '../.env'});

const videoFetcher = new VideoFetcher()
const commentFetcher = new CommentFetcher();
const commentPredicter = new CommentPredictor();
const mailerService = new MailerService();

const categories = await videoFetcher.fetchCategories()

const excludeCategory = ['음악', '뉴스/정치']
const excludeTitle = ['MV', 'M/V', 'mv', 'm/v', '직캠']

let videos = await videoFetcher.fetchVideo()
videos = videos.filter((video) => {
    const isExcludedCategory = excludeCategory.includes(categories[video.categoryId])
    const isExcludedTitle = excludeTitle.some(keyword => video.title.includes(keyword))
    return !(isExcludedCategory || isExcludedTitle)
})

for (let video of videos) {
    console.log(`${video.id}, ${categories[video.categoryId]}, ${video.title}`)
}
console.log(`total result: ${videos.length}`)
