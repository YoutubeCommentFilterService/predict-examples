import appRootPath from "app-root-path";

export const MAX_THREAD_SIZE = 16
export const MAX_RETRY_COUNT = 5
export const DATA_PATH = `${appRootPath}/datas`
export const SEARCH_EMAIL_LIST_FILE_PATH = `${DATA_PATH}/to-search-emails.txt`
export const RETRY_EMAIL_LIST_FILE_PATH = `${DATA_PATH}/retry-failed-emails.txt`
export const SKIP_EMAIL_LIST_FILE_PATH = `${DATA_PATH}/skip-emails.txt`
export const NOT_FOUND_EMAIL_LIST_FILE_PATH = `${DATA_PATH}/not-found-emails.txt`
export const EMAIL_LIST_FILE_PATH = `${DATA_PATH}/emails.txt`
export const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
export const MAX_FETCH_VIDEO_LENGTH = 50