import {Downloader}from './Downloader.js';

export class UIManager {
	constructor(analyzer) {
		this.analyzer = analyzer;
		this.selectedIds = new Set();
		this.selectedStatuses = new Set();
		this.timeMode = 'clock';
		this.defaultStatuses = [200, 300, 301, 302, 303, 304, 400, 401, 403, 404, 405, 414, 418, 500, 502, 503];
		this.lastSelectedIndex = null;
		this.init();
	}

	init() {
		this.cacheElements();
		this.bindEvents();
		this.initStatusDropdown();
		this.applyUrlParameters();
		this.downloader = new Downloader();
	}

	cacheElements() {
		this.els = {
			dropZone: document.getElementById('drop-zone'),
			fileInput: document.getElementById('file-input'),
			listBody: document.getElementById('list-body'),
			statusDisplay: document.getElementById('status-display'),
			statusDropdown: document.getElementById('status-dropdown'),
			countFiltered: document.getElementById('count-filtered'),
			countSelected: document.getElementById('count-selected'),
			downloadBtn: document.getElementById('download-btn'),
			selectAll: document.getElementById('select-all'),
			btnSelectAllData: document.getElementById('btn-select-all-data'),
			btnDeselectAllData: document.getElementById('btn-deselect-all-data'),
			btnResetFilters: document.getElementById('btn-reset-filters'),
			btnCopyUrl: document.getElementById('btn-copy-url')
		};
	}

	bindEvents() {
		// ブラウザのデフォルト挙動(ファイルを開く)を抑制
		['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
			this.els.dropZone.addEventListener(eventName, (e) => {
				e.preventDefault();
				e.stopPropagation();
			}, false);
		});

		// ファイルダイアログからでファイルを開く
		this.els.dropZone.onclick = () => this.els.fileInput.click();
		this.els.fileInput.onchange = async(e) => {
			await this.handleFileSelect(e.target.files);
		};

		// ファイルドロップ時の処理
		this.els.dropZone.addEventListener('drop', (e) => {
			this.els.dropZone.classList.remove('hover');
			const files = e.dataTransfer.files;
			if(files.length > 0) {
				this.handleFileSelect(files);
			}
		});

		
		// リセットボタンで検索フォームを初期値に戻す
		this.els.btnResetFilters.onclick = () => {
			document.querySelectorAll('.filter-panel input').forEach(input => {
				input.value = '';
			});

			this.selectedStatuses.clear();
			this.initStatusDropdown();
			this.syncStatusUI();

			// プリセット（TYPE/STATUS/SPEED）のactive解除
			document.querySelectorAll('.btn-preset').forEach(btn => btn.classList.remove('active'));

			// 特殊なトグル状態の復元
			if(this.timeMode !== 'clock') this.toggleTimeMode();
			
			const sizeBtn = document.getElementById('f-size-mode');
			sizeBtn.className = 'toggle-btn gte';
			sizeBtn.innerText = '以上';

			const speedBtn = document.getElementById('f-speed-mode');
			speedBtn.className = 'toggle-btn lte';
			speedBtn.innerText = '以下';

			this.updateView();
		};

		// ホバー時のスタイル変更
		this.els.dropZone.addEventListener('dragover', () => {
			this.els.dropZone.classList.add('hover');
		});
		this.els.dropZone.addEventListener('dragleave', () => {
			this.els.dropZone.classList.remove('hover');
		});
		
		// クエリ付きりんくコピー
		this.els.btnCopyUrl.onclick = () => {
			const c = this.getCriteria();
			const params = new URLSearchParams();

			// パラメータの組み立て(値があるものだけ追加)
			if(c.url) params.set('url', c.url);
			if(c.mime) params.set('mime', c.mime);
			if(this.selectedStatuses.size > 0) {
				params.set('status', Array.from(this.selectedStatuses).join(','));
			}
			if(c.startT) params.set('startT', c.startT);
			if(c.endT) params.set('endT', c.endT);
			if(c.startS) params.set('startS', c.startS);
			if(c.endS) params.set('endS', c.endS);
			
			if(c.sizeVal) {
				params.set('size', c.sizeVal);
				params.set('sizeMode', c.sizeMode);
			}
			if(c.speedVal) {
				params.set('speed', c.speedVal);
				params.set('speedMode', c.speedMode);
			}
			if(this.timeMode !== 'clock') {
				params.set('timeMode', this.timeMode);
			}

			// URLの生成
			const baseUrl = window.location.origin + window.location.pathname;
			const shareUrl = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;

			// クリップボードへコピー
			navigator.clipboard.writeText(shareUrl).then(() => {
				// チェックマークを表示
				const btn = this.els.btnCopyUrl;
				const icon = btn.querySelector('.icon');
				btn.classList.add('success');
				
				setTimeout(() => {
					btn.classList.remove('success');
				}, 2000);
			});
		};
		
		// 表示していないデータを含め全データを全選択
		this.els.btnSelectAllData.onclick = () => {
			this.analyzer.allEntries.forEach(e => this.selectedIds.add(e._id)); // 全てsetに追加
			this.updateView();
			//this.updateActionStats();
		};

		// 表示していないデータを含め全データを全選択解除
		this.els.btnDeselectAllData.onclick = () => {
			this.selectedIds.clear(); // Setを空にするだけで全解除完了
			this.updateView();
			//this.updateActionStats();
		};

		// http response codeのフォーム
		this.els.statusDisplay.onclick = (e) => {
			e.stopPropagation();
			this.els.statusDropdown.classList.toggle('show');
		};

		this.els.btnDeselectAllData.onclick = () => {
			this.selectedIds.clear();
			this.updateView();
		};
		
		// リスト最上部のチェックボックスを操作した時(表示されているものすべてを選択or解除)
		this.els.selectAll.onclick = (e) => {
			// click時点での checked 状態を取得（これがこれから反映したい状態）
			const targetChecked = e.target.checked;
			
			const criteria = this.getCriteria();
			const filtered = this.analyzer.filter(criteria);
			
			filtered.forEach(entry => {
				if(targetChecked) {
					this.selectedIds.add(entry._id);
				}else {
					this.selectedIds.delete(entry._id);
				}
			});

			this.updateView();
		};
		
		// http response codeのドロップダウン以外のところをクリックしたら閉じる
		window.onclick = () => this.els.statusDropdown.classList.remove('show');
		// preset button
		document.querySelectorAll('.btn-preset').forEach(btn => {
			btn.onclick = () => this.handlePresetClick(btn);
		});
		// inputの中身が書き換えられたとき => preset buttonのステータスを更新させる
		document.querySelectorAll('input').forEach(i => i.oninput = () => this.updateView());
		// 時間・時刻切り替えボタン
		document.getElementById('btn-toggle-time').onclick = () => this.toggleTimeMode();
		// 以上・以下の表示を切り替え
		document.querySelectorAll('.toggle-btn').forEach(btn => {
			btn.onclick = () => {
				btn.classList.toggle('gte');
				btn.classList.toggle('lte');
				btn.innerText = btn.classList.contains('gte') ? '以上' : '以下';
				this.updateView();
			};
		});
		// ダウンロードボタン
		this.els.downloadBtn.onclick = () => this.handleDownload();
	}

	// クエリから検索条件を読み取り
	// あとで分離する
	applyUrlParameters() {
		const params = new URLSearchParams(window.location.search);
		
		const fieldMap = {
			'url': 'f-url',
			'mime': 'f-type',
			'startT': 'f-start-time',
			'endT': 'f-end-time',
			'startS': 'f-start-sec',
			'endS': 'f-end-sec',
			'size': 'f-size-val',
			'speed': 'f-speed-val'
		};
		

		for(const [key, id] of Object.entries(fieldMap)) {
			const value = params.get(key);
			if(value !== null) {
				const el = document.getElementById(id);
				if(el) el.value = value;
			}
		}

		const statusParam = params.get('status');
		if(statusParam) {
			statusParam.split(',').forEach(s => {
				const statusNum = parseInt(s.trim());
				if(!isNaN(statusNum)) this.selectedStatuses.add(statusNum);
			});
			this.syncStatusUI();
		}

		const timeModeParam = params.get('timeMode');
		if(timeModeParam === 'seconds' && this.timeMode !== 'offset') {
			this.toggleTimeMode();
		}

		if(params.get('sizeMode') === 'lte') {
			const btn = document.getElementById('f-size-mode');
			btn.classList.replace('gte', 'lte');
			btn.innerText = '以下';
		}
		if(params.get('speedMode') === 'gte') {
			const btn = document.getElementById('f-speed-mode');
			btn.classList.replace('lte', 'gte');
			btn.innerText = '以上';
		}
		this.updateView();
	}

	// ファイルがドラッグor選択されたときにパースさせる
	async handleFileSelect(files) {
		try{
			if(!files || files.length === 0) return;
			await this.analyzer.parseFiles(files);
			this.renderSources();
			this.initStatusDropdown();
			this.updateView();
		}catch(error) {
			this.els.dropZone.classList.add('parse-error');
			const oldText = this.els.dropZone.innerText;
			this.els.dropZone.innerText = "ファイルの読み込みに失敗しました。harファイルが破損している可能性があります。";
			setTimeout(() => {
				this.els.dropZone.classList.remove('parse-error');
				this.els.dropZone.innerText = oldText;
			}, 2000);
		}
	}

	// analyzer.jsやapp.jsのファイル読み込み完了時のコールバック内
	async onFileLoaded() {
		this.ui.updateView(); // ここでURLから読み込まれた値がフィルタとして適用される
	}

	// http response codeのドロップダウンを初期化
	initStatusDropdown() {
		const harCodes = this.analyzer.allEntries.map(e => e.response.status);
		const codes = [...new Set([...this.defaultStatuses, ...harCodes])].sort();
		this.els.statusDropdown.innerHTML = '';
		codes.forEach(code => {
			const item = document.createElement('div');
			item.className = 'dropdown-item';
			item.innerHTML = `<input type="checkbox" value="${code}" ${this.selectedStatuses.has(code)?'checked':''}> <span>${code}</span>`;
			item.onclick = (e) => {
				const cb = item.querySelector('input');
				if(e.target !== cb) cb.checked = !cb.checked;
				cb.checked ? this.selectedStatuses.add(code) : this.selectedStatuses.delete(code);
				this.syncStatusUI();
			};
			this.els.statusDropdown.appendChild(item);
		});
	}

	// http response codeのUIを初期化
	syncStatusUI() {
		this.els.statusDisplay.innerHTML = '';
		if(this.selectedStatuses.size === 0) {
			this.els.statusDisplay.innerText = '選択なし';
		}else {
			[...this.selectedStatuses].sort().forEach(c => {
				const b = document.createElement('span');
				b.className = 'status-badge';
				b.innerText = c + ' ×';
				b.onclick = (e) => {
					e.stopPropagation();
					this.selectedStatuses.delete(c);
					this.syncStatusUI();
					this.initStatusDropdown();
				};
				this.els.statusDisplay.appendChild(b);
			});
		}
		this.updateView();
	}

	// プリセットボタンクリック時
	handlePresetClick(btn) {
		const {type, val}= btn.dataset;
		const isAct = btn.classList.contains('active');
		
		const inputUrl = document.getElementById('f-url');
		const inputMime = document.getElementById('f-type');
		const inputSpeedVal = document.getElementById('f-speed-val');
		const btnSpeedMode = document.getElementById('f-speed-mode');

		if(btn.classList.contains('type-filter')) {
			// 現在、ストリームボタンがアクティブかどうかを判定
			const wasStreamActive = document.querySelector('.type-filter[data-type="stream"]').classList.contains('active');
			
			// すべてのTYPEボタンのactiveを解除
			document.querySelectorAll('.type-filter').forEach(b => b.classList.remove('active'));

			if(type === 'stream') {
				// ストリームを選択した場合
				inputMime.value = ""; // MIMEは必ず消去
				inputUrl.value = isAct ? "" : val; // URLをストリーム用で上書き
			}else {
				// MIME系(ストリーム以外)を選択した場合】
				if(wasStreamActive) {
					// ストリームからの切り替え時のみ、URL欄をクリアする
					inputUrl.value = "";
				}
				// ストリーム以外同士の切り替えであれば、inputUrl.value は維持される
				inputMime.value = isAct ? "" : val;
			}
		}else if(btn.classList.contains('status-filter')){
			// STATUSボタンの処理
			if(isAct) {
				[...this.selectedStatuses].forEach(s => {
					if(String(s).startsWith(val)) this.selectedStatuses.delete(s);
				});
			}else {
				const allAvailable = [...new Set([...this.defaultStatuses, ...this.analyzer.allEntries.map(e => e.response.status)])];
				allAvailable.forEach(c => {
					if(String(c).startsWith(val)) this.selectedStatuses.add(c);
				});
			}
			this.initStatusDropdown();
			this.syncStatusUI();
		}else if(type === 'speed') {
			// 低速通信ボタンのロジック
			document.querySelectorAll('.speed-filter').forEach(b => b.classList.remove('active'));
			
			if(isAct) {
				inputSpeedVal.value = "";
			}else {
				inputSpeedVal.value = val;
				// モードを強制的に「以下(lte)」に切り替える
				btnSpeedMode.classList.remove('gte');
				btnSpeedMode.classList.add('lte');
				btnSpeedMode.innerText = "以下";
			}
		}
		this.updateView();
	}	

	// 時間・時刻切り替えボタン
	toggleTimeMode() {
		this.timeMode = this.timeMode === 'clock' ? 'seconds' : 'clock';
		const isClock = this.timeMode === 'clock';
		document.getElementById('f-start-time').style.display = isClock ? 'block' : 'none';
		document.getElementById('f-end-time').style.display = isClock ? 'block' : 'none';
		document.getElementById('f-start-sec').style.display = isClock ? 'none' : 'block';
		document.getElementById('f-end-sec').style.display = isClock ? 'none' : 'block';
		this.updateView();
	}

	// 検索条件の値を取得
	getCriteria() {
		return {
			url: document.getElementById('f-url').value,
			mime: document.getElementById('f-type').value,
			statuses: this.selectedStatuses,
			timeMode: this.timeMode,
			startT: document.getElementById('f-start-time').value,
			endT: document.getElementById('f-end-time').value,
			startS: parseFloat(document.getElementById('f-start-sec').value),
			endS: parseFloat(document.getElementById('f-end-sec').value),
			sizeVal: parseFloat(document.getElementById('f-size-val').value),
			sizeMode: document.getElementById('f-size-mode').classList.contains('gte') ? 'gte' : 'lte',
			speedVal: parseFloat(document.getElementById('f-speed-val').value),
			speedMode: document.getElementById('f-speed-mode').classList.contains('gte') ? 'gte' : 'lte'
		};
	}

	// プリセットボタンを同期させる。
	updateView() {
		const inputSpeedVal = document.getElementById('f-speed-val');
		const btnSpeedMode = document.getElementById('f-speed-mode');
		const criteria = this.getCriteria();
		const filtered = this.analyzer.filter(criteria);
		
		document.querySelectorAll('.status-filter').forEach(b => {
			b.classList.toggle('active', [...this.selectedStatuses].some(s => String(s).startsWith(b.dataset.val)));
		});
		document.querySelectorAll('.type-filter').forEach(b => {
			const active = b.dataset.type === 'stream' ? (document.getElementById('f-url').value === b.dataset.val) : (document.getElementById('f-type').value === b.dataset.val);
			b.classList.toggle('active', active);
		});
		document.querySelectorAll('.speed-filter').forEach(b => {
			const isMatch = (inputSpeedVal.value === b.dataset.val) && btnSpeedMode.classList.contains('lte');
			b.classList.toggle('active', isMatch);
		});
		this.renderTable(filtered);
	}

	// Harのエントリーリストを更新
	renderTable(entries) {
		this.els.listBody.innerHTML = '';
		this.els.countFiltered.innerText = entries.length;

		entries.forEach((e, index) => {
			const tr = document.createElement('tr');
			const isChecked = this.selectedIds.has(e._id);
			if(isChecked) tr.classList.add('row-selected');
			
			tr.innerHTML = `
				<td><input type="checkbox" ${isChecked ? 'checked' : ''}></td>
				<td style="color:${e.response.status >= 400 ? 'red' : 'inherit'}">${e.response.status}</td>
				<td>${new Date(e._ts).toLocaleTimeString()}</td>
				<td>${((this.analyzer.firstEntryTime ?(e._ts - this.analyzer.firstEntryTime) / 1000 : 0)).toFixed(1)}s</td>
				<td style="word-break:break-all;"><span class="url-link">${e.request.url}</span></td>
				<td>${((e.response._transferSize || 0) / 1024).toFixed(1)}KB</td>
				<td style="font-size:9px;color:#94a3b8;">${e._source}</td>
			`;

			const cb = tr.querySelector('input'); // chekbox

			tr.onclick = (event) => {
				// Shiftキーが押されている場合、ブラウザの選択処理(文字が青く選択されるの)を抑制
				if(event.shiftKey) {
					window.getSelection().removeAllRanges();
				}
				if(event.target.classList.contains('url-link')) {
					window.open(e.request.url, '_blank', 'noopener,noreferrer');
					return;
				}
				let targetChecked = !cb.checked;
				
				if(event.target === cb) targetChecked = cb.checked;

				if(event.shiftKey && this.lastSelectedIndex !== null) {// w/ shift
					// 範囲の開始と終了を特定
					const start = Math.min(this.lastSelectedIndex, index);
					const end = Math.max(this.lastSelectedIndex, index);
					
					// 範囲内の全エントリを、今回のクリック先の状態に合わせる
					for(let i = start; i <= end; i++) {
						const entry = entries[i];
						if(targetChecked) {
							this.selectedIds.add(entry._id);
						}else {
							this.selectedIds.delete(entry._id);
						}
					}
				}else {// w/o shift
					if(targetChecked) {
						this.selectedIds.add(e._id);
					}else {
						this.selectedIds.delete(e._id);
					}
				}

				// 最後にクリックした位置を更新
				this.lastSelectedIndex = index;
				this.updateView();
			};
			this.els.listBody.appendChild(tr);
		});

		this.updateActionStats();
	}

	// エントリリストのチェック同期
	updateActionStats() {
		this.els.countSelected.innerText = this.selectedIds.size;
		this.els.downloadBtn.disabled = this.selectedIds.size === 0;
		const criteria = this.getCriteria();
		const visibleEntries = this.analyzer.filter(criteria);

		if(visibleEntries.length > 0) {
			// 表示されているすべてのエントリのIDが、selectedIdsに含まれているかチェック
			const allVisibleSelected = visibleEntries.every(e => this.selectedIds.has(e._id));
			this.els.selectAll.checked = allVisibleSelected;
			
			// 一部だけ選択されている場合に"-"表示にする
			const someVisibleSelected = visibleEntries.some(e => this.selectedIds.has(e._id));
			this.els.selectAll.indeterminate = someVisibleSelected && !allVisibleSelected;
		}else {
			this.els.selectAll.checked = false;
			this.els.selectAll.indeterminate = false;
		}
	}

	// 読み込んでいるHarファイル一覧
	renderSources() {
		const container = document.getElementById('source-list');
		container.innerHTML = '';
		this.analyzer.sourceFiles.forEach((_, name) => {
			const tag = document.createElement('div');
			tag.className = 'source-tag';
			tag.innerHTML = `${name}<span style="cursor:pointer;color:red" onclick="window.removeSource('${name}')">×</span>`;
			container.appendChild(tag);
		});
	}

	// 選択たものをダウンロードする
	async handleDownload() {
		const selected = this.analyzer.allEntries.filter(e => this.selectedIds.has(e._id));
		if(selected.length === 0) {
			return;
		}
		const padding = parseInt(document.getElementById('zip-padding')?.value) || 3;

		this.downloader.download(selected, padding);
	}
}