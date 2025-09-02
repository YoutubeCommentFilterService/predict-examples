import axios, { type AxiosResponse } from 'axios'
import type { YoutubeCommentThreadList, ExtractedComment, YoutubeCommentThread, YoutubeComment, YoutubeCommentList } from '../types';
import Translator from './translator';
import { setTimeout } from 'timers/promises';

export default class CommentFetcher {
    private youtubeDataKey: string | undefined;
    private translator: Translator;
    private imojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1FAFF}]|[\u{2600}-\u{26FF}]/gu;
    private trimRegex = /[\s]/g;
    private koreanRegex = /[가-힣ㄱ-ㅎㅏ-ㅣ0-9]/g;

    constructor() {
        this.youtubeDataKey = process.env.YOUTUBE_DATA_API_KEY;
        this.translator = new Translator();
        if (!this.youtubeDataKey) return;
    }

    fetchCommentsByVideoId = async (videoId: string, videoOwnerId: string, maxResults: number = 100, lastSearchTime: string | undefined = '1970-01-01T00:00:00Z'): Promise<{ comments: ExtractedComment[], lastSearchTime: string }> => {
        if (maxResults <= 0) maxResults = 0
        else if (maxResults > 100) maxResults = 100

        const baseTime = new Date(lastSearchTime)

        let nextPageToken: string | undefined | null = ""
        let comments: ExtractedComment[] = []

        const now = new Date().toISOString().split('.')[0] + 'Z'
        let retrycount = 0;
        do {
            try {
                if (retrycount > 3) {
                    console.error(`Retry limit exceeded for videoId: ${videoId}`);
                    break;
                }
                const data = await this.fetchCommentThreads(videoId, maxResults, nextPageToken);
                nextPageToken = data.nextPageToken;
                for (let topLevelComment of data.items) {
                    const extractedTopLevelComment = await this.extractComment(topLevelComment.snippet.topLevelComment);
                    extractedTopLevelComment.authorId !== videoOwnerId && comments.push(extractedTopLevelComment);
                    
                    const results = topLevelComment.snippet.totalReplyCount <= 5
                                        ? await this.fetchSubCommentsByParent(topLevelComment, videoOwnerId)
                                        : await this.fetchSubCommentById(topLevelComment.id, maxResults, videoOwnerId)
                    comments.push(...results)
                }
                
                retrycount = 0;
            } catch (err) {
                if (axios.isAxiosError(err)) {
                    const axiosError = err.response?.data
                    if (axiosError?.error?.errors?.reason === "processingFailure") {
                        nextPageToken = null;
                    } else {
                        retrycount++;
                        await setTimeout(1000);
                    }
                    console.error(axiosError?.error?.code, axiosError?.error?.errors)
                }
                else {
                    console.error(err)
                    nextPageToken = null;
                }
            }
        } while (nextPageToken);

        comments = comments.filter(comment => {
            const updatedTime = new Date(comment.updatedAt);
            return updatedTime > baseTime;
        })

        const seen: Set<string> = new Set();
        comments = comments.filter(comment => {
            if (seen.has(comment.id)) return false
            seen.add(comment.id)
            return true
        })

        comments.sort((a, b) => b.likes - a.likes)
        // 모든 댓글을 가져온 후 댓글 번역 시작
        // comments = await Promise.all(comments.map(async comment => {
        //     let translatedText = comment.translatedText
        //     // comment.translatedText = this.getKoreanRatio(comment.translatedText) <= 20
        //     //                             ? await this.translator.translate(translatedText)
        //     //                             : translatedText
        //     return comment;
        // }));

        return {comments, lastSearchTime: now};
    }

    private fetchCommentThreads = async (videoId: string, maxResults: number, nextPageToken: string | undefined | null) => {
        const response = await axios.get<YoutubeCommentThreadList>("https://www.googleapis.com/youtube/v3/commentThreads", {
            params: {
                key: this.youtubeDataKey,
                videoId,
                part: "snippet, replies",
                maxResults,
                pageToken: nextPageToken,
            }
        });
        return response.data;
    }

    private fetchSubCommentById = async (parentId: string, maxResults: number, videoOwnerId: string): Promise<ExtractedComment[]> => {
        if (maxResults < 0) maxResults = 0;
        if (maxResults > 100) maxResults = 100;

        let nextPageToken: string | undefined | null = ''
        const subComments: ExtractedComment[] = [];
        do {
            try {
                const response: AxiosResponse<YoutubeCommentList> = await axios.get<YoutubeCommentList>("https://www.googleapis.com/youtube/v3/comments", {
                    params: {
                        part: 'snippet',
                        key: this.youtubeDataKey,
                        parentId,
                        maxResults,
                        pageToken: nextPageToken,
                    }
                })
                const data = response.data;
                nextPageToken = data.nextPageToken;

                const replies = await this.extractComments(data.items, videoOwnerId, parentId);
                subComments.push(...replies)
            } catch (err) {
                if (axios.isAxiosError(err)) console.error(err.response?.data);
                else console.error(err)
                nextPageToken = null;
            }
        } while(nextPageToken);
        return subComments;
    }

    private fetchSubCommentsByParent = async (parentComment: YoutubeCommentThread, videoOwnerId: string) => {
        const replies = parentComment.replies?.comments || [];
        return await this.extractComments(replies, videoOwnerId, parentComment.id);
    }

    private extractComments = async (replies: YoutubeComment[], videoOwnerId: string, parentCommentId: string): Promise<ExtractedComment[]> => {
        const extractedReplies: ExtractedComment[] = [];
        for (let reply of replies) {
            if (reply.snippet.authorChannelId?.value === videoOwnerId) continue
            const result = await this.extractComment(reply, parentCommentId);
            extractedReplies.push(result);
        }
        return extractedReplies;
    }

    private extractComment = async (comment: YoutubeComment, parentCommentId?: string): Promise<ExtractedComment> => {
        const originalText = comment.snippet.textOriginal;
        const result = {
            id: parentCommentId ? comment.id.split('.')[1] : comment.id,
            likes: comment.snippet.likeCount,
            authorId: comment.snippet.authorChannelId?.value,
            nickname: comment.snippet.authorDisplayName,
            originalText: originalText,
            translatedText: originalText,    // 원래는 translatedText로 하면 안되긴 하지만, 일관성을 위해 사용
            profileImage: comment.snippet.authorProfileImageUrl,
            publishedAt: comment.snippet.publishedAt,
            updatedAt: comment.snippet.updatedAt,
            parentId: parentCommentId || "",
        } as ExtractedComment;
        return result;
    }

    private getKoreanRatio = (text: string): number => {
        const cleanedText = text.replace(this.trimRegex, '');
        const imojis = cleanedText.match(this.imojiRegex);
        // 이모지가 많은 경우 그냥 원본을 쓰자. 저렇게 병적으로 쓰는 경우는 거의 없다.
        if (imojis && imojis.length / cleanedText.length * 100 > 40) return 100;
        const koreans = cleanedText.match(this.koreanRegex);
        if (!koreans) return 0;
        return koreans.length / cleanedText.length * 100;
    }
}