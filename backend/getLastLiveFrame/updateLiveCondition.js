const fs = require("fs/promises");
const { execFile } = require("child_process");
const { promisify } = require("util");
const getLastLiveFrame = require("./getLastLiveFrame");
const { stdout } = require("process");
const searchLive = getLastLiveFrame.searchLive;
const liveJsonPath = require.resolve(process.env.LIVE_JSON_PATH);
const liveJson = require(liveJsonPath);
const execFileAsync = promisify(execFile);
const ytDlpTimeoutMs = 60_000;
const moduleSever = process.env.MODULESERVER;


async function checkLive(liveurl) {
    // yt-dlp 써서 라이브가 지금 진행중인지 알아보기
    //yt-dlp --ignore-config --skip-download --no-playlist --print "%(live_status)s" --extractor-args "youtube:player_client=tv_simply" `https://www.youtube.com/watch?v=${liveid}` --no-warnings

    try {
        const { stdout: output } = await execFileAsync(
            "yt-dlp",
            [
                "--ignore-config",
                "--skip-download",
                "--no-playlist",
                "--print", "%(live_status)s",
                "--extractor-args", "youtube:player_client=tv_simply",
                liveurl,
                "--no-warnings"
            ],
            { timeout: ytDlpTimeoutMs }
        );

        const liveStatus = output.trim();
        console.log(`출력 결과:\n${liveStatus}`);
        return liveStatus === "is_live";
    } catch (error) {
        const errorOutput = [
            error.message,
            error.stderr
        ].filter(Boolean).join("\n");

        if (errorOutput.includes("This live stream recording is not available.")) {
            console.log("YouTube 방송/녹화본을 사용할 수 없어 방송 종료 상태로 처리합니다.");
            return false;
        }

        console.error(`yt-dlp 실행 오류: ${error.message}`);
        return false;
    }
}


async function getLiveCondition(arcadeName , liveUrl) {
    try {

        // 유튜브 라이브에서 최신 프레임 가져오기
        const image = await getLastLiveFrame(liveUrl);

        if (!image) {
            console.error("라이브 영상을 찾지 못했습니다.")
            return false
        }


        // 모델 서버로 이미지 전송
        const response = await fetch(
            moduleSever + `/predict?arcadeName=${encodeURIComponent(arcadeName)}`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "image/jpeg"
                },

                body: image
            }
        );


        if (!response.ok) {

            console.error(
                "모델 서버 오류:",
                response.status,
                await response.text()
            );
            console.error("모델 서버에서 오류가 발생했습니다.")
            return false
        }


        // 모델 서버의 결과
        const result = await response.json();

        const condition = result.result.label === "1 playing"

        return condition

    } catch (error) {

        console.error("getStatus 오류:", error);

        console.error("서버 내부 오류가 발생했습니다.")
    }
}

async function updateLiveinfo(){
    const arcade = Object.entries(liveJson) // arcade[0] == cymusic
    // console.log(arcade[0][0])
    for(let l = 0; l < arcade.length; l++){
        const lives = Object.entries(arcade[l][1]);
        // console.log(lives[0])

        for(let i=0;i < lives.length; i++){
            const arcadeName = arcade[l][0]
            const gameName = lives[i][0]
            console.log(arcadeName + "의 " + gameName + "기체의 방송 여부와 플레이 여부를 조사중입니다")

            if (isempty(lives[i][1].liveUrl) || isempty(lives[i][1].liveid)){
                console.log(arcadeName + "의 " + gameName + "기체의 방송 주소를 구합니다...")
                const livename = liveJson[arcadeName][gameName].liveName
                const liveid = await searchLive(livename)
                if (liveid) {
                    liveJson[arcadeName][gameName].liveid = liveid
                    liveJson[arcadeName][gameName].liveUrl = "https://www.youtube.com/watch?v=" + liveid
                    saveliveJson()
                }else if (liveid="notFound"){
                    liveJson[arcadeName][gameName].liveid = "notFound"
                    liveJson[arcadeName][gameName].liveUrl = "notFound"
                    saveliveJson()
                }
            }else if(lives[i][1].liveUrl == "notFound" || lives[i][1].liveid === "notFound"){
                const notFoundCount = lives[i][1]?.notFoundCount || 0
                liveJson[arcadeName][gameName].online = false
                // console.log(notFoundCount)
                if (notFoundCount === 60){
                    lives[i][1].notFoundCount = notFoundCount + 0
                    liveJson[arcadeName][gameName].liveid = ""
                    liveJson[arcadeName][gameName].liveUrl = ""
                }else{
                    lives[i][1].notFoundCount = notFoundCount + 1
                }
                saveliveJson()
                console.log(arcadeName + "의 " + gameName + `기체 YouTube 방송 주소를 찾을수 없기에 다음에 다시 시도 합니다 ${notFoundCount + 1}/60`)
            }else{
                console.log(arcadeName + "의 " + gameName + "기체 YouTube 방송 상태 확인 중...")
                const checklive = await checkLive(liveJson[arcadeName][gameName].liveUrl)
                // console.log(checklive)

                if (checklive){
                    liveJson[arcadeName][gameName].online = true
                    console.log(arcadeName + "의 " + gameName + "기체 YouTube 방송 상태는 방송 진행 중입니다     플레이 여부를 확인합니다")
                    //방송 진행중
                    // 플레이 여부 구하기
                    const condition = await getLiveCondition(liveJson[arcadeName][gameName].modle , liveJson[arcadeName][gameName].liveUrl)
                    liveJson[arcadeName][gameName].condition = condition
                    saveliveJson()
                    console.log(arcadeName + "의 " + gameName + "기체의 플레이 여부는 " + condition + "입니다")
                }else {
                    //방송 종료 다음에 다시 라이브 찾아보기
                    liveJson[arcadeName][gameName].liveid = ""
                    liveJson[arcadeName][gameName].liveUrl = ""
                    liveJson[arcadeName][gameName].online = false
                    saveliveJson()
                    console.log(arcadeName + "의 " + gameName + "기체 YouTube 방송이 종료됨")
                }
                //지금 방송 여부 구하기
                // 개 거지같은 유튜브 api 일일 한도 우회할 방법 찾으셈
                //  ㄴ 이거 그냥 api키 3개정도 돌려쓰자
            }
        }
    }

    console.log("방송 여부및 플레이 여부 조사가 완료 되었습니다")
}

function isempty(value){
    return value === null || value === undefined || value === ""
}

async function saveliveJson(){
    await fs.writeFile(
        liveJsonPath,
        `${JSON.stringify(liveJson, null, 4)}\n`,
        "utf8"
    );
}

module.exports = updateLiveinfo