require('dotenv').config();
const Mustache = require('mustache');
const fs = require('fs');

const MUSTACHE_MAIN_DIR = './main.mustache';
const README_DIR = './README.md';

const API_BASE = process.env.API_BASE_URL || 'https://api.devfiro.com';
const SITE_BASE = process.env.SITE_BASE_URL || 'https://devfiro.com';
const BLOG_BASE = `${SITE_BASE}/blog`;
const PROJECT_LIST_URL = `${SITE_BASE}/projects`;

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRY = 2;
const VISIBLE_PROJECT_COUNT = 2; // 이 개수까지만 README에 싣고, 나머지는 포트폴리오 사이트로 유도한다
const MAX_POST_COUNT = 5;

/**
 * API에서 JSON을 가져온다. 실패 시 지수 백오프로 재시도한다.
 * @param {string} path - `/projects` 처럼 앞에 슬래시를 포함한 경로
 * @returns {Promise<Array<object>>} 응답의 data 배열
 */
async function fetchCollection(path) {
    let lastError;

    for (let attempt = 0; attempt <= MAX_RETRY; attempt += 1) {
        try {
            const response = await fetch(`${API_BASE}${path}`, {
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }

            const body = await response.json();

            if (!body || body.ok !== true || !Array.isArray(body.data)) {
                throw new Error(`예상과 다른 응답 형식: ${JSON.stringify(body).slice(0, 200)}`);
            }

            return body.data;
        } catch (error) {
            lastError = error;
            console.warn(`[warn] ${path} 요청 실패 (${attempt + 1}/${MAX_RETRY + 1}): ${error.message}`);

            if (attempt < MAX_RETRY) {
                await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
            }
        }
    }

    throw new Error(`${path} 동기화 실패: ${lastError.message}`);
}

/** 마크다운 표/링크를 깨뜨릴 수 있는 문자를 정리한다. */
function sanitize(text) {
    return String(text ?? '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** 블로그 글 제목을 devfiro.com 경로 규칙(대괄호 제거 + 공백을 하이픈으로)에 맞춰 변환한다. */
function toSlug(title) {
    return encodeURIComponent(
        sanitize(title)
            .replace(/[[\]]/g, '')
            .replace(/\s+/g, '-')
    );
}

function getYear(date) {
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCFullYear();
}

function formatPeriod(startDate, endDate) {
    const format = (value) => {
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return null;
        return `${parsed.getUTCFullYear()}.${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`;
    };

    const start = startDate ? format(startDate) : null;
    if (!start) return null;

    const end = endDate ? format(endDate) : null;
    return end ? `${start} ~ ${end}` : `${start} ~ 진행중`;
}

/** 날짜 내림차순 정렬(최신 우선). 날짜가 없는 항목은 뒤로 밀린다. */
function byDateDesc(getDate) {
    return (a, b) => {
        const left = new Date(getDate(a) ?? 0).getTime() || 0;
        const right = new Date(getDate(b) ?? 0).getTime() || 0;
        return right - left;
    };
}

function formatProject(project) {
    const title = sanitize(project.title) || '제목 없는 프로젝트';
    // 저장소/배포 링크가 없으면 포트폴리오 사이트의 상세 페이지로 연결한다.
    const link = project.githubUrl || project.deployUrl || (project.id ? `${PROJECT_LIST_URL}/${project.id}` : null);
    const lines = [link ? `### [${title}](${link})` : `### ${title}`];

    const description = sanitize(project.description);
    if (description) lines.push(description);

    const meta = [];
    const period = formatPeriod(project.startDate, project.endDate);
    if (period) meta.push(period);

    if (Array.isArray(project.techStack) && project.techStack.length > 0) {
        meta.push(project.techStack.map((tech) => `\`${sanitize(tech)}\``).join(' '));
    }

    if (project.award?.title) meta.push(`🏆 ${sanitize(project.award.title)}`);
    if (project.deployUrl && project.githubUrl) meta.push(`[배포 링크](${project.deployUrl})`);

    if (meta.length > 0) lines.push(`> ${meta.join(' · ')}`);

    return lines.join('\n');
}

function formatProjects(projects) {
    if (projects.length === 0) return '아직 공개된 프로젝트가 없습니다.';

    const sorted = [...projects].sort(byDateDesc((project) => project.startDate ?? project.createdAt));
    const visible = sorted.slice(0, VISIBLE_PROJECT_COUNT).map(formatProject).join('\n\n');

    if (sorted.length <= VISIBLE_PROJECT_COUNT) return visible;

    const rest = sorted.length - VISIBLE_PROJECT_COUNT;
    return `${visible}\n\n**[프로젝트 ${rest}개 더보기 →](${PROJECT_LIST_URL})**`;
}

function formatAwards(awards) {
    if (awards.length === 0) return '- 아직 등록된 수상 실적이 없습니다.';

    return [...awards]
        .sort(byDateDesc((award) => award.date))
        .map((award) => {
            const title = sanitize(award.title);
            const year = getYear(award.date);
            // 제목에 이미 연도가 들어있으면(예: "2024 앱잼 27th 최우수상") 중복 표기하지 않는다.
            const label = /^\d{4}\b/.test(title) || !year ? title : `${year} ${title}`;

            return `- ${label}`;
        })
        .join('\n');
}

function formatPosts(posts) {
    if (posts.length === 0) return '- 작성된 글이 없습니다.';

    return [...posts]
        .sort(byDateDesc((post) => post.date))
        .slice(0, MAX_POST_COUNT)
        .map((post) => {
            const title = sanitize(post.title);
            return `- [${title}](${BLOG_BASE}/${toSlug(post.title)})`;
        })
        .join('\n');
}

async function action() {
    const [projects, awards, posts] = await Promise.all([
        fetchCollection('/projects'),
        fetchCollection('/awards'),
        fetchCollection('/blog/posts'),
    ]);

    console.log(`동기화 완료: 프로젝트 ${projects.length}개, 수상 ${awards.length}개, 블로그 ${posts.length}개`);

    const view = {
        project: formatProjects(projects),
        award: formatAwards(awards),
        post: formatPosts(posts),
        updatedAt: new Date().toUTCString(),
    };

    const template = fs.readFileSync(MUSTACHE_MAIN_DIR, 'utf8');
    fs.writeFileSync(README_DIR, Mustache.render(template, view));
    console.log('README.md 파일이 성공적으로 업데이트되었습니다.');
}

action().catch((error) => {
    // 일부 데이터만 반영된 README가 커밋되는 것을 막기 위해, 실패 시 파일을 건드리지 않고 워크플로를 실패시킨다.
    console.error(`README 생성 실패: ${error.message}`);
    process.exit(1);
});
