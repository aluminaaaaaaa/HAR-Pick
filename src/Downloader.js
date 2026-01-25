export class Downloader {
	// MIMEと拡張子の対応
	// 拡張子が存在しない場合に自動的に付与するため
	static MIME_MAP = {
	// Video, Streaming
	'video/mp4': 'mp4',
	'video/iso.segment': 'm4s',
	'video/mp2t': 'ts',
	'video/webm': 'webm',
	'video/quicktime': 'mov',
	'video/x-msvideo': 'avi',
	'video/x-flv': 'flv',

	// Audio
	'audio/mp4': 'm4a',
	'audio/mpeg': 'mp3',
	'audio/ogg': 'ogg',
	'audio/opus': 'opus',
	'audio/wav': 'wav',
	'audio/webm': 'webm',

	// Images
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg', // 本来はjpegが正しい
	'image/png': 'png',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/avif': 'avif',
	'image/svg+xml': 'svg',
	'image/x-icon': 'ico',
	'image/vnd.microsoft.icon': 'ico',
	'image/bmp': 'bmp',
	'image/tiff': 'tif',
	'image/apng': 'apng',

	// Text, Scripts, Styles
	'text/html': 'html',
	'text/css': 'css',
	'text/javascript': 'js',
	'application/javascript': 'js',
	'application/x-javascript': 'js',
	'text/plain': 'txt',
	'text/markdown': 'md',
	'text/xml': 'xml',
	'application/xml': 'xml',

	// Documents / Data
	'application/json': 'json',
	'application/pdf': 'pdf',
	'application/zip': 'zip',
	'application/x-7z-compressed': '7z',
	'application/x-rar-compressed': 'rar',
	'application/octet-stream': 'bin',

	// Fonts
	'font/woff2': 'woff2',
	'font/woff': 'woff',
	'font/ttf': 'ttf',
	'font/otf': 'otf',
	'application/font-woff': 'woff',
	'application/vnd.ms-fontobject': 'eot'
	};
	
	static DOWNLOAD_STRATEGY = {
		'ALL': 0,
		'LATEST': 1,
		'OLDEST': 2
	};

	// とくになし
	constructor() {
		// 処理に失敗した場合にエラー投げる？
	}

	// ファイルを生成し、ダウンロードする
	async download(entries, options) {
		if(!entries || entries.length === 0) return;

		const {
			useDirectory = false,
			duplicateStrategy = Downloader.DOWNLOAD_STRATEGY.ALL,
			zipPadding = 3
		} = options;

		if (entries.length === 1) {
			this._downloadSingle(entries[0], useDirectory);
		}else {
			await this._downloadZip(entries, useDirectory, duplicateStrategy, zipPadding);
		}
    }

	// 選択されたファイル数が1つのとき
	_downloadSingle(entry) {
		const filename = this._getDestPath(entry, false);
		let blob;
		const mimeType = entry.response.content.mimeType || '';
		const content = entry.response.content.text || "";
		if(entry.response.content.encoding === 'base64') {
			const byteCharacters = atob(content);
			const byteNumbers = new Uint8Array(byteCharacters.length);
			for(let i = 0; i < byteCharacters.length; i++) {
				byteNumbers[i] = byteCharacters.charCodeAt(i);
			}
			blob = new Blob([byteNumbers], {type: mimeType});
		}else {
			blob = new Blob([content], {type: mimeType});
		}
		this._writeFile(blob, filename);
	}

	// 選択されたファイルが2つ以上のとき(ZIP圧縮する)
	async _downloadZip(entries, useDirectory, strategy, pad) {
		if (typeof JSZip === 'undefined') return;
		const zip = new JSZip();
		const nameCounts = new Map();
		const currentIdx = new Map();

		const filteredEntries = this._filterEntriesByStrategy(entries, useDirectory, strategy);

		if (strategy === Downloader.DOWNLOAD_STRATEGY.ALL) {
			filteredEntries.forEach(e => {
				const fullPath = this._getDestPath(e, useDirectory);
				nameCounts.set(fullPath, (nameCounts.get(fullPath) || 0) + 1);
			});
		}

		filteredEntries.forEach(e => {
			let fullPath = this._getDestPath(e, useDirectory);

			if (strategy === Downloader.DOWNLOAD_STRATEGY.ALL && nameCounts.get(fullPath) > 1) {
				fullPath = this._applyNumbering(fullPath, currentIdx, pad);
			}

			const content = e.response.content.text || "";
			const isBase64 = e.response.content.encoding === 'base64';
			zip.file(fullPath, content, { base64: isBase64 });
		});

		const blob = await zip.generateAsync({type: "blob"});
		const now = new Date();
		const timeStamp = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0') + now.getSeconds().toString().padStart(2, '0');
		const filename = `harpic_${timeStamp}`;
		this._writeFile(blob, filename);
	}

	// Latset, Oldestを選択した場合に重複を排除する
	_filterEntriesByStrategy(entries, useDirectory, strategy) {
		if (strategy === Downloader.DOWNLOAD_STRATEGY.ALL) return entries;

		const map = new Map();
		entries.forEach(entry => {
			const path = this._getDestPath(entry, useDirectory);
			const existing = map.get(path);

			if (!existing) {
				map.set(path, entry);
				return;
			}

			const currentTime = new Date(entry.startedDateTime).getTime();
			const existingTime = new Date(existing.startedDateTime).getTime();

			if (strategy === Downloader.DOWNLOAD_STRATEGY.LATEST && currentTime > existingTime) {
				map.set(path, entry);
			} else if (strategy === Downloader.DOWNLOAD_STRATEGY.OLDEST && currentTime < existingTime) {
				map.set(path, entry);
			}
		});

		return Array.from(map.values());
	}

	_applyNumbering(fullPath, currentIdx, pad) {
		const idx = currentIdx.get(fullPath) || 0;
		currentIdx.set(fullPath, idx + 1);

		const dotIdx = fullPath.lastIndexOf('.');
		const ext = dotIdx !== -1 ? fullPath.substring(dotIdx) : "";
		const base = dotIdx !== -1 ? fullPath.substring(0, dotIdx) : fullPath;
		
		return `${base}_${idx.toString().padStart(pad, '0')}${ext}`;
	}

	// フルパスを取得
	_getDestPath(entry, useDirectory) {
		const url = new URL(entry.request.url);
		const mimeType = (entry.response.content.mimeType || '').split(';')[0].toLowerCase().trim();
		
		// パスの各要素を配列化
		const pathSegments = (url.hostname + url.pathname).split('/');
		let filename = pathSegments.pop() || '';

		// ファイル名補完ロジック
		if (!filename || filename.trim() === '') {
			filename = mimeType.includes('text/html') ? 'index.html' : 'file';
		}
		if (!/\.[a-z0-9]+$/i.test(filename)) {
			const ext = Downloader.MIME_MAP[mimeType];
			if (ext) filename = `${filename}.${ext}`;
		}

		if (useDirectory) {
			// ディレクトリ構造を維持する場合：[domain, ...path, filename]
			return [...pathSegments, filename].join('/');
		}
		return filename;
	}

	// ファイルの書き出し
	_writeFile(blob, filename) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		setTimeout(() => URL.revokeObjectURL(url), 100);
	}
}