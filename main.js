const KB = 1024;
const MB = 1024 * KB;

const SIZE_BUCKETS = [
    250 * KB, 500 * KB, 1 * MB, 2.5 * MB, 5 * MB, 10 * MB, 20 * MB, 30 * MB
];

const videoExtensions = ['.mp4', '.webm', '.mov', '.mkv', '.ogv'];

let seenMemes = JSON.parse(localStorage.getItem('seen_memes') || '[]');
let favorites = JSON.parse(localStorage.getItem('fav_memes') || '[]');

let currentMode = 'new'; 
let allItems = [];
let sessionFeed = [];

function save() {
    localStorage.setItem('seen_memes', JSON.stringify(seenMemes));
    localStorage.setItem('fav_memes', JSON.stringify(favorites));
}

function getPriority(size, isVideo) {
    let bucketIndex = SIZE_BUCKETS.findIndex(limit => size < limit);
    if (bucketIndex === -1) bucketIndex = SIZE_BUCKETS.length;
    return isVideo ? Math.max(0, bucketIndex - 4) : bucketIndex;
}

function markAsSeen(name) {
    if (!seenMemes.includes(name)) {
        seenMemes.push(name);
        save();
    }
}

// Logic to actually clear seen items from the feed
function refreshNewFeed() {
    sessionFeed = allItems.filter(i => !seenMemes.includes(i.name));
}

async function autoNormalize(video, fileName) {
    if (video.dataset.normalized) return;
    const cached = localStorage.getItem(`vol_${fileName}`);
    if (cached) { video.volume = parseFloat(cached); return; }
    try {
        const resp = await fetch(video.src);
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const buf = await ctx.decodeAudioData(await resp.arrayBuffer());
        let max = 0; const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i += 200) if (Math.abs(d[i]) > max) max = Math.abs(d[i]);
        const v = Math.min(Math.max(0.15 / (max || 1), 0.01), 1.0);
        video.volume = v;
        localStorage.setItem(`vol_${fileName}`, v.toFixed(2));
        video.dataset.normalized = "true";
    } catch (e) { video.volume = 0.2; }
}

function createMeme(item) {
    const wrapper = document.createElement('div');
    wrapper.className = `meme-wrapper`;
    wrapper.dataset.filename = item.name;

    const path = `memes/${encodeURIComponent(item.name)}`;
    const media = item.isVideo ? document.createElement('video') : document.createElement('img');
    media.src = path;

    if (item.isVideo) {
        media.controls = true;
        media.preload = "metadata";
        media.onplay = () => {
            document.querySelectorAll('video').forEach(v => { if (v !== media) v.pause(); });
            markAsSeen(item.name);
        };
    } else {
        media.loading = "lazy";
    }

    const controls = document.createElement('div');
    controls.className = 'controls';

    const btnFav = document.createElement('button');
    const isFav = favorites.includes(item.name);
    btnFav.className = `btn btn-fav ${isFav ? 'active fav-active' : ''}`;
    btnFav.innerHTML = '⭐';
    btnFav.onclick = () => {
        if (favorites.includes(item.name)) favorites = favorites.filter(n => n !== item.name);
        else favorites.push(item.name);
        btnFav.classList.toggle('active');
        btnFav.classList.toggle('fav-active');
        save();
    };

    if (currentMode !== 'new') {
        const btnSeen = document.createElement('button');
        const isNowSeen = seenMemes.includes(item.name);
        btnSeen.className = `btn btn-seen active`;
        btnSeen.innerHTML = isNowSeen ? '👁️' : '🙈';
        btnSeen.onclick = () => {
            if (seenMemes.includes(item.name)) seenMemes = seenMemes.filter(n => n !== item.name);
            else seenMemes.push(item.name);
            btnSeen.innerHTML = seenMemes.includes(item.name) ? '👁️' : '🙈';
            save();
            render(); 
        };
        controls.append(btnSeen);
    }

    const btnDL = document.createElement('a');
    btnDL.className = 'btn';
    btnDL.innerHTML = '⬇️';
    btnDL.href = path;
    btnDL.download = item.name;

    controls.prepend(btnFav);
    controls.append(btnDL);
    wrapper.append(media, controls);
    return wrapper;
}

async function render() {
    const container = document.getElementById('videoContainer');
    container.innerHTML = '';
    window.scrollTo(0, 0);

    let filtered = (currentMode === 'new') ? sessionFeed : 
                   (currentMode === 'fav') ? allItems.filter(i => favorites.includes(i.name)) : 
                                            allItems.filter(i => seenMemes.includes(i.name));

    filtered.sort((a, b) => (a.priority !== b.priority) ? a.priority - b.priority : b.time - a.time);

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const name = entry.target.dataset.filename;
                const video = entry.target.querySelector('video');
                if (video) autoNormalize(video, name);
                if (!video && currentMode === 'new') setTimeout(() => markAsSeen(name), 2000);
            }
        });
    }, { threshold: 0.6 });

    filtered.forEach(item => {
        const wrapper = createMeme(item);
        container.appendChild(wrapper);
        observer.observe(wrapper);
    });

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === currentMode));
    document.getElementById('backToFeed').style.display = (currentMode === 'new') ? 'none' : 'block';
}

function initNav() {
    const nav = document.createElement('nav');
    nav.className = 'footer-nav';
    nav.innerHTML = `
        <button class="nav-btn back-btn" id="backToFeed">← BACK</button>
        <button class="nav-btn active" data-mode="new" id="newTabBtn">NEW</button>
        <button class="nav-btn" data-mode="fav">FAVES</button>
        <button class="nav-btn" data-mode="seen">HISTORY</button>
    `;
    document.body.appendChild(nav);

    document.getElementById('newTabBtn').onclick = () => {
        currentMode = 'new';
        refreshNewFeed();
        render();
    };

    document.getElementById('backToFeed').onclick = () => {
        currentMode = 'new';
        render();
    };

    nav.onclick = (e) => {
        if (e.target.dataset.mode && e.target.id !== 'newTabBtn') {
            currentMode = e.target.dataset.mode;
            render();
        }
    };
}

async function init() {
    try {
        const resp = await fetch('list.txt');
        const text = await resp.text();
        allItems = text.split('\n').filter(l => l.includes(':')).map(l => {
            const [name, size, time] = l.split(':');
            const isVideo = videoExtensions.includes(name.toLowerCase().slice(name.lastIndexOf('.')));
            return { 
                name: name.trim(), size: parseInt(size), time: parseInt(time), 
                isVideo, priority: getPriority(parseInt(size), isVideo) 
            };
        });

        refreshNewFeed();
        initNav();
        render();
    } catch (e) { console.error(e); }
}

init();