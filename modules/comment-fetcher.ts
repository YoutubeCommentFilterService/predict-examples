import axios, { type AxiosResponse } from 'axios'
import type { YoutubeCommentThreadList, ExtractedComment, YoutubeCommentThread, YoutubeComment, YoutubeCommentList } from '../types';
import Translator from './translator';

export default class CommentFetcher {
    private youtubeDataKey: string | undefined;
    private translator: Translator;

    constructor() {
        this.youtubeDataKey = process.env.YOUTUBE_DATA_API_KEY;
        this.translator = new Translator();
        if (!this.youtubeDataKey) return;
    }

    fetchCommentsByVideoId = async (videoId: string, maxResults: number = 100, lastSearchTime: string | undefined = '1970-01-01T00:00:00Z'): Promise<{ comments: ExtractedComment[], lastSearchTime: string }> => {
        if (maxResults <= 0) maxResults = 0
        else if (maxResults > 100) maxResults = 100

        const baseTime = new Date(lastSearchTime)

        let nextPageToken: string | undefined | null = ""
        let comments: ExtractedComment[] = []

        const now = new Date().toISOString().split('.')[0] + 'Z'
        do {
            try {
                const data = await this.fetchCommentThreads(videoId, maxResults, nextPageToken);
                nextPageToken = data.nextPageToken;
                for (let topLevelComment of data.items) {
                    const extractedTopLevelComment = await this.extractComment(topLevelComment.snippet.topLevelComment);
                    extractedTopLevelComment && comments.push(extractedTopLevelComment);
                    
                    const results = topLevelComment.snippet.totalReplyCount <= 5
                                        ? await this.fetchSubCommentsByParent(topLevelComment)
                                        : await this.fetchSubCommentById(topLevelComment.id, maxResults)
                    comments.push(...results)
                }
            } catch (err) {
                if (axios.isAxiosError(err)) console.error(err.response?.data)
                else console.error(err)
                nextPageToken = null;
            }
        } while (nextPageToken);

        comments = comments.filter(comment => {
            const updatedTime = new Date(comment.updatedAt);
            return updatedTime > baseTime;
        })

        console.log(`fetch ${videoId}'s comment finished, len: ${comments.length}`)

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

    private fetchSubCommentById = async (parentId: string, maxResults: number): Promise<ExtractedComment[]> => {
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

                const result = await this.extractComments(data.items);
                subComments.push(...result)
            } catch (err) {
                if (axios.isAxiosError(err)) console.error(err.response?.data);
                else console.error(err)
                nextPageToken = null;
            }
        } while(nextPageToken);
        return subComments;
    }

    private fetchSubCommentsByParent = async (parentComment: YoutubeCommentThread) => {
        const replies = parentComment.replies?.comments || [];
        return await this.extractComments(replies);
    }

    private extractComments = async (replies: YoutubeComment[]): Promise<ExtractedComment[]> => {
        const extractedReplies: ExtractedComment[] = [];
        for (let reply of replies) {
            const result = await this.extractComment(reply);
            if (result) extractedReplies.push(result);
        }
        return extractedReplies;
    }

    //.replace(/[^ㄱ-ㅎㅏ-ㅣ가-힣a-zA-Z0-9\~\!\@\#\$\%\^\&\*\(\)\_\+\-\=\[\]\{\}\:\;\"\'\<\>\,\.\?\/\s]/g, '')
    private extractComment = async (comment: YoutubeComment): Promise<ExtractedComment | undefined> => {
        const originalText = comment.snippet.textOriginal;
        let trimmedText = originalText.replace(/[\r\n]+/g, ' ') // 개행을 띄어쓰기로 변환
                                        .replace(/\s+/g, ' ')   // 띄어쓰기가 여러개인 경우 1개로 변환
                                        .replace(/(.)\1{2,}/g, (_: any, char: string) => char.repeat(2))    // 같은 단어가 여러 개 반복되는 경우 2개로 제한
                                        .trim();
        // 한국어 비율 체크하여 번역. ratio는 % 단위 -> 0 ~ 100
        // 20 이하인 경우 높은 확률로 외국어 댓글
        const translatedText = this.getKoreanRatio(trimmedText) <= 20
                                    ? await this.translator.translate(trimmedText)
                                    : trimmedText.replace(/[^ㄱ-ㅎㅏ-ㅣ가-힣a-zA-Z0-9\~\!\@\#\$\%\^\&\*\(\)\_\+\-\=\[\]\{\}\:\;\"\'\<\>\,\.\?\/\s]/g, '')
        if (!trimmedText) return undefined;
        const result = {
            id: comment.id,
            likes: comment.snippet.likeCount,
            nickname: comment.snippet.authorDisplayName,
            originalText: originalText,
            translatedText,
            profileImage: comment.snippet.authorProfileImageUrl,
            publishedAt: comment.snippet.publishedAt,
            updatedAt: comment.snippet.updatedAt,
        };
        return result;
    }

    // private extractComment = (fetchedComments: YoutubeCommentThreadList): FetchedComment[] => {
    //     return fetchedComments.items.reduce((acc: FetchedComment[], comment) => {
    //         const replies = (comment.replies?.comments || []).reduce((acc1, reply) => {
    //             const snippet = reply.snippet
    //             const originalText = snippet.textOriginal;
    //             if (!this.containsKorean(originalText)) return acc1;
    //             const trimmedText = originalText.replace(/[\r\n]+/g, ' ') // 개행 및 콤마를 띄어쓰기로 변환
    //                                             .replace(/[^ㄱ-ㅎㅏ-ㅣ가-힣a-zA-Z0-9\~\!\@\#\$\%\^\&\*\(\)\_\+\-\=\[\]\{\}\:\;\"\'\<\>\,\.\?\/\s]/g, '')
    //                                             .replace(/\s+/g, ' ')
    //                                             .replace(/(.)\1{2,}/g, (_: any, char: string) => char.repeat(2))
    //                                             .trim();
    //             if (trimmedText !== '') acc1.push({
    //                 id: reply.id,
    //                 likes: snippet.likeCount,
    //                 nickname: snippet.authorDisplayName.slice(1),
    //                 originalText: originalText,
    //                 trimmedText: trimmedText,
    //                 profileImage: snippet.authorProfileImageUrl,
    //                 publishedAt: snippet.publishedAt,
    //                 isPublic: comment.snippet.isPublic,
    //             })
    //             return acc1;
    //         }, [] as FetchedComment[]);
    //         acc.push(...replies)
    //         const snippet = comment.snippet.topLevelComment.snippet;
    //         const originalText = snippet.textOriginal;
    //         if (!this.containsKorean(originalText)) return acc;
    //         const trimmedText = originalText.replace(/[\r\n]+/g, ' ') // 개행 및 콤마를 띄어쓰기로 변환
    //                                         .replace(/[^ㄱ-ㅎㅏ-ㅣ가-힣a-zA-Z0-9\~\!\@\#\$\%\^\&\*\(\)\_\+\-\=\[\]\{\}\:\;\"\'\<\>\,\.\?\/\s]/g, '')
    //                                         .replace(/\s+/g, ' ')
    //                                         .replace(/(.)\1{2,}/g, (_: any, char: string) => char.repeat(2))
    //                                         .trim();
    //         if (trimmedText !== "") acc.push({
    //             id: comment.id,
    //             likes: snippet.likeCount,
    //             nickname: snippet.authorDisplayName.slice(1),
    //             originalText: originalText,
    //             trimmedText: trimmedText,
    //             profileImage: snippet.authorProfileImageUrl,
    //             publishedAt: snippet.publishedAt,
    //             isPublic: comment.snippet.isPublic,
    //         });
    //         return acc;
    //     }, [] as FetchedComment[]);
    // }

    private containsKorean = (text: string) => /[\p{Script=Hangul}]/u.test(text);

    private getKoreanRatio = (text: string): number => {
        const cleanedText = text.replace(/\s/g, '');
        const koreanText = cleanedText.match(/[가-힣\s]/g);
        if (!koreanText) return 0;
        return koreanText.length / cleanedText.length * 100;
    }
}