export default class MailDB {
    private byChannelId: { [key: string]: string };

    constructor(emails: string[]) {
        this.byChannelId = emails.reduce((acc, val) => {
            if (val === '') return acc;
            const [ channelId, email ] = val.split(',').map(data => data.trim())
            acc[channelId] = email;
            return acc;
        }, {} as { [key: string]: string });
    }

    getEmail = (key: string): string | undefined => this.byChannelId[key]
    existUser = (key: string): string | undefined => Object.keys(this.byChannelId).find((id) => id === key)
}