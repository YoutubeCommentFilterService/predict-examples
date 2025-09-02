import nodemailer from 'nodemailer';
import ejs from 'ejs';
import appRootPath from 'app-root-path';

export default class MailerService {
    private transporter: nodemailer.Transporter;
    private mainTemplatePath: string = `${appRootPath}/static/spam-comment-email-template.ejs`
    private templatePath: {[key: string]: string} = {
        v0: `${appRootPath}/static/v0.ejs`,
        v1: `${appRootPath}/static/v1.ejs`,
        v2: `${appRootPath}/static/v2.ejs`
    }
    constructor() {
        let options = {}
        if (process.env.MAILER_SERVICE === 'gmail') {
            options = { service: process.env.MAILER_SERVICE }
        } else {
            options = {
                host: process.env.MAILER_SERVICE,
                port: 587,
                secure: false,
            }
        }
        // console.log(options, {
        //     user: process.env.MAILER_USER,
        //     pass: process.env.MAILER_PASS,
        // })
        this.transporter = nodemailer.createTransport({
            ...options,
            auth: {
                user: process.env.MAILER_USER,
                pass: process.env.MAILER_PASS,
            },
            pool: true
            // logger: true,
            // debug: true
        })
    }

    private truncateString = (str: string, maxLength: number) => {
        return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
    }

    private generateMailOptions = (to: string, subject: string, html: string) => ({
        from: process.env.MAILER_USER,
        to,
        subject,
        html,
        headers: {
            'X-Mailer': 'Nodemailer',
            'X-Priority': '3',
            'Precedence': 'bulk'
        },
        encoding: 'utf-8',
    })

    sendMail = async (to: string, data: any, version: string = 'v1'): Promise<void> => {
        try {
            const title = `유튜브 영상 "${this.truncateString(data.video.title, 20)}" 댓글 관리 안내`
            const mailBody = await this.renderTemplate(this.templatePath[version], { comments: data['comments'] })
            const template = await this.renderTemplate(this.mainTemplatePath, { video: data['video'], partialBodyTemplate: mailBody, version, statistic: data['statistics'] })
            const mailOptions = this.generateMailOptions(to, title, template)
            const info = await this.transporter.sendMail(mailOptions);
        } catch (err) {
            console.log(err);
        }
    }

    private renderTemplate = async (ejsPath: string, data: any, options: any = {}): Promise<string> => {
        return new Promise((resolve, reject) => {
            ejs.renderFile(ejsPath, data, options, (err, htmlContent) => {
                if (err) reject('Error rendering EJS template: ' + err)
                resolve(htmlContent);
            })
        })
    }
}