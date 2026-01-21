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

	// とくになし
	constructor() {
		// 処理に失敗した場合にエラー投げる？
	}

	// ファイルを生成し、ダウンロードする
	async download(entries, zipPadding = 3) {
		if(!entries || entries.length === 0) return;

		if(entries.length === 1) {
			this._downloadSingle(entries[0]);
		}else {
			await this._downloadZip(entries, zipPadding);
		}
	}

	// 選択されたファイル数が1つのとき
	_downloadSingle(entry) {
		const {filename, blob}= this._prepareFileData(entry);
		this._writeFile(blob, filename);
	}

	// 選択されたファイルが2つ以上のとき(ZIP圧縮する)
	async _downloadZip(entries, pad) {
		if(typeof JSZip === 'undefined') {
			throw new Error('JSZip library is required for multiple downloads.');
		}

		const zip = new JSZip();
		const nameCounts = new Map();
		const currentIdx = new Map();

		entries.forEach(e => {
			const name = this._getRawFilename(e);
			nameCounts.set(name,(nameCounts.get(name) || 0) + 1);
		});

		entries.forEach(e => {
			const rawName = this._getRawFilename(e);
			const mimeType = e.response.content.mimeType || '';
			const baseName = this._addExtension(rawName, mimeType);
			
			let finalName = baseName;

			if(nameCounts.get(rawName) > 1) {
				const idx = currentIdx.get(rawName) || 0;
				const dotIdx = baseName.lastIndexOf('.');
				const namePart = dotIdx !== -1 ? baseName.substring(0, dotIdx) : baseName;
				const extPart = dotIdx !== -1 ? baseName.substring(dotIdx) : "";
				
				finalName = `${namePart}_${idx.toString().padStart(pad, '0')}${extPart}`;
				currentIdx.set(rawName, idx + 1);
			}

			const content = e.response.content.text || "";
			const isBase64 = e.response.content.encoding === 'base64';
			zip.file(finalName, content, {base64: isBase64});
		});

		const blob = await zip.generateAsync({type: "blob"});
		const now = new Date();
		const timeStamp = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0') + now.getSeconds().toString().padStart(2, '0');
		const filename = `harpic_${timeStamp}`;
		this._writeFile(blob, filename);
	}
	
	// URLからファイル名を抽出する(パス, クエリの除去)
	_getRawFilename(entry) {
		const url = new URL(entry.request.url);
		let filename = url.pathname.split('/').pop();
		
		const mimeType = entry.response.content.mimeType || '';
		// ファイル名が空の場合補完する({mydomain}/top/のようなパスの場合)
		if(!filename || filename.trim() === '') {
			if(mimeType.includes('text/html')) {
				filename = 'index.html';
			}else {
				filename = 'file';
			}
		}
		return filename;
	}

	// ファイルを抽出して、ダウンロード用ファイル名を準備
	_prepareFileData(entry) {
		const mimeType = entry.response.content.mimeType || '';
		let filename = this._getRawFilename(entry);
		
		// 拡張子がなければMIMEから推測して付与
		filename = this._addExtension(filename, mimeType);

		const content = entry.response.content.text || "";
		const isBase64 = entry.response.content.encoding === 'base64';

		let blob;
		if(isBase64) {
			const byteCharacters = atob(content);
			const byteNumbers = new Uint8Array(byteCharacters.length);
			for(let i = 0; i < byteCharacters.length; i++) {
				byteNumbers[i] = byteCharacters.charCodeAt(i);
			}
			blob = new Blob([byteNumbers], {type: mimeType});
		}else {
			blob = new Blob([content], {type: mimeType});
		}
		
		return {filename, blob};
	}
	
	// 拡張子を付与
	_addExtension(filename, mimeType) {
		if(/\.[a-z0-9]+$/i.test(filename)) return filename;
		const baseMime = mimeType.split(';')[0].toLowerCase();
		const ext = Downloader.MIME_MAP[baseMime];
		return ext ? `${filename}.${ext}` : filename;
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