import dotenv from 'dotenv';
import VideoFetcher from '../modules/video-fetcher';
import CommentFetcher from '../modules/comment-fetcher';
import fs from 'fs'
import appRootPath from 'app-root-path';

dotenv.config({ path: `${appRootPath}/env/.env` })

const commentFetcher = new CommentFetcher()

const argv = process.argv.slice(2)

if (argv.length !== 1) {
    console.error('매개변수는 1개입니다. videoId')
    process.exit(1)
}

const videoId = argv[0]
const { comments, lastSearchTime } = await commentFetcher.fetchCommentsByVideoId(videoId, '', 100)
const re = /\n+/g
fs.writeFile(`./${videoId}`, comments.map(data => data.translatedText.replace(re, '')).join('\n'), (err) => {
    if (err) console.error(err)
})

console.log(comments.length)