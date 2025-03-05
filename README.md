# auto-farming

## 패키지 설치:

```bash
bun install
```

## 실행은...:

examples를 참고하여 실행해주세요!

## 디렉터리 구조:

```
.
├── README.md
├── bun.lockb
├── datas <- 밑의 항목들은 전부 있어야 해요!
│   ├── already-predicted.txt
│   ├── already-sent.txt
│   └── emails.txt
├── example <- 예제가 담겼습니다.
│   ├── fetch-comment-in-video.ts
│   ├── fetch-hot-video-in-category.ts
│   ├── fetch-video-category.ts
│   ├── fetch-youtube-channel-data.ts
│   ├── fetch-youtube-hot-videos.ts
│   ├── predict-comment-with-video-id.ts
│   ├── predict-hot-video-comment.ts
│   └── send-email.ts
├── jsconfig.json
├── modules <- 여기서 import 해서 쓰면 됩니다.
│   ├── channel-info-fetcher.ts
│   ├── comment-fetcher.ts
│   ├── comment-predicter.ts
│   ├── mailer-service.ts
│   └── video-fetcher.ts
├── not-spam
├── predicts
├── predicts-sent
├── static
│   └── spam-comment-email-template.ejs
├── .env
└── types.ts
```

```
// datas/emails
channel handler(@로 시작하는 이름), channel id, email address
```

## env 구조:

```
YOUTUBE_DATA_API_KEY=${{ YOUTUBE DATA API KEY }} <- 발급받아서 넣어주세요!
MAILER_USER=${{ mail account }}
MAILER_PASS=${{ mail password }}
SERVER_URL=${{ ml server root url. e.g.) http://localhost:5000 }}
GOOGLE_APPLICATION_CREDENTIALS={{ gcp credential.json이 저장된 경로}}
GOOGLE_PROJECT_ID={{ google gcp project id}}
```

## yt-dlp의 사용

동영상이 shorts인지 판단하기 위해 외부 프로그램인 yt-dlp를 사용합니다.

```
sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

이후 `yt-dlp -F {{ 영상 주소 || 동영상 id }}`를 입력하면 동영상 정보가 출력됩니다.

```
// 일반적인 동영상의 레이아웃 - 대부분 16:9 이상
303     webm  1920x1080   60    │  281.25MiB 2878k https │ vp9           2878k video only          1080p60, webm_dash

// 쇼츠 형식의 레이아웃 - 대부분 9:16 비율
616     mp4   1080x1920   30    │ ~ 24.47MiB 5703k m3u8  │ vp09.00.40.08 5703k video only          Premium
```
