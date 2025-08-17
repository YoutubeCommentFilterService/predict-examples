import type { FetchedVideo, MailDataTree, SendMailData, SendMailDataV2, SpamContent } from "../types";

export function generateMailDataV2(videoInfo: FetchedVideo, spamComments: SpamContent[]): SendMailDataV2 {
    const printMailDataV2Tree = (mailData: MailDataTree) => {
        Object.entries(mailData).forEach(([key, val]) => {
            const {root, items} = val;
            console.log(root.id, root.comment.replace(/\r/g, '').replace(/\n/g, ' '))
            items.forEach(item => {
                console.log('\t', item.id, item.parentId, item.comment.replace(/\r/g, '').replace(/\n/g, ' '))
            })
        })
    }
    spamComments.sort((a, b) => a.parentId!.length - b.parentId!.length)
    const mailDataTree: MailDataTree = {}
    const parentIds: string[] = [
        ...new Set(
            spamComments
                .filter(comment => !comment.parentId)
                .map(comment => comment.id!)
        )
    ]
    spamComments.forEach(data => {
        if (data.parentId === '') {
            mailDataTree[data.id!] = {
                root: data,
                items: []
            }
        } else {
            if (parentIds.includes(data.parentId!)) {
                mailDataTree[data.parentId!].items.push(data)
            } else {
                mailDataTree[data.id!] = {
                    root: data,
                    items: []
                }
            }
        }
    })
    // printMailDataV2Tree(mailDataTree);
    return {
        video: {
            id: videoInfo.id,
            title: videoInfo.title,
            thumbnail: videoInfo.thumbnail,
        },
        comments: mailDataTree
    }
}

export function generateMailData(videoInfo: FetchedVideo, spamContent: SpamContent[]): SendMailData {
    return {
        video: {
            id: videoInfo.id,
            title: videoInfo.title,
            thumbnail: videoInfo.thumbnail
        }, 
        comments: spamContent
    }
}