import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config({path: '../.env'})

try {
    const result = await axios.get(`${process.env.PREDICT_SERVER_URL}/connection`, {
        timeout: 3000,
    });
} catch (err) {
    console.log(err)
    process.exit(-1)
}