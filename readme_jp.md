<p align="center">
  <img src="./resources/aionui_readme_header_0807.png" alt="AionUi Logo" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/office-sec/AionUi?style=flat-square&color=32CD32" alt="Version">
  &nbsp;
  <img src="https://img.shields.io/badge/license-Apache--2.0-32CD32?style=flat-square&logo=apache&logoColor=white" alt="License">
  &nbsp;
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-6C757D?style=flat-square&logo=linux&logoColor=white" alt="Platform">
  &nbsp;
  <img src="https://img.shields.io/badge/Electron-37.2.0-007ACC?style=flat-square&logo=electron&logoColor=white" alt="Electron">
  &nbsp;
  <img src="https://img.shields.io/badge/React-19.1.0-FF6B35?style=flat-square&logo=react&logoColor=white" alt="React">
</p>

---

<p align="center">
  <strong>コマンドラインの機能を、現代的で効率的なAIチャットインターフェースに置き換える。</strong>
</p>

<p align="center">
  <a href="./readme.md">English</a> | <a href="./readme_ch.md">简体中文</a> | <strong>日本語</strong> | <a href="https://www.aionui.com" target="_blank">公式サイト</a> | <a href="https://x.com/AionUI" target="_blank">X(旧ツイッター)</a>
</p>

## 🚀 **AionUi で、どんなことができますか？**

### 📁 **ファイルを整理する**

_ファイルの一括リネーム、自動整理、スマート分類、ファイルの統合_

<p align="center">
  <img src="./resources/sort_out_folder.gif" alt="ファイル管理デモ" width="800">
</p>

### 📊 **Excel をもっとスマートに**

_AI が Excel ファイルの作成、整理、分析、装飾をサポートします_

<p align="center">
  <img src="./resources/generate_xlsx.gif" alt="Excel処理デモ" width="800">
</p>

### 💬 **複数のタスクを同時にこなす**

_複数の会話を開いてもタスクは混乱せず、それぞれの記憶は独立し、効率が倍増します_

<p align="center">
  <img src="./resources/multichat-side-by-side.gif" alt="会話管理デモ" width="800">
</p>

## 📋 目次

- [🤔 どうして AionUi を選ぶべきなのか？](#-どうして-AionUi-を選ぶべきなのか)
- [✨ 主要機能](#-主要機能)
  - [💬 強化されたチャット体験](#-強化されたチャット体験)
  - [🗂️ ファイル・プロジェクト管理](#️-ファイル・プロジェクト管理)
  - [⚡ 開発者ワークフロー](#-開発者ワークフロー)
  - [🔧 シンプルで便利な設定](#-シンプルで便利な設定)
- [🚀 クイックスタート](#-クイックスタート)
  - [📥 ダウンロード](#-ダウンロード)
  - [📋 システム要件](#-システム要件)
  - [🔧 インストール](#-インストール)
  - [🏗️ アプリケーションをビルド](#️-アプリケーションをビルド)
- [🛠️ 技術スタック](#️-技術スタック)
- [📁 プロジェクト構造](#-プロジェクト構造)
- [🎯 主な利用シーン](#-主な利用シーン)
- [🎬 機能実演](#-機能実演)
  - [📊 Excel をスマートに生成・管理](#-excel-をスマートに生成・管理)
  - [🤖 複数モデルを使いこなす](#-複数モデルを使いこなす)
  - [💬 並列チャット管理](#-並列チャット管理)
  - [📁 スマートフォルダ整理](#-スマートフォルダ整理)
- [🔧 設定](#-設定)
  - [🔑 API 設定](#-API-設定)
  - [🌐 プロキシ設定](#-プロキシ設定)
- [🚀 今後の展望](#-今後の展望)
  - [📍 現状](#-現状)
  - [🎯 私たちの未来像](#-私たちの未来像)
- [📄 ライセンス](#-ライセンス)
- [🤝 貢献について](#-貢献について)

---

## 🤔 どうして AionUi を選ぶべきなのか？

公式の Gemini CLI は高機能ですが、日常的なオペレーションにおいてはいくつかの限界があります。AionUi は、これらの課題に対応する GUI ベースの代替手段を提供します：

- **ファイル管理：** `@` コマンドを使ったコードコンテキストの管理は煩雑になりがちです。
- **チャット履歴：** CLI ウィンドウを閉じると、会話履歴が失われます。
- **チャット体験：** コマンドラインインターフェースは、自然なチャットのやり取りに欠けます。
- **マルチタスク：** シングルダイアログモデルは、並行したワークフローを制限します。
- **モデルの制限：** Gemini モデルのみ使用可能で、他の優れた大規模言語モデルを活用できません。

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

### 🔧 **シンプルで便利な設定**

- **多様なプラットフォームに対応** - Gemini、OpenAI、ModelScope、OpenRouter など、主要なプラットフォームに対応しています。
- **柔軟な構成** - 各プラットフォームで複数のモデルを自由に設定でき、API エンドポイントもカスタム可能です。
- **シームレスな認証** - Google 個人アカウントでの認証に対応しており、スムーズにログインできます。
- **スマートな URL 自動修正** - API エンドポイントの設定ミスを自動で検知・修正します。

## 🚀 クイックスタート

### 📥 ダウンロード

AionUi をお試しですか？お使いの環境に合った最新版を、リリースぺージからダウンロードいただけます。

<p>
  <a href="https://github.com/office-sec/AionUi/releases">
    <img src="https://img.shields.io/badge/ダウンロード-最新版-32CD32?style=for-the-badge&logo=github&logoColor=white" alt="最新版をダウンロード">
  </a>
</p>

### 📋 システム要件

- Node.js >= 16.0.0
- npm >= 8.0.0
- Google Gemini API キー ([API キーの取得](https://aistudio.google.com/app/apikey))

### 🔧 インストール

1. **リポジトリをクローン**

   ```bash
    git clone https://github.com/office-sec/AionUi.git
    cd AionUi
   ```

2. **依存関係をインストール**

   ```bash
   npm install
   ```

3. **API キーを設定**

   - アプリを開いて、設定画面へ行く。
   - お手持ちの Google Gemini API キーを入力してください。
   - Gemini API キー、Vertex AI、個人認証など、複数の認証方法に対応しています。

4. **アプリケーションを起動**
   ```bash
   npm start
   ```

### 🏗️ アプリケーションをビルド

```bash
# macOS版をビルド
npm run build-mac --arch=arm64  # Apple Silicon
npm run build-mac --arch=x64    # Intel

# Windows版をビルド
npm run build-win

# 全てのプラットフォームをビルド
npm run build
```

## 🛠️ 技術スタック

- **デスクトップアプリ**: Electron 37.2.0
- **フロントエンドフレームワーク**: React 19.1.0
- **UI コンポーネントライブラリ**: Arco Design Web React
- **AI エンジン**: Google Gemini CLI Core
- **フレームワーク**: UnoCSS
- **ビルドツール**: Webpack + TypeScript
- **アイコンライブラリ**: IconPark React

## 📁 プロジェクト構造

```
AionUI/
├── src/
│   ├── adapter/          # アダプター層
│   ├── agent/           # AI エージェント
│   │   └── gemini/      # Gemini AI統合
│   ├── common/          # 共通モジュール
│   ├── process/         # メインプロセス
│   ├── renderer/        # レンダラープロセス
│   │   ├── components/  # UI コンポーネント
│   │   ├── conversation/# 会話関連
│   │   └── messages/    # メッセージ処理
│   └── worker/          # ワーカープロセス
├── config/              # 設定ファイル
├── public/              # 静的リソース
└── package.json
```

## 🎯 主な利用シーン

- **コード開発**: コードレビュー、リファクタリングの提案、エラー修正
- **ドキュメント作成**: ドキュメントの自動生成、レポートの要約
- **データ分析**: データ可視化、分析レポート
- **プロジェクト管理**: タスク計画、進捗追跡
- **学習アシスタント**: 質疑応答、概念の説明
- **マルチモデルによる協業**: タスクの特性に合わせて、最適な AI モデルを選択できます。
  - **Gemini**: コード生成や技術文書の作成に。
  - **OpenAI**: クリエイティブな文章やコンテンツの制作に。
  - **ModelScope**: 日本語を含む言語理解やローカライズされた作業に。
  - **OpenRouter**: コストの最適化やモデルの性能比較に。

## 🔧 設定

### 🔑 API 設定

様々な認証方法とプラットフォームに対応しています：

1. **Gemini プラットフォーム**:

   - Gemini API キー: シンプルに直接 API を利用できます。
   - Vertex AI: Google Cloud Vertex AI を使用
   - 個人認証: OAuth による個人認証

2. **その他プラットフォーム**:
   - **OpenAI 互換**: OpenAI API と互換性のあるサービスなら、どれでもご利用いただけます。
   - **ModelScope**: Alibaba Cloud の ModelScope プラットフォームにも対応。
   - **OpenRouter**: OpenRouter アグリゲーションプラットフォームに対応。
   - **カスタム プラットフォーム**: 独自の API エンドポイントやモデルを設定することも可能です。

### 🌐 プロキシ設定

プロキシ設定に対応しており、ネットワークが制限された環境でも利用できます。

## 🚀 今後の展望

### 📍 現状

AionUi は、Gemini CLI に強力な GUI インターフェースをもたらし、チャット体験の向上、ファイル管理、開発者向けワークフローの最適化を実現します。さらに、**単一モデルという制約を打ち破り**、複数の大規模言語モデルプラットフォームに対応しました。これにより、タスクごとに最適な AI モデルを自由に選び、活用できるようになります。

### 🎯 私たちの未来像

私たちは、AionUi を**汎用的な AI エージェントプラットフォーム**へと発展させ、誰もがパワフルな AI エージェントを日常業務に活用できる未来を目指しています。

#### 🤖 **マルチエージェントエコシステム**

- **ターミナルエージェント**：「Gemini CLI」をはじめとする、ターミナルベースのエージェントを拡張していきます。
- **ブラウザエージェント**：ウェブ上のタスクを自動化できるよう、オープンソースのブラウザエージェントを統合します。
- **シームレスな体験**：どの種類のエージェントも、シンプルで使いやすいチャットインターフェースで操作できます。
- **エージェントの発見**：新しいエージェントも簡単に見つけ、すぐに利用を開始できます。

#### 🔄 **多様な LLM バインディング**

- **マルチ LLM サポート**：Gemini、Claude、GPT など、複数の言語モデルをあらゆるエージェントに自在に接続できます。
- **モデルの切り替え**：ワークフローを変更することなく、異なる LLM 間で簡単に切り替えが可能。
- **カスタム設定**：各モデルの API キーや設定を個別にカスタマイズできます。
- **AI によるモデルの自動選択**：タスクの性質に合わせて、最適なモデルを自動で提案します。
- **コストの最適化**：複数のモデルを比較し、最も効率的なモデルを賢く選択できます。

#### 🎯 **AI エージェントを、誰もが使いこなせる存在に**

私たちのゴールは、パワフルな AI エージェントを、開発者だけでなく、すべての人々が簡単に利用できるようにすることです。私たちは、以下の価値を大切にしています。

- **複雑さを感じさせない体験**：ユーザーは、エージェントごとに異なる操作方法を覚える必要はありません。複雑なタスクも、直感的にシンプルに感じられるべきです。
- **AI はユーザーに適応する**：テクノロジーがユーザーに合わせるべきであり、その逆ではありません。
- **オープンソースの重要性**：透明性とコミュニティによるコントロールを確保するため、私たちはオープンソースのエージェントの統合を最優先しています。
- **チャットは万能**：シンプルなチャット形式のインターフェースが、複雑なワークフローを円滑に処理します。

AionUI は、最先端の AI と日常の使いやすさの橋渡しをします。複雑な AI エージェントを、まるで友人と会話するような手軽さで、誰もが使いこなせるようにデザインされています。

---

## 📄 ライセンス

本プロジェクトは [Apache-2.0](LICENSE) ライセンスを採用しています。

## 🤝 貢献について

Issue や Pull Request による貢献を心より歓迎します！

貢献の手順

1. 本プロジェクトをフォークします。
2. フィーチャーブランチを作成します (`git checkout -b feature/AmazingFeature`)
3. 変更をコミットします (`git commit -m 'Add some AmazingFeature'`)
4. ブランチにプッシュします (`git push origin feature/AmazingFeature`)
5. Pull Request を作成します。

---

## 📊 Star 履歴

<p align="center">
  <a href="https://www.star-history.com/#office-sec/aionui&Date" target="_blank">
    <img src="https://api.star-history.com/svg?repos=office-sec/aionui&type=Date" alt="GitHubスターの推移" width="600">
  </a>
</p>

<div align="center">

**⭐ もしよろしければ、ぜひ Star をお願いします！**

[バグを報告](https://github.com/office-sec/AionUi/issues) · [新機能をリクエスト](https://github.com/office-sec/AionUi/issues)

</div>
