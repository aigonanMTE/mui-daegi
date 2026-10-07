const express = require("express");
const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, "../.env")
});

const app = express();

const port = Number(process.env.PORT) || 3000;
const staticdir = path.join(__dirname, "../frontend");
const moduleSever = process.env.MODULESERVER;

const getLastLiveFrame = require(
    "./getLastLiveFrame/getLastLiveFrame.js"
);


app.use(express.static(staticdir));


app.get("/api/getStatus", async (req, res) => {

    try {

        const { arcadeName , liveName } = req.query;

        if (!liveName) {
            return res.status(400).json({
                error: "livename 필요합니다."
            });
        }else if (!arcadeName){
            return res.status(400).json({
                error: "arcadeName 필요합니다."
            });
        }


        // 유튜브 라이브에서 최신 프레임 가져오기
        const image = await getLastLiveFrame(liveName);

        if (!image) {
            return res.status(404).json({
                error: "라이브 영상을 찾지 못했습니다."
            });
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

            return res.status(500).json({
                error: "모델 서버에서 오류가 발생했습니다."
            });
        }


        // 모델 서버의 결과
        const result = await response.json();

        res.json(result);

    } catch (error) {

        console.error("getStatus 오류:", error);

        res.status(500).json({
            error: "서버 내부 오류가 발생했습니다."
        });
    }
});


app.listen(port, () => {
    console.log(`서버가 포트 ${port}에서 실행 중입니다.`);
});