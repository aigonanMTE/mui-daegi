const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const apikey = process.env.API_KEY;
const searchIntervalMs = 2000;
let lastSearchRequestAt = 0;
let searchQueue = Promise.resolve();


async function searchLive(query) {

    let releaseQueue;
    const queuedSearch = new Promise(resolve => {
        releaseQueue = resolve;
    });
    const previousSearch = searchQueue;
    searchQueue = queuedSearch;

    await previousSearch;

    try {
        const waitMs = lastSearchRequestAt + searchIntervalMs - Date.now();
        if (waitMs > 0) {
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }

        lastSearchRequestAt = Date.now();

        const url = new URL(
            "https://www.googleapis.com/youtube/v3/search"
        );

        url.searchParams.set("part", "snippet");
        url.searchParams.set("q", query);
        url.searchParams.set("type", "video");
        url.searchParams.set("eventType", "live");
        url.searchParams.set("maxResults", "1");
        url.searchParams.set("key", apikey);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(
                `유튜브 영상 조회 중 오류가 발생했습니다: ${response.status}`
            );
        }

        const data = await response.json();

        if (data.pageInfo.totalResults === 0) {
            console.log(
                query +
                " 의 방송이 꺼져있거나 방송 제목이 변경 되었습니다"
            );

            return "notFound";
        }

        return data.items[0].id.videoId;
    } finally {
        releaseQueue();
    }
}



async function getLastLiveFrame(liveUrl) {
    if (!liveUrl) {
        return false;
    }


    try {

        // YouTube 실제 영상 스트림 주소
        const { stdout } = await execFileAsync("yt-dlp", [
            "-g",
            "-f", "bestvideo",
            liveUrl
        ]);


        const streamUrl = stdout.trim();


        if (!streamUrl) {

            console.error(
                "스트림 URL을 가져오지 못했습니다."
            );

            return false;
        }


        // 최신 프레임 1장을 JPEG로 가져오기
        const { stdout: image } = await execFileAsync(
            "ffmpeg",
            [
                "-i", streamUrl,

                "-frames:v", "1",

                "-f", "image2",
                "-c:v", "mjpeg",

                "pipe:1"
            ],
            {
                encoding: "buffer",
                maxBuffer: 10 * 1024 * 1024
            }
        );


        return image;

    } catch (error) {

        console.error(
            "라이브 프레임 가져오기 실패:",
            error
        );

        return false;
    }
}


module.exports = getLastLiveFrame;
module.exports.searchLive = searchLive;