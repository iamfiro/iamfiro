require('dotenv').config();
const convert = require('xml-js');
const Mustache = require('mustache');
const fs = require('fs');

const MUSTACHE_MAIN_DIR = './main.mustache';

let post_data = {
    post: '',
}

async function action() {
    const response = await fetch(`https://api.velog.io/rss/@${process.env.VELOG_USERNAME}`);
    const response_data = await response.text();
    var json = JSON.parse(convert.xml2json(response_data, {compact: true, spaces: 4})).rss.channel.item;

    if(json !== undefined) {
        if(json.length > 5) json = json.slice(0, 5);
        json.map((item, index) => {
            const date = new Date(item.pubDate._text);
            post_data.post += `<li><a href="${item.link._text}"><b>${item.title._cdata} (${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()})</b></a><br/></li>`
        });
    }

    await fs.readFile(MUSTACHE_MAIN_DIR, (err, data) => {
        if (err) throw err;
        const output = Mustache.render(data.toString(), post_data);
        fs.writeFileSync('README.md', output);
    });
}

action()