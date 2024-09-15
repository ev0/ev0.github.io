const fs = require('fs');
const path = require('path');

const folderPath = './memes';
const files = fs.readdirSync(folderPath);

const validExtensions = [
    '.mp4', '.webm', '.ogv', '.mov', '.mkv', 
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif', '.bmp'
];

const fileData = files
    .filter(file => validExtensions.includes(path.extname(file).toLowerCase()))
    .map(file => {
        const stats = fs.statSync(path.join(folderPath, file));
        return `${file}:${stats.size}:${Math.floor(stats.mtimeMs)}`;
    });

fs.writeFileSync('list.txt', fileData.join('\n'), 'utf8');
console.log(`Updated list.txt: found ${fileData.length} files with timestamps.`);