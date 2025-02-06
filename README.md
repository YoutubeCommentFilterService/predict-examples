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
```
