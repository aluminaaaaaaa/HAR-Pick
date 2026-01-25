export class HarAnalyzer {
	constructor() {
		this.allEntries = [];
		this.sourceFiles = new Map();
		this.firstEntryTime = null;
	}

	// Harをパース
	async parseFiles(files) {
		for (const file of files) {
			if (this.sourceFiles.has(file.name)) continue;
			try {
				const text = await file.text();
				const data = JSON.parse(text);
				data.log.entries.forEach((e, i) => {
					e._source = file.name;
					e._id = btoa(encodeURIComponent(file.name)) + '_' + i;
					e._ts = new Date(e.startedDateTime).getTime();
					this.allEntries.push(e);
				});
				this.sourceFiles.set(file.name, true);
			} catch (err) {
				console.error('Parse Error:', err, file);
				throw new Error('Failed to parse JSON. The file might be corrupted.');
			}
		}
		this.allEntries.sort((a, b) => a._ts - b._ts);
		this.firstEntryTime = this.allEntries.length > 0 ? this.allEntries[0]._ts : null;
		console.info(this);
	}

	// Harファイルがリストから削除されたとき
	removeSource(name) {
		this.sourceFiles.delete(name);
		this.allEntries = this.allEntries.filter(e => e._source !== name);
		this.firstEntryTime = this.allEntries.length > 0 ? this.allEntries[0]._ts : null;
	}

	// フィルタする
	filter(c) {
		return this.allEntries.filter(e => {
			const sizeKB = (e.response._transferSize || e.response.bodySize || 0) / 1024;
			const elapsed = this.firstEntryTime ? (e._ts - this.firstEntryTime) / 1000 : 0;
			const speed = sizeKB / (e.time / 1000 || 1);

			if (c.statuses.size > 0 && !c.statuses.has(e.response.status)) return false;
			if (c.url) {
				const k = c.url.toLowerCase().split(' ');
				if (!k.some(x => e.request.url.toLowerCase().includes(x))) return false;
			}
			if (c.mime && !e.response.content.mimeType.toLowerCase().includes(c.mime)) return false;

			if (!isNaN(c.sizeVal)) {
				if (c.sizeMode === 'gte' ? sizeKB < c.sizeVal : sizeKB > c.sizeVal) return false;
			}
			if (!isNaN(c.speedVal)) {
				if (c.speedMode === 'gte' ? speed < c.speedVal : speed > c.speedVal) return false;
			}

			if (c.timeMode === 'clock') {
				const t = new Date(e._ts).toTimeString().split(' ')[0];
				if (c.startT && t < c.startT) return false;
				if (c.endT && t > c.endT) return false;
			} else {
				if (!isNaN(c.startS) && elapsed < c.startS) return false;
				if (!isNaN(c.endS) && elapsed > c.endS) return false;
			}
			return true;
		});
	}
}