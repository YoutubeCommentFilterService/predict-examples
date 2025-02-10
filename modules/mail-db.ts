export default class MailDB {
    private byChannelId: { [key: string]: string };
    private byChannelHandler: { [key: string]: string };

    constructor(emails: string[][]) {
        this.byChannelId = {}
        this.byChannelHandler = {}
        emails.forEach((email) => {
            this.byChannelHandler[email[0].trim().toLowerCase()] = email[2]
            this.byChannelId[email[1].trim().toLowerCase()] = email[2]
        })
    }

    getEmail = (key: string): string | undefined => this.getEmailByHandler(key) || this.getEmailByChannelId(key)
    private getEmailByHandler = (handler: string): string | undefined => this.byChannelHandler[handler.toLowerCase()]
    private getEmailByChannelId = (channelId: string): string | undefined => this.byChannelId[channelId.toLowerCase()]
}