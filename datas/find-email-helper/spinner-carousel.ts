function spinnerCarousel(baseText = "FETCHING", interval = 100) {
    const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frameIndex = 0;
    let startTime = Date.now();
    
    const timer = setInterval(() => {
        const elapsedSeconds: string = ((Date.now() - startTime) / 1000).toFixed(1);
        const dots: string = '.'.repeat(Math.max(0, Math.floor(Number(elapsedSeconds) || 0) % 30));
        process.stdout.write(`\r${spinnerFrames[frameIndex]} ${baseText} [${elapsedSeconds}s] ${dots}`);
        frameIndex = (frameIndex + 1) % spinnerFrames.length;
    }, interval);
    
    return timer;
};
export default spinnerCarousel