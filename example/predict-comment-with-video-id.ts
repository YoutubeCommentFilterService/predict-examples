import type { ExtractedComment } from '../types';
import dotenv from 'dotenv'

import fs from 'fs';
import appRootPath from 'app-root-path';
import { Services } from '../modules';

dotenv.config({
    path: '../.env'
})

console.log(process.env.YOUTUBE_DATA_API_KEY)
const channelInfoFercher = new Services.ChannelInfoFetcher();
const videoFetcher = new Services.VideoFetcher();
const commentFetcher = new Services.CommentFetcher();
const commentPredictor = new Services.CommentPredictor();


const videoIds: string[] = ['vEIjQYiiOvM'];

const alreadyPredictedVideoDB = `${appRootPath}/datas/already-predicted.txt`
const alreadyPredictedVideo = fs.readFileSync(alreadyPredictedVideoDB, 'utf-8').trim().split('\n')

for (let videoId of videoIds) {
    const { comments: fetchedComments, lastSearchTime } = await commentFetcher.fetchCommentsByVideoId(videoId, '');
    console.time("Execution Time")
    const predicted = await commentPredictor.predictComment(fetchedComments, videoId);
    console.timeEnd("Execution Time")

    if (predicted.length === 0) continue; // 스팸으로 판명된 것이 없음
}