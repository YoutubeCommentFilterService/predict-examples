import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import ejs from 'ejs';
import fs from 'fs';
import type { SendMailData } from '../types';

export default class MailerService {
    private transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo, SMTPTransport.Options>;
    private templatePath: string;
    constructor() {
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.MAILER_USER,
                pass: process.env.MAILER_PASS,
            },
        })
        this.templatePath = "../static/spam-comment-email-template.ejs";
    }

    private truncateString = (str: string, maxLength: number) => {
        return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
    }

    sendMail = async (to: string, data: SendMailData): Promise<void> => {
        // if (data.comments.length === 0) {
        //     console.log('스팸이 감지되지 않았습니다')
        //     return;
        // }

        try {
            const title = `${this.truncateString(data.video.title, 20)} 영상에 의심스러운 댓글이 감지되었습니다.`
            const template = await this.renderTemplate(data)
            const mailOptions = {
                from: process.env.MAILER_USER,
                to,
                subject: title,
                html: template,
                headers: {
                    'X-Mailer': 'Nodemailer',
                    'X-Priority': '3',
                    'Precedence': 'bulk'
                },
            }

            const info = await this.transporter.sendMail(mailOptions);
        } catch (err) {
            console.log(err);
        }
    }

    private renderTemplate = async (data: SendMailData): Promise<string> => {
        return new Promise((resolve, reject) => {
            ejs.renderFile(this.templatePath, { comments: data.comments, video: data.video }, (err, htmlContent) => {
                if (err) reject('Error rendering EJS template: ' + err)
                resolve(htmlContent);
            })
        })
    }
}