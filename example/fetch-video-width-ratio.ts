import {exec} from 'child_process';

const getVideoResolutionRatio = (urlOrId: string): Promise<number> => {
    return new Promise((resolve, reject) => {
        exec(`yt-dlp -F ${urlOrId}`, (err, stdout, stderr) => {
            if (err) {
                reject(`exec error: ${err}`);
                return;
            }
            if (stderr) {
                reject(`stderr: ${stderr}`);
                return;
            }

            const notStartsWith = ['[', '---', 'ID']

            const lines = stdout.trim().split('\n').filter(
                line => line && !notStartsWith.some(prefix => line.startsWith(prefix))
            )
            
            const results = []
            for (let line of lines) {
                const [id, ext, resolution, ...rest] = line.split(/\s+/)
                if (!['webm', 'mp4'].includes(ext)) continue;
                if (resolution === 'audio') continue;
                results.push({id, ext, resolution})
            }

            const [width, height] = results.at(-1)?.resolution.toLowerCase().split('x') || []
            if (!width || !height) reject('video resolution not found');

            const videoRatio = Number(width) / Number(height)
            if (Number.isNaN(videoRatio)) reject('video resolution calculation result is NaN')

            resolve(videoRatio)
        })
    })
}

const isShortsVideo = async (urlOrId: string) => {
    const videoRatio = await getVideoResolutionRatio(urlOrId)
    return videoRatio <= 1
}

console.log(await isShortsVideo('G1mdP5ra_LI'));