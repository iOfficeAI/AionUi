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

<p align="center">
  <a href="https://trendshift.io/repositories/15423" target="_blank">
    <img src="https://trendshift.io/api/badge/repositories/15423" alt="GitHub Trending" height="80">
  </a>
</p>

---

<p align="center">
  <strong>🚀 コマンドラインAIツールにグラフィカルインターフェースを提供</strong><br>
  <em>コマンドラインに別れを告げ、グラフィカルインターフェースを楽しむ | マルチモデル対応 | ローカルデータセキュリティ</em>
</p>

<p align="center">
  <a href="https://github.com/iOfficeAI/AionUi/releases">
    <img src="https://img.shields.io/badge/⬇️%20今すぐダウンロード-最新版-32CD32?style=for-the-badge&logo=github&logoColor=white" alt="最新版をダウンロード" height="30">
  </a>
</p>

<p align="center">
  <a href="./readme.md">English</a> | <a href="./readme_ch.md">简体中文</a> | <strong>日本語</strong> | <a href="https://www.aionui.com" target="_blank">公式サイト</a> | <a href="https://twitter.com/AionUI" target="_blank">Twitter</a>
</p>

---

## 📋 クイックナビゲーション

<p align="center">

[✨ AionUiでできること](#✨-aionuiでできること) ·
[🤔 なぜAionUiを選ぶのか](#🤔-なぜaionuiを選ぶのか) ·
[✨ コア機能](#✨-コア機能) ·
[🚀 クイックスタート](#🚀-クイックスタート) ·
[📖 詳細使用説明](#📖-詳細使用説明) ·
[💬 コミュニティ](#🤝-コミュニティとサポート)

</p>

---

## ✨ AionUiでできること？

<p align="center">
  <img src="./resources/bannerimage.png" alt="AionUi機能紹介" width="800">
</p>

### 🤖 **マルチエージェントモード - コマンドラインAIツールにグラフィカルインターフェースを提供**

_Gemini CLI、Claude Code、CodeX、Qwen Code、Goose AI、Augment Codeなどのコマンドラインツールをインストール済みの場合、AionUiは自動的に検出し、統一されたグラフィカルインターフェースを提供します_

- ✅ **自動検出 + 統一インターフェース** - ローカルCLIツールを自動認識し、統一されたグラフィカルインターフェースを提供、コマンドラインに別れを告げる
- ✅ **ローカル保存 + マルチセッション** - 会話をローカルに保存、マルチセッション並列をサポート、各セッションは独立したコンテキスト

<p align="center">
  <img src="./resources/acp home page.gif" alt="マルチエージェントモードデモ" width="800">
</p>

---

### 📄 **プレビューパネル - AI生成結果を素早く確認**

_9種類以上の形式のビジュアルプレビューをサポート（PDF、Word、Excel、PPT、コード、Markdown、画像、HTML、Diffなど）_

- ✅ **即座に結果を確認** - AIがファイルを生成した後、アプリを切り替えることなく、すぐにプレビューを確認
- ✅ **リアルタイム追跡 + 編集可能** - ファイル変更を自動追跡、エディタとプレビューがインテリジェントに同期；Markdown、コード、HTMLのリアルタイム編集をサポート、WYSIWYG

<p align="center">
  <img src="./resources/preview.gif" alt="プレビューパネルデモ" width="800">
</p>

---

### 🎨 **AI画像生成と編集**

_インテリジェントな画像生成、編集、認識、Geminiが駆動_

<p align="center">
  <img src="./resources/Image_Generation.gif" alt="AI画像生成デモ" width="800">
</p>

> 💡 **無料画像生成の設定にヘルプが必要ですか？** [チュートリアルに従って画像生成モデルを設定](https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide)

---

### 📁 **スマートファイル管理**

_一括リネーム、自動整理、スマート分類、ファイルマージ_

<p align="center">
  <img src="https://github.com/iOfficeAI/AionUi/wiki/assets/gifs/file-management/file-organization.gif" alt="ファイル管理デモ" width="800">
</p>

---

### 💬 **マルチタスク並列処理**

_複数の会話を開く、タスクが混乱しない、記憶が独立、効率が倍増_

<p align="center">
  <img src="./resources/multichat-side-by-side.gif" alt="会話管理デモ" width="800">
</p>

---

### 🌐 **どこからでもアクセス - WebUIモード**

_AIツールをリモート制御 - ネットワーク上の任意のデバイスからAionUiにアクセス！ローカルのGemini CLI、Claude Code、Codexなどのツールを安全に制御、データはデバイスから離れません_

```bash
# 基本起動
AionUi --webui

# リモートアクセス（ローカルネットワーク内の他のデバイスからアクセス可能）
AionUi --webui --remote
```

> 💡 **詳細な設定ガイドが必要ですか？** [WebUI設定チュートリアル](https://github.com/iOfficeAI/AionUi/wiki/WebUI-Configuration-Guide)を確認 - 全プラットフォームの完全な起動コマンドを含む

<p align="center">
  <img src="./resources/webui banner.png" alt="WebUIリモートアクセスデモ" width="800">
</p>

---

## 🤔 なぜAionUiを選ぶのか？

Gemini CLI、Claude Code、Codex、Qwen CodeなどのコマンドラインAIツールは強力ですが、いくつかの共通の痛みがあります：会話が保存できない、単一セッション制限、ファイル操作が煩雑、単一モデルのみ使用可能。

AionUiはこれらのコマンドラインツールにモダンなグラフィカルインターフェースを提供し、**これらの制限を打破**し、インタラクション体験をシンプルで直感的にし、同時にマルチモデル切り替えをサポートし、さまざまなタスク要件を満たします。

### 📊 AionUi vs コマンドラインAIツール

| 機能               | AionUi                                   | コマンドラインAIツール            |
| ------------------ | ---------------------------------------- | --------------------------------- |
| インターフェース   | 🎨 グラフィカルインターフェース          | 💻 コマンドライン                 |
| 会話保存           | ✅ ローカル保存                          | ❌ 閉じると失われる               |
| マルチセッション   | ✅ サポート                              | ❌ サポートなし                   |
| コンテキスト管理   | ✅ 独立コンテキスト、干渉なし            | ❌ 単一コンテキスト、混乱しやすい |
| ファイル選択       | 🖱️ クリックで選択                        | ⌨️ @コマンド                      |
| マルチモデル       | ✅ サポート                              | ❌ 単一モデル                     |
| ファイルプレビュー | ✅ 9種類以上の形式のビジュアルプレビュー | ❌ プレビューなし                 |
| リモートアクセス   | ✅ WebUIモード                           | ❌ サポートなし                   |

---

### ❓ クイックQ&A

<details>
<summary><strong>Q: AionUiはすぐに使えますか？</strong></summary>
A: はい！インストール後、Googleアカウントでログインするだけで使用できます。AionUiは自動的にGemini CLIと関連付けられ、追加の設定なしで使用を開始できます。
</details>

<details>
<summary><strong>Q: 有料ですか？</strong></summary>
A: AionUiは完全に無料でオープンソースですが、AIモデルを使用するには対応するAPIキーが必要です。
</details>

<details>
<summary><strong>Q: どのAIモデルがサポートされていますか？</strong></summary>
A: Gemini、OpenAI、Claude、Qwenなどの主流モデル、およびOllama、LM Studioなどのローカルモデルをサポートしています。

複数のAIエージェント（Gemini CLI、Claude Code、Qwen Codeなど）を同時に実行することもできます。詳細は設定ガイドを参照してください。

</details>

<details>
<summary><strong>Q: データは安全ですか？</strong></summary>
A: すべての会話データはローカルのSQLiteデータベースに保存され、どのサーバーにもアップロードされません。
</details>

---

## ✨ コア機能

### 💬 **マルチセッションチャット**

- **マルチセッション + 独立コンテキスト** - 複数のチャットを同時に開く、各セッションは独立したコンテキストメモリを持ち、混同しない
- **ローカル保存** - すべての会話はローカルに保存され、失われません

### 🤖 **マルチモデルサポート**

- **マルチプラットフォームサポート** - Gemini、OpenAI、Claude、Qwenなどの主流モデルをサポート、柔軟に切り替え
- **ローカルモデルサポート** - Ollama、LM Studioなどのローカルモデルデプロイメントをサポート、Customプラットフォームを選択し、ローカルAPIアドレス（例：`http://localhost:11434/v1`）を設定するだけで接続可能
- **Gemini 3 サブスクリプション最適化** - サブスクリプションユーザーを自動識別、高度なモデルを推奨

### 🗂️ **ファイル管理**

- **ファイルツリーブラウズ + ドラッグ&ドロップアップロード** - フォルダのようにファイルを閲覧、ファイルやフォルダのドラッグ&ドロップでワンクリックインポートをサポート
- **スマート整理** - AIにフォルダの整理を依頼でき、自動分類

### 📄 **プレビューパネル - AIエージェントにディスプレイを提供**

- **9種類以上の形式プレビュー** - PDF、Word、Excel、PPT、コード、Markdown、画像などをサポート、AI生成後すぐに結果を確認
- **リアルタイム追跡 + 編集可能** - ファイル変更を自動追跡、Markdown、コード、HTMLのリアルタイム編集とデバッグをサポート

### 🎨 **AI画像生成と編集**

- **インテリジェント画像生成** - Gemini 2.5 Flash Image Preview、Nano、Bananaなどの複数の画像生成モデルをサポート
- **画像認識と編集** - AI駆動の画像分析と編集機能

### 🌐 **WebUIリモートアクセス**

- **クロスデバイスアクセス** - ネットワーク上の任意のデバイスからブラウザ経由でアクセス、モバイルデバイスをサポート
- **ローカルデータセキュリティ** - すべてのデータはSQLiteデータベースにローカル保存、サーバーデプロイメントに適している

### 🎨 **パーソナライズされたインターフェースカスタマイズ**

_独自のCSSコードでカスタマイズし、インターフェースを好みに合わせる_

<p align="center">
  <img src="./resources/css with skin.gif" alt="CSSカスタムインターフェースデモ" width="800">
</p>

- **完全カスタマイズ可能** - CSSコードを通じてインターフェースの色、スタイル、レイアウトを自由にカスタマイズ、専属の使用体験を作成

---

## 📖 詳細使用説明

<details>
<summary><strong>📖 完全な使用説明を展開して表示</strong></summary>

### 🚀 クイックスタート

- [📖 完全インストールガイド](https://github.com/iOfficeAI/AionUi/wiki/Getting-Started) - ダウンロードから設定までの詳細な手順
- [⚙️ LLM設定ガイド](https://github.com/iOfficeAI/AionUi/wiki/LLM-Configuration) - マルチプラットフォームAIモデル設定
- [🤖 マルチエージェントモード設定](https://github.com/iOfficeAI/AionUi/wiki/ACP-Setup) - ターミナルAIエージェントの統合
- [🔌 MCPツール設定](https://github.com/iOfficeAI/AionUi/wiki/MCP-Configuration-Guide) - モデルコンテキストプロトコルサーバー設定
- [🎨 画像生成設定](https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide) - AI画像生成設定チュートリアル
- [🌐 WebUI設定ガイド](https://github.com/iOfficeAI/AionUi/wiki/WebUI-Configuration-Guide) - 完全なWebUIセットアップと設定チュートリアル

### 🎯 ユースケース

- [📁 ファイル管理](https://github.com/iOfficeAI/AionUi/wiki/file-management) - スマートファイル整理
- [📊 Excel処理](https://github.com/iOfficeAI/AionUi/wiki/excel-processing) - AI駆動のデータ処理
- [🎨 画像生成](https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide) - AI画像作成
- [📚 その他のユースケース](https://github.com/iOfficeAI/AionUi/wiki/Use-Cases-Overview)

### ❓ サポートとヘルプ

- [❓ よくある質問](https://github.com/iOfficeAI/AionUi/wiki/FAQ) - 質問とトラブルシューティング
- [🔧 設定と使用チュートリアル](https://github.com/iOfficeAI/AionUi/wiki/Configuration-Guides) - 完全な設定ドキュメント

</details>

---

## 🚀 クイックスタート

### 💻 システム要件

- **macOS**: 10.15以上
- **Windows**: Windows 10以上
- **Linux**: Ubuntu 18.04+ / Debian 10+ / Fedora 32+
- **メモリ**: 4GB以上推奨
- **ストレージ**: 少なくとも500MBの空き容量

### 📥 ダウンロード

<p>
  <a href="https://github.com/iOfficeAI/AionUi/releases">
    <img src="https://img.shields.io/badge/ダウンロード-最新版-32CD32?style=for-the-badge&logo=github&logoColor=white" alt="最新版をダウンロード">
  </a>
</p>

### 🔧 簡単インストール

1. **ダウンロードしてインストール** AionUiアプリケーション
2. **AIサービスを設定** - GoogleアカウントログインまたはAPIキー認証をサポート
3. **使用開始** - モダンなAIチャットインターフェースをすぐに体験

> 💡 **詳細な設定ガイドが必要ですか？** [完全インストールチュートリアル](https://github.com/iOfficeAI/AionUi/wiki/Getting-Started)を確認

---

## 🤝 コミュニティとサポート

### 💬 コミュニティ

**💡 あなたのアイデアが重要です！** すべてのユーザーの提案とフィードバックを非常に重視しています。機能のアイデア、使用体験、または遭遇した問題について、いつでもお気軽にお問い合わせください！

<p align="center">
  <a href="https://x.com/AionUi" target="_blank">
    <img src="./resources/contactus-x.png" alt="Xでお問い合わせ" width="600">
  </a>
</p>

- [💬 GitHub Discussions](https://github.com/iOfficeAI/AionUi/discussions) - **アイデアを共有、提案、使用のヒントを交換**
- [🐛 問題を報告](https://github.com/iOfficeAI/AionUi/issues) - バグや機能リクエストを報告
- [📦 リリース更新](https://github.com/iOfficeAI/AionUi/releases) - 最新版を取得

### 🤝 コード貢献

IssueとPull Requestの提出を歓迎します！

1. このプロジェクトをFork
2. 機能ブランチを作成 (`git checkout -b feature/AmazingFeature`)
3. 変更をコミット (`git commit -m 'Add some AmazingFeature'`)
4. ブランチにプッシュ (`git push origin feature/AmazingFeature`)
5. Pull Requestを開く

---

## 📄 ライセンス

このプロジェクトは[Apache-2.0](LICENSE)ライセンスの下で公開されています。

---

## 👥 貢献者

AionUiに貢献してくれたすべての開発者に感謝します！

<p align="center">
  <a href="https://github.com/iOfficeAI/AionUi/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=iOfficeAI/AionUi&max=20" alt="貢献者" />
  </a>
</p>

## 📊 スター履歴

<p align="center">
  <a href="https://www.star-history.com/#iOfficeAI/aionui&Date" target="_blank">
    <img src="https://api.star-history.com/svg?repos=iOfficeAI/aionui&type=Date" alt="GitHubスター傾向" width="600">
  </a>
</p>

<div align="center">

**⭐ 気に入ったらスターをお願いします**

[バグを報告](https://github.com/iOfficeAI/AionUi/issues) · [機能をリクエスト](https://github.com/iOfficeAI/AionUi/issues)

</div>
