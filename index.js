require('dotenv').config();
const convert = require('xml-js');
const Mustache = require('mustache');
const fs = require('fs');

const MUSTACHE_MAIN_DIR = './main.mustache';

let post_data = {
    post: '',
    updatedAt: new Date().toUTCString()
}

async function action() {
    // Velog 글 가져오기
    const response = await fetch(`https://api.velog.io/rss/@${process.env.VELOG_USERNAME}`);
    const response_data = await response.text();
    var json = JSON.parse(convert.xml2json(response_data, {compact: true, spaces: 4})).rss.channel.item; // XML 객체를 JSON 객체로 변환
  
    if(String(json) === 'undefined') { // json이 undefined일때 slice 함수를 사용할 수 없어서 오류가 발생함
        if(json.length > 5) json = json.slice(0, 5); // 최신 5개의 글만 가져오기
        json.map((item, index) => {
            const date = new Date(item.pubDate._text); // 글 작성 날짜
            post_data.post += `<li><a href="${item.link._text}"><b>${item.title._cdata.replaceAll('<', '&lt;').replaceAll('>', '&gt;')} (${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()})</b></a><br/></li>` // README.md에 삽입할 HTML 코드
        });
    }

    await fs.readFile(MUSTACHE_MAIN_DIR, (err, data) => { // README.md 템플릿 읽기
        if (err) throw err;
        const output = Mustache.render(data.toString(), post_data); // README.md 템플릿에 Mustache를 이용한 데이터 삽입
        fs.writeFileSync('README.md', output); // output을 기반으로 README.md 파일 생성
    });
}

action()