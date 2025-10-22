<p align="center">
  <img src="./resources/aionui_readme_header_0807.png" alt="AionUi Logo" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/iOfficeAI/AionUi?style=flat-square&color=32CD32" alt="Version">
  &nbsp;
  <img src="https://img.shields.io/badge/license-Apache--2.0-32CD32?style=flat-square&logo=apache&logoColor=white" alt="License">
  &nbsp;
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-6C757D?style=flat-square&logo=linux&logoColor=white" alt="Platform">
</p>

---

<p align="center">
  <strong>コマンドラインの機能を、現代的で効率的なAIチャットインターフェースに置き換える。</strong>
</p>

<p align="center">
  <a href="./readme.md">English</a> | <a href="./readme_ch.md">简体中文</a> | <strong>日本語</strong> | <a href="https://www.aionui.com" target="_blank">公式サイト</a> | <a href="https://twitter.com/AionUI" target="_blank">Twitter</a>
</p>

## 🎯 **AionUi ユースケース**

### 🤖 **マルチエージェントモード**

_複数のターミナル AI エージェントをシームレスに統合 - Gemini CLI、Claude Code、Qwen Code、Codex など_

<p align="center">
  <img src="./resources/multi-agent.gif" alt="マルチエージェントモードデモ" width="800">
</p>

### 🎨 **AI 画像生成・編集**

_Gemini 2.5 Flash Image Preview によるインテリジェントな画像生成、編集、認識_

<p align="center">
  <img src="./resources/Image_Generation.gif" alt="AI 画像生成デモ" width="800">
</p>

### 📁 **スマートファイル管理**

_ファイルの一括リネーム、自動整理、スマート分類、ファイルの統合_

<p align="center">
  <img src="https://github.com/iOfficeAI/AionUi/wiki/assets/gifs/file-management/file-organization.gif" alt="ファイル管理デモ" width="800">
</p>

### 📊 **Excel スマート処理**

_AI が Excel ファイルの作成、整理、分析、装飾をサポートします_

<p align="center">
  <img src="./resources/generate_xlsx.gif" alt="Excel処理デモ" width="800">
</p>

### 💬 **マルチタスク並列処理**

_複数の会話を開いてもタスクは混乱せず、それぞれの記憶は独立し、効率が倍増します_

<p align="center">
  <img src="./resources/multichat-side-by-side.gif" alt="会話管理デモ" width="800">
</p>

## 📋 目次

- [🤔 どうして AionUi を選ぶべきなのか？](#-どうして-AionUi-を選ぶべきなのか)
- [🎯 AionUi ユースケース](#-aionui-ユースケース)
- [✨ 主要機能](#-主要機能)
- [🚀 クイックスタート](#-クイックスタート)
- [📚 詳細ドキュメント](#-詳細ドキュメント)
- [🤝 コミュニティとサポート](#-コミュニティとサポート)
- [📄 ライセンス](#-ライセンス)

---

## 🤔 どうして AionUi を選ぶべきなのか？

公式の Gemini CLI は高機能ですが、日常的なオペレーションにおいてはいくつかの限界があります。AionUi は、これらの課題に対応する GUI ベースの代替手段を提供します：

> - `@` コマンドを使ったファイル選択は煩雑です
> - CLI ウィンドウを閉じると、会話履歴が失われます
> - コマンドラインインターフェースは、自然なチャットのやり取りに欠けます
> - シングルダイアログモデルは、並行したワークフローを制限します
> - Gemini モデルのみ使用可能で、他の優れた大規模言語モデルを活用できません

AionUi は、作業効率を向上させるモダンなインターフェースを提供するだけでなく、**単一モデルの制約を打ち破り**、タスクごとに最適な AI モデルを選択できるようにします。

## ✨ 主要機能

### 💬 **強化されたチャット体験**

- **複数チャットの同時管理** - 複数の独立したチャットセッションを同時に管理します。
- **履歴の永続化** - すべての会話をローカルに保存し、作業内容を失うことがありません。
- **現代的な UI** - 自然なチャット UI と、使い慣れたメッセージコントロールを備えています。
- **マルチモデルサポート** - 単一モデルの制限をなくし、多様な大規模言語モデルをサポートします。

### 🗂️ **ファイル・プロジェクト管理**

- **ビジュアル・ファイルツリー** - ファイルを参照・選択すれば、すぐにチャットに統合できます。
- **ファイルの追加** - ファイルをドラッグ＆ドロップで追加し、AI で処理します。データは安全な一時ストレージに保存されます。
- **コード差分ビュー** - ファイルの変更点を並べて比較。
- **スマートフォルダ整理** - AI がファイルやフォルダを自動で分類・整理します。
- **Excel 生成** - AI が Excel ファイルの作成と管理を効率化します。

### ⚡ **開発者ワークフロー**

- **関数呼び出し** - 高度な機能に対応した、完全な Gemini API の統合。
- **RichText をレンダリング** - コードブロックや整形済みコンテンツを、見やすく美しくレンダリング
- **AI によるツール選択** - タスクに応じて最適なツールを自動で選び、実行します。

### 🤖 **マルチエージェント統合**

- **マルチターミナルエージェントサポート** - 様々なターミナル AI エージェント（Gemini CLI、Claude Code、Qwen Code、Codex など）をシームレスに統合
- **動的 CLI 検出** - バックエンドの自動発見と CLI パス検出
- **セキュア認証** - OAuth サポートとセキュアな認証フロー
- **リアルタイム監視** - ライブ接続状態とバックエンドヘルス監視
- **統一インターフェース** - すべてのターミナル AI エージェントに同じチャットインターフェースでアクセス

### 🔌 **MCP ツール管理**

- **MCP サーバー設定** - モデルコンテキストプロトコルサーバーの追加、編集、管理
- **複数のインポート方法** - JSON 設定からのインポートまたは CLI でのワンクリック設定
- **ツール発見** - MCP サーバーから利用可能なツールを自動発見・リスト表示
- **接続テスト** - MCP サーバー接続とヘルス状態のリアルタイムテスト
- **マルチエージェント同期** - 異なる AI エージェント間で MCP 設定を同期
- **ツール管理** - ツールの有効/無効化、パラメータとツール説明の表示

### 🔄 **マルチ API Key ローテーションサービス**

- **マルチ Key ローテーション** - 信頼性向上のための複数 API Key の自動ローテーション
- **インテリジェントエラー回復** - 時間ベースのブラックリスト（90秒）と自動リトライメカニズム
- **高可用性** - サービス中断を防ぐ API Key 間のシームレスなフェイルオーバー
- **レート制限処理** - API レート制限とクォータを尊重するスマートリトライロジック
- **パフォーマンス最適化** - ダウンタイムの削減と API 呼び出し成功率の向上

### 🎨 **AI 画像生成・編集**

- **インテリジェント画像生成** - Gemini 2.5 Flash Image Preview で駆動、最先端の画像モデル
- **マルチモデルサポート** - 他の主要なAI画像モデルにも対応、多様なクリエイティブニーズに対応
- **スマート編集** - AI 駆動の画像編集・拡張機能
- **画像認識** - 高度な画像分析・理解
- **高品質出力** - プロ仕様の画像生成、詳細な制御が可能

### 🔧 **シンプルで便利な設定**

- **多様なプラットフォームに対応** - Gemini、OpenAI、ModelScope、OpenRouter など、主要なプラットフォームに対応しています。
- **柔軟な構成** - 各プラットフォームで複数のモデルを自由に設定でき、API エンドポイントもカスタム可能です。
- **シームレスな認証** - Google アカウントログインまたは API Key 認証に対応、柔軟な選択が可能
- **スマートな URL 自動修正** - API エンドポイントの設定ミスを自動で検知・修正します。

## 🚀 クイックスタート

### 📥 ダウンロード

AionUi をお試しですか？お使いの環境に合った最新版を、リリースぺージからダウンロードいただけます。

<p>
  <a href="https://github.com/iOfficeAI/AionUi/releases">
    <img src="https://img.shields.io/badge/ダウンロード-最新版-32CD32?style=for-the-badge&logo=github&logoColor=white" alt="最新版をダウンロード">
  </a>
</p>

### 🔧 簡単インストール

1. **AionUi アプリケーションをダウンロード・インストール**
2. **AI サービスを設定** - Google アカウントログインまたは API Key 認証に対応
3. **使用開始** - モダンな AI チャットインターフェースをすぐに体験

> 💡 **詳細な設定ガイドが必要ですか？** [完全インストールチュートリアル](https://github.com/iOfficeAI/AionUi/wiki/Getting-Started) をご確認ください

## 📚 詳細ドキュメント

### 🚀 クイックスタート

- [📖 完全インストールガイド](https://github.com/iOfficeAI/AionUi/wiki/Getting-Started) - ダウンロードから設定までの詳細ステップ
- [⚙️ LLM 設定ガイド](https://github.com/iOfficeAI/AionUi/wiki/LLM-Configuration) - マルチプラットフォーム AI モデル設定
- [🤖 マルチエージェントモード設定](https://github.com/iOfficeAI/AionUi/wiki/ACP-Setup) - ターミナル AI エージェント統合
- [🔌 MCP ツール設定](https://github.com/iOfficeAI/AionUi/wiki/MCP-Configuration-Guide) - モデルコンテキストプロトコルサーバー設定
- [🎨 画像生成設定](https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide) - AI 画像生成設定チュートリアル

### 🎯 ユースケース

- [📁 ファイル管理](https://github.com/iOfficeAI/AionUi/wiki/file-management) - スマートファイル整理
- [📊 Excel 処理](https://github.com/iOfficeAI/AionUi/wiki/excel-processing) - AI 駆動データ処理
- [🎨 画像生成](https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide) - AI 画像作成
- [📚 その他のユースケース](https://github.com/iOfficeAI/AionUi/wiki/Use-Cases-Overview)

### ❓ サポートとヘルプ

- [❓ FAQ](https://github.com/iOfficeAI/AionUi/wiki/FAQ) - 質問とトラブルシューティング
- [🔧 設定と使用チュートリアル](https://github.com/iOfficeAI/AionUi/wiki/Configuration-Guides) - 完全設定ドキュメント

## 🤝 コミュニティとサポート

### 💬 コミュニティ

- [💬 GitHub Discussions](https://github.com/iOfficeAI/AionUi/discussions) - 経験を共有し、ヘルプを取得
- [🐛 問題を報告](https://github.com/iOfficeAI/AionUi/issues) - バグや機能リクエストを報告
- [📦 リリース](https://github.com/iOfficeAI/AionUi/releases) - 最新アップデートを取得

### 🤝 貢献について

Issue や Pull Request による貢献を心より歓迎します！

1. 本プロジェクトをフォークします。
2. フィーチャーブランチを作成します (`git checkout -b feature/AmazingFeature`)
3. 変更をコミットします (`git commit -m 'Add some AmazingFeature'`)
4. ブランチにプッシュします (`git push origin feature/AmazingFeature`)
5. Pull Request を作成します。

---

## 📄 ライセンス

本プロジェクトは [Apache-2.0](LICENSE) ライセンスを採用しています。

---

## 👥 貢献者

AionUi に貢献してくださったすべての開発者の皆様に感謝いたします！

<p align="center">
  <a href="https://github.com/iOfficeAI/AionUi/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=iOfficeAI/AionUi&max=20" alt="Contributors" />
  </a>
</p>

## 📊 Star 履歴

<p align="center">
  <a href="https://www.star-history.com/#iOfficeAI/aionui&Date" target="_blank">
    <img src="https://api.star-history.com/svg?repos=iOfficeAI/aionui&type=Date" alt="GitHubスターの推移" width="600">
  </a>
</p>

<div align="center">

**⭐ もしよろしければ、ぜひ Star をお願いします！**

[バグを報告](https://github.com/iOfficeAI/AionUi/issues) · [新機能をリクエスト](https://github.com/iOfficeAI/AionUi/issues)

</div>
