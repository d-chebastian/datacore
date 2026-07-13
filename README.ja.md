# DataCore ナレッジウェアハウス

[English README is here](./README.md)

生のリソース (PDF、GitHubリポジトリ、CSV、音声、Markdown) を取り込み、プラグインワーカーで構成された
設定可能なパイプラインで処理し、下流のLLMが問い合わせ可能な再利用可能な成果物 (ベクトル埋め込み、
ナレッジグラフ、要約) を生成する、イベント駆動型のナレッジウェアハウスです。

📖 **[ドキュメント](https://datacore.wakewakanai.com/ja/)** ([English](https://datacore.wakewakanai.com))
— アーキテクチャ、API/イベントリファレンス、自分のプラグインを作る方法のガイド。

🚀 **[ライブデモ](https://demo.datacore.wakewakanai.com/ja/portfolio.html)** ([English](https://demo.datacore.wakewakanai.com))
— DataCore自身のパイプラインだけで完全に生成された、実際のポートフォリオサイトです (GitHubスキャン →
Geminiによる文章作成 → セマンティック検索)。モックアップではありません。ソースコードは
[`examples/github-portfolio`](./examples/github-portfolio)。

**→ 完全なステップバイステップの手順は [`RUNNING.md`](./RUNNING.md) を参照してください**
(前提条件、スタックの起動、UIの使い方、テストの実行、Dockerなしのローカル開発、トラブルシューティング)。
このファイルの残りの部分は、同じ手順の簡略版です。

## アーキテクチャ

- **`backend/`** — コアウェアハウス: `/api/v1/` 配下のNode.js/TypeScript + Express REST API、
  リレーショナルメタデータ用のPostgreSQL (Prisma経由)、生ファイル用のMinIO、そしてイベントのみを
  介してプラグインワーカーを統率するRabbitMQベースのPipeline Router。
- **`frontend/`** — React + Vite + TailwindのSPAで、3つの画面 (リソース、パイプライン、プラグイン) と
  グローバル検索を持ち、コアAPIを直接呼び出します。成果物チップはクリック可能です — 単なるタイプ
  バッジではなく、実際に処理された内容 (要約テキスト、GitHubリポジトリ分析、埋め込みベクトル) を
  開きます。また、このリポジトリには含まれない別のCommunity Registryサービス向けの任意パネル
  (プラグイン画面の「コミュニティを見る」、リソース画面の「バンドルとして共有」/「コミュニティから
  インポート」) もあり、実行していない場合は問題なく機能しません(no-op)。
- **`plugins/`** — 独立してデプロイ可能なプラグインワーカーコンテナ。3つのサンプルを同梱:
  - `markdown-summarizer` — `SUMMARY` 成果物を生成します。
  - `vector-embedder` — Qdrantに `VECTOR` 成果物を生成します。
  - `github-profile-scanner` — GitHubプロフィールまたはリポジトリのURLを指定すると、GitHub API経由で
    そのオーナーの公開リポジトリすべてをスキャンし、1つの集約された `REPO_ANALYSIS` 成果物を生成します
    (クローンは行いません)。
- **`mcp-server/`** — DataCoreをLLMクライアント (Claude Desktop、Claude Code、その他のツール呼び出し
  対応エージェント) に、4つの読み取り専用ツール (リソースの一覧/検索、リソースの取得、成果物の実際の
  内容の取得) として公開する[MCP](https://modelcontextprotocol.io)サーバーです。リソース画面の
  「LLM Access」トグルによってリソースごとに制御されます — パイプライン処理には影響しません。
  `mcp-server/README.md` を参照してください。
- **`examples/`** — 下流の利用者向けのサンプルで、それぞれ公開REST API/MCPサーバーとしか通信せず、
  DataCore内部への特別なアクセス権は持ちません:
  - `github-portfolio` — 上記の[ライブデモ](https://demo.datacore.wakewakanai.com/ja/portfolio.html)
    です: GitHubプロフィールをスキャンし、実際にスキャンされたデータに基づいてGeminiがポートフォリオの
    文章を作成し、セマンティックな「私の仕事について質問する」検索ボックスを提供します。1回の実行で
    英語版と日本語版の両方を生成します。
  - `llama-mcp-client` — ローカルのLlamaモデルをOllama経由で動かすことで、MCPサーバーがClaudeだけで
    なくあらゆるツール呼び出し対応クライアントで動作することを証明します。

## クイックスタート (Docker Composeによるローカル開発)

```bash
docker network create datacore-net   # 初回のみ
docker compose up -d
docker compose exec core-api npx prisma migrate deploy
docker compose exec core-api npm run seed   # 3つのサンプルプラグイン + 2つのサンプルパイプラインをシード
```

- Web UI: http://localhost:5173
- コアAPI: http://localhost:3010/api/v1
- RabbitMQ管理画面: http://localhost:15672 (guest/guest)
- MinIOコンソール: http://localhost:9001 (datacore/datacore123)

## バックエンドテストスイートの実行

```bash
docker compose -p kuraio-test -f docker-compose.test.yml up -d
cd backend
cp .env.example .env   # docker-compose.test.yml に合わせてポートを調整 (RUNNING.md 参照)
npm install
npx prisma migrate deploy
npm run test:integration
```

必ず `-p kuraio-test` (またはメインスタック以外の任意の名前) を指定してください — 指定しないと、
Composeはこれをメインスタックの同名コンテナの再定義とみなし、実行中のデモを置き換えてしまいます。
詳細は `RUNNING.md` の§5を参照してください。

統合テストは実際のPostgres、RabbitMQ、MinIO、Qdrantインスタンスに対して実行されます —
プロジェクト憲法のテスト規律の原則に従い、ブローカーやストレージクライアントのモックは一切行いません。
