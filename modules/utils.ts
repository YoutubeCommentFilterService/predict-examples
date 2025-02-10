export const seperator = `\uFFFD`

export const resizeStr = (str: string, maxLength: number, char: string = ' ') => {
    if (!str) return "";
    const koreanCount = (str.match(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g) || []).length;
    maxLength = maxLength - koreanCount * 0.7
    return str.padEnd(maxLength, char)
}