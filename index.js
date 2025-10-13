require('dotenv').config();
const convert = require('xml-js');
const Mustache = require('mustache');
const fs = require('fs');
const https = require('https');

const MUSTACHE_MAIN_DIR = './main.mustache';

let post_data = {
    post: '',
    updatedAt: new Date().toUTCString()
}
function fetchBlogPosts() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.devfiro.com',
            port: 443,
            path: '/blog/posts',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve(jsonData);
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.end();
    });
}

function formatBlogPosts(posts) {
    if (!posts || posts.length === 0) {
        return '<li>작성된 글이 없습니다.</li>';
    }

    return posts.slice(0, 5).map(post => {
        return `- [${post.title}](https://devfiro.com/blog/${post.title.replace(/[\[\]]/g, '').replace(/\s+/g, '-')})`;
    }).join('\n');
}

async function action() {
    try {
        const apiResponse = await fetchBlogPosts();
        
        if (apiResponse.ok && apiResponse.data) {
            post_data.post = formatBlogPosts(apiResponse.data);
        } else {
            post_data.post = '<li>블로그 포스트를 불러올 수 없습니다.</li>';
        }
    } catch (error) {
        console.error('API 요청 중 오류 발생:', error);
        post_data.post = '<li>블로그 포스트를 불러올 수 없습니다.</li>';
    }

    fs.readFile(MUSTACHE_MAIN_DIR, (err, data) => {
        if (err) throw err;
        const output = Mustache.render(data.toString(), post_data);
        fs.writeFileSync('README.md', output);
        console.log('README.md 파일이 성공적으로 업데이트되었습니다.');
    });
}

action()