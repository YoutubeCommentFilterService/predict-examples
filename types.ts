interface YoutubeCommonField {
    kind: string;
    etag: string
}

interface YoutubeCommonPagenation {
    nextPageToken?: string;
    prevPageToken?: string;
    pageIngo: {
        totalResults: number;
        resultsPerPage: number;
    }
}

export interface YoutubeCommentThreadList extends YoutubeCommonField, YoutubeCommonPagenation{
    items: YoutubeCommentThread[]
}

export interface YoutubeCommentThread extends YoutubeCommonField {
    id: string;
    snippet: {
        channelId: string;
        videoId: string;
        topLevelComment: YoutubeComment;
        canReply: boolean;
        totalReplyCount: number;
        isPublic: boolean;
    };
    replies?: {
        comments: YoutubeComment[]
    }
}

export interface YoutubeCommentList extends YoutubeCommonField, YoutubeCommonPagenation {
    items: YoutubeComment[]
}

export interface YoutubeComment extends YoutubeCommonField {
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

export interface ExtractedComment {
    id: string;
    likes: number;
    nickname: string;
    profileImage: string;
    originalText: string;
    translatedText: string;
    publishedAt: string;
    updatedAt: string;
}

export interface PredictResponse {
    items: PredictResult[];
    model_type: string;
    comment_categories: string[];
    nickname_categories: string[];
}

export interface PredictResult {
    id: string;
    comment_predicted: string;
    comment_predicted_prob: number[];
    nickname_predicted: string;
    nickname_predicted_prob: number[];
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
    nickname_predicted: string;
    nickname_prob: string;
    comment_predicted: string;
    comment_prob: string;
}

export interface YoutubeVideoList extends YoutubeCommonField, YoutubeCommonPagenation {
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
    };
    contentDetails: {
        duration: string;
        dimension: string;
        definition: string;
        caption: string;
        licensedContent: boolean;
        contentRating: {};
        projection: string;
    };
}

export interface YoutubeThumbnail {
    url: string;
    width: string;
    height: string;
}

export interface FetchedVideo {
    id: string;
    title: string;
    thumbnail: string;
    description: string;
    channelId: string;
    channelTitle: string;
    publishedAt: string;
    categoryId: string;
}

export interface YoutubeVideoCategoryList extends YoutubeCommonField, YoutubeCommonPagenation {
    items: YoutubeVideoCategory[];
}

export interface YoutubeVideoCategory extends YoutubeCommonField {
    id: string;
    snippet: {
        channelId: string;
        title: string;
        assignable: boolean;
    };
}

export interface YoutubeChannelList extends YoutubeCommonField, YoutubeCommonPagenation {
    items: YoutubeChannelResource[]
}

export interface YoutubeChannelResource extends YoutubeCommonField {
    id: string;
    snippet: YoutubeChannelSnippet;
    contentDetails: {
        relatedPlaylists: {
            likes: string;
            uploads: string;
        };
    };
}

export interface YoutubeChannelSnippet {
    title: string;
    description: string;
    customUrl: string;
    publishedAt: string;
    thumbnails: {
        default: YoutubeThumbnail;
        medium: YoutubeThumbnail;
        high: YoutubeThumbnail;
    };
    localized: {
        title: string;
        description: string;
    };
    country: string;
}

export interface ChannelInfo {
    id: string;
    playlistId: string;
    handler: string;
}