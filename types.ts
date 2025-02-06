interface YoutubeCommonField {
    kind: string;
    etag: string
}

export interface YoutubeCommentThreadList extends YoutubeCommonField {
    nextPageToken?: string;
    pageInfo: {
        totalResults: number;
        resultsPerPage: number;
    };
    items: YoutubeCommentThread[]
}

export interface YoutubeCommentThread extends YoutubeCommonField {
    id: string;
    snippet: {
        channelId: string;
        videoId: string;
        topLevelComment: YoutubeComments;
        canReply: boolean;
        totalReplyCount: number;
        isPublic: boolean;
    };
    replies?: {
        comments: YoutubeComments[]
    }
}

export interface YoutubeComments extends YoutubeCommonField {
    id: string;
    snippet: {
        authorDisplayName: string;
        authorProfileImageUrl: string;
        authorChannelUrl?: string;
        authorChannelId?: {
            value?: string;
        };
        channelId: string;
        textDisplay: string;
        textOriginal: string;
        parentId?: string;
        canRate: boolean;
        likeCount: number;
        moderationStatus?: string;
        publishedAt: string; // Date로 변환, ISO 8601
        updatedAt: string;   // Date로 변환, ISO 8601
    }
}

export interface SpamResult {
    id: string;
    nickname: string;
    comment: string;
}

export interface FetchedComment {
    id: string;
    likes: number;
    nickname: string;
    profileImage: string;
    originalText: string;
    trimmedText: string;
    publishedAt: string;
}

export interface PredictResponse {
    items: PredictResult[];
}

export interface PredictResult {
    id: string;
    comment_predicted: string;
    nickname_predicted: string;
}

export interface SendMailData {
    video: {
        id: string;
        title: string;
    };
    comments: SpamContent[];
}

export interface SpamContent extends SpamResult {
    profileImage: string;
    nickname_p: string;
    comment_p: string;
}

export interface YoutubeVideoList extends YoutubeCommonField {
    nextPageToken?: string;
    prevPageToken?: string;
    pageInfo: {
        totalResults: number;
        resultsPerPage: number;
    },
    items: YoutubeVideo[]
}

export interface YoutubeVideo extends YoutubeCommonField {
    id: string;
    snippet: {
        publishedAt: string;
        channelId: string;
        title: string;
        description: string;
        thumbnails: {
            default: YoutubeThumbnail;
            medium: YoutubeThumbnail;
            high: YoutubeThumbnail;
            standard: YoutubeThumbnail;
            maxres: YoutubeThumbnail;
        },
        channelTitle: string;
        tags: string[];
        categoryId: string;
        liveBroadcastContent: string;
        localized: {
            title: string;
            description: string;
        };
        defaultAudioLanguage: string;
    }
}

export interface YoutubeThumbnail {
    url: string;
    width: string;
    height: string;
}

export interface YoutubeVideoCategoryList extends YoutubeCommonField {
    nextPageToken?: string;
    prevPageToken?: string;
    pageInfo: {
        totalResults: number;
        resultsPerPage: number;
    };
    items: VideoCategory[];
}

export interface VideoCategory extends YoutubeCommonField {
    id: string;
    snippet: {
        channelId: string;
        title: string;
        assignable: boolean;
    };
}