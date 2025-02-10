import axios, { type AxiosResponse } from 'axios'
import type { YoutubeCommentThreadList, FetchedComment } from '../types';

export default class CommentFetcher {
    private youtubeDataKey: string | undefined;

    constructor() {
        this.youtubeDataKey = process.env.YOUTUBE_DATA_API_KEY;
        if (!this.youtubeDataKey) return;
    }

    fetchComment = async (videoId: string, maxResults: number = 100, videoCategoryId: string = '', debug: boolean = false): Promise<FetchedComment[]> => {
        if (maxResults <= 0) maxResults = 100
        else if (maxResults > 100) maxResults = 100

        let nextPageToken: string | undefined = ""
        let comments: FetchedComment[] = []
        let iteration = 1;
        do {
            try {
                const response: AxiosResponse<YoutubeCommentThreadList> = await axios.get<YoutubeCommentThreadList>("https://www.googleapis.com/youtube/v3/commentThreads", {
                    params: {
                        key: this.youtubeDataKey,
                        videoId,
                        part: "snippet",
                        maxResults,
                        pageToken: nextPageToken,
                    }
                });
                const data = response.data
                comments.push(...this.extractComment(data))
                nextPageToken = data.nextPageToken;
            } catch (err) {
                if (axios.isAxiosError(err)) console.error(err.response?.data)
                nextPageToken = '';
            }
        } while (nextPageToken);

        console.log(`fetch ${videoId}'s comment finished, len: ${comments.length}`)

        comments.sort((a, b) => {
            if (a.likes != b.likes) return b.likes - a.likes;
            return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
        })

        if (debug) {
            const topCommentsCount = this.getSliceCount(comments.length)
            const tempArr = new Set([...comments.slice(0, topCommentsCount), ...comments.filter(x => x.likes <= 1)])
            comments = [...tempArr]
        }

        return comments;
    }

    private extractComment = (fetchedComments: YoutubeCommentThreadList): FetchedComment[] => {
        const comments: FetchedComment[] = fetchedComments.items.reduce((acc: FetchedComment[], comment) => {
            const snippet = comment.snippet.topLevelComment.snippet;
            const originalText = snippet.textOriginal;
            if (!this.containsKorean(originalText)) return acc;
            const trimmedText = originalText.replace(/[\r\n,]+/g, ' ') // 개행 및 콤마를 띄어쓰기로 변환
                                                    .replace(/[^ㄱ-ㅎㅏ-ㅣ가-힣a-zA-Z0-9~!@#$%^&*()_+\-=\[\]{}:;"'<>,.?/\s]/g, '')
                                                    .replace(/\s+/g, ' ')
                                                    .replace(/(.)\1{2,}/g, (_: any, char: string) => char.repeat(3))
                                                    .trim();

            if (trimmedText !== "") {
                acc.push({
                    id: comment.id,
                    likes: snippet.likeCount,
                    nickname: snippet.authorDisplayName.slice(1),
                    originalText: snippet.textOriginal,
                    trimmedText: trimmedText,
                    profileImage: snippet.authorProfileImageUrl,
                    publishedAt: snippet.publishedAt
                })
            }
            return acc;
        }, [])
        return comments
    }

    private containsKorean = (text: string) => /[\p{Script=Hangul}]/u.test(text);

    private getSliceCount = (length: number) => {
        if (length <= 100) return 10;
        if (length <= 300) return 15;
        if (length <= 500) return 20;
        if (length <= 700) return 25
        if (length <= 1000) return 30;
        if (length <= 2000) return 40;
        if (length <= 3000) return 50;
        if (length <= 4000) return 60;
        if (length <= 5000) return 70;
        else return 80
    }
}