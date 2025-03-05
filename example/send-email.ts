import ejs from 'ejs';
import fs, { fdatasync } from 'fs';
import axios from 'axios';
import dotenv from 'dotenv';
import type { SendMailData, SpamContent } from '../types';
import MailerService from '../modules/mailer-service';

dotenv.config({ path: '../.env' })

const mailerService = new MailerService()

mailerService.sendMail('gkstkdgus821@naver.com', {
    video: {
        id: "1234",
        title: "1234",
    },
    comments: []
})