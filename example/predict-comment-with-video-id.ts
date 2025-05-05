import dotenv from 'dotenv'
import { Services } from '../modules';

dotenv.config({
    path: '../env/.env'
})

const commentFetcher = new Services.CommentFetcher();
const commentPredictor = new Services.CommentPredictor();

// bBwgxAboHxI
// 2bIg5GvLQ7Q - 임영웅
const videoIds: string[] = ['2bIg5GvLQ7Q'];

for (let videoId of videoIds) {
    const { comments: fetchedComments, lastSearchTime } = await commentFetcher.fetchCommentsByVideoId(videoId, '');
    console.log(fetchedComments.length);
    console.time("Execution Time")
    const predicted = await commentPredictor.predictComment(fetchedComments, videoId);
    console.timeEnd("Execution Time")

    if (predicted.length === 0) continue; // 스팸으로 판명된 것이 없음
}