import { HarAnalyzer } from './HarAnalyzer.js';
import { UIManager } from './UIManager.js';

document.addEventListener('DOMContentLoaded', () => {
	const analyzer = new HarAnalyzer();
	const ui = new UIManager(analyzer);

	// ソース削除のためのグローバルブリッジ
	// 読み込んでいるHarファイル右側の×ボタンで引火
	window.removeSource = (name) => {
		analyzer.removeSource(name);
		ui.renderSources();
		ui.initStatusDropdown();
		ui.updateView();
	};
});