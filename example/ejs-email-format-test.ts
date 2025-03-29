import dotenv from 'dotenv';
import MailerService from '../modules/mailer-service';
import appRootPath from 'app-root-path';

dotenv.config({ path: `${appRootPath}/env/.env` })

const mailerService = new MailerService()

mailerService.sendMail('blue.h.sh.0.0@gmail.com', {
    video: {
        id: "1234",
        title: "1234",
    },
    comments: []
})
// mailerService.sendMail('gkstkdgus821@gmail.com', {
//     video: {
//         id: "1234",
//         title: "1234",
//     },
//     comments: []
// })