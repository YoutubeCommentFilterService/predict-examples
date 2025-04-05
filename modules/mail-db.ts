import {seperator} from './utils';

export default class MailDB {
    private byChannelId: { [key: string]: string[] };

    constructor(emails: string[]) {
        this.byChannelId = emails.reduce((acc, emailRow) => {
            if (emailRow === '') return acc;
            const datas = emailRow.split(seperator)
            const channelId = datas[0]
            const emailListStr = datas[3];

            acc[channelId] = emailListStr.trim() ? emailListStr.split(' ') : []
            return acc;
        }, {} as { [key: string]: string[] });
    }

    getEmail = (key: string): string[] => this.byChannelId[key]
    existUser = (key: string): string | undefined => Object.keys(this.byChannelId).find((id) => id === key)
    printAll = () => {
        let iteration = 0;
        for (const [key, val] of Object.entries(this.byChannelId )) {
            console.log(`${iteration++} - ${key}: ${val}`)
        }
    }
}