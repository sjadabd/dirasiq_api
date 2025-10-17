"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveBase64File = saveBase64File;
exports.saveMultipleBase64Images = saveMultipleBase64Images;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
function ensureDirSync(dir) {
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
}
function parseBase64(input) {
    const dataUrlMatch = /^data:([\w\/\-\.\+]+);base64,(.*)$/i.exec(input);
    if (dataUrlMatch) {
        return { mime: dataUrlMatch[1], data: dataUrlMatch[2] };
    }
    return { mime: null, data: input };
}
function extFromMime(mime, fallback) {
    if (!mime)
        return fallback;
    if (mime === 'application/pdf')
        return '.pdf';
    if (mime === 'image/jpeg')
        return '.jpg';
    if (mime === 'image/png')
        return '.png';
    if (mime === 'image/webp')
        return '.webp';
    if (mime === 'image/gif')
        return '.gif';
    const slash = mime.indexOf('/');
    if (slash > 0)
        return '.' + mime.slice(slash + 1);
    return fallback;
}
async function saveBase64File(base64, baseDir, fileName) {
    const { mime, data } = parseBase64(base64);
    const buffer = Buffer.from(data, 'base64');
    const ext = fileName ? path_1.default.extname(fileName) : extFromMime(mime, '.bin');
    const safeName = fileName && path_1.default.basename(fileName) !== '' ? fileName : `${Date.now()}_${crypto_1.default.randomBytes(6).toString('hex')}${ext}`;
    ensureDirSync(baseDir);
    const fullPath = path_1.default.join(baseDir, safeName);
    await fs_1.default.promises.writeFile(fullPath, buffer);
    return fullPath;
}
async function saveMultipleBase64Images(imagesBase64, baseDir) {
    const results = [];
    ensureDirSync(baseDir);
    for (const img of imagesBase64) {
        const { mime, data } = parseBase64(img);
        const ext = extFromMime(mime, '.jpg');
        const name = `${Date.now()}_${crypto_1.default.randomBytes(6).toString('hex')}${ext}`;
        const fullPath = path_1.default.join(baseDir, name);
        await fs_1.default.promises.writeFile(fullPath, Buffer.from(data, 'base64'));
        results.push(fullPath);
    }
    return results;
}
//# sourceMappingURL=file.util.js.map