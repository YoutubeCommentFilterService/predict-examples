import dotenv from 'dotenv';
import VideoFetcher from '../modules/video-fetcher';
import CommentFetcher from '../modules/comment-fetcher';

dotenv.config({path: '../.env'})

const videoFetcher = new VideoFetcher()
const commentFetcher = new CommentFetcher()

const argv = process.argv.slice(2)

if (argv.length !== 1) {
    console.error('매개변수는 1개입니다. videoId')
    process.exit(1)
}

const videoId = argv[0]
const { comments, lastSearchTime } = await commentFetcher.fetchCommentsByVideoId(videoId, 100)
console.log(comments.length)