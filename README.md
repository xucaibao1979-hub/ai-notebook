# Smart Wrong Notebook (智能错题本)

一个基于 AI 的智能错题管理系统，帮助学生高效整理、分析和复习错题。

## ✨ 主要功能

- **每日推荐**：可选择个人错题本生成 AI 变式，或随机练习带来源的网络公开题库；当天同一组选项的题目和作答进度持久保存。
- **AI练习**：支持数学、语文、英语、物理、化学、生物、历史、地理、政治及自定义内容，可输入提示词或知识点，选择年级、难度和 1–5 道题。
- **左侧导航**：全站统一学习导航，手机端支持折叠菜单。
- **学习概览与每周分析**：默认入口展示学习统计，熊猫 Logo 可返回概览；错题本每周自动分析最近七天新增错题的薄弱知识点，并用已配置的 AI 生成专项变式题。
- **知识库**：按科目、年份、地区、中考/高考及考试年级筛选公开试卷，支持知识年级标签筛选，题目与来源答案分离并可一键隐藏。

- **🤖 AI 智能分析**：自动识别题目内容，生成解析、知识点标签和同类练习题。
- **⚙️ 灵活的 AI 配置**：支持 **Google Gemini** 和 **OpenAI** (及兼容接口) 两种 AI 提供商，可直接在网页设置中动态切换和配置。
- **📚 多错题本管理**：支持按科目（如数学、物理、英语）创建和管理多个错题本。
- **🏷️ 智能标签系统**：自动提取知识点标签，支持自定义标签管理。
- **🔍 多维度筛选**：支持按掌握状态、时间范围、知识点标签、年级学期、试卷等级等多种条件筛选错题。
- **🖨️ 灵活导出打印**：一键导出筛选后的错题，支持自定义打印内容（答案/解析/知识点）和图片缩放比例，可直接打印或保存为 PDF。
- **📝 智能练习**：基于错题生成相似的练习题，巩固薄弱环节。
- **📊 数据统计**：可视化展示错题掌握情况和学习进度。
- **🔐 用户管理**：支持多用户注册、登录，数据安全隔离。
- **🛡️ 管理员后台**：提供用户管理功能，可禁用/启用用户、删除违规用户。


## 📸 屏幕截图功能 (HTTPS 设置)

本应用的屏幕截图功能依赖浏览器的安全上下文 (HTTPS)。在 Docker 或局域网环境中使用时，请参考 **[HTTPS 配置指南](doc/HTTPS_SETUP.md)** 启用内置 HTTPS 支持。

## 📱 PWA 支持 (添加到主屏幕)

本项目支持 PWA (Progressive Web App)，您可以将应用添加到手机主屏幕，获得原生应用般的使用体验。

**功能特性**：
- 🚀 **快速启动**：点击主屏幕图标直接打开，无需输入网址。
- 📱 **沉浸体验**：全屏运行，无浏览器地址栏干扰。
- 🎨 **原色适配**：应用图标和启动画面适配系统主题。

**使用方法**：

- **iPhone / iPad (Safari)**: 点击底部 **分享** 按钮 -> 选择 **"添加到主屏幕"**。
- **Android (Chrome)**: 点击右上角 **菜单** -> 选择 **"添加到主屏幕"** 或 **"安装应用"**。

## 🛠️ 技术栈

- **框架**: [Next.js 16](https://nextjs.org/) (App Router)
- **UI 库**: [React 19](https://react.dev/)
- **数据库**: [SQLite](https://www.sqlite.org/) (via [Prisma](https://www.prisma.io/))
- **样式**: [Tailwind CSS v4](https://tailwindcss.com/) + [Shadcn UI](https://ui.shadcn.com/)
- **AI**: Google Gemini API / OpenAI API / Azure OpenAI
- **认证**: [NextAuth.js](https://next-auth.js.org/)

## 🚀 快速开始

### 方式一：使用 Docker 部署

#### 1. 启动服务

您可以选择 **直接使用命令** (适合快速测试) 或 **Docker Compose** (适合长期运行)。

**选项 A：直接使用 Docker 命令**

```bash
docker run -d --name wrong-notebook \
  -e NEXTAUTH_SECRET="your_secret_key" \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/config:/app/config \
  ghcr.io/wttwins/wrong-notebook
```

**选项 B：使用 Docker Compose (推荐)**

使用 `docker-compose.yml` 文件进行管理。

1.  **下载配置文件**：
    ```bash
    curl -o docker-compose.yml https://raw.githubusercontent.com/wttwins/wrong-notebook/refs/heads/main/docker-compose.yml
    ```
2.  **启动服务**：
    ```bash
    docker-compose up -d
    ```
3.  **查看日志**：
    ```bash
    docker-compose logs -f
    ```
4.  **停止服务**：
    ```bash
    docker-compose down
    ```

### 方式二：本地源码运行

#### 1. 克隆仓库

```bash
git clone https://github.com/wttwins/wrong-notebook.git
cd wrong-notebook
```

#### 2. 环境准备

确保已安装 Node.js (v20.9+) 和 npm。

#### 3. 安装依赖

```bash
npm install
```

#### 4. 配置环境变量

复制 `.env.example` 为 `.env` 并填入必要的配置：

```bash
cp .env.example .env
```

**基础配置**

| 环境变量 | 描述 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | 数据库连接地址 | `file:./dev.db` | SQLite 数据库路径 |
| `NEXTAUTH_SECRET` | Auth 密钥 | 无 | 用于加密 Session，生产环境建议设置,可以使用 openssl rand -base64 32 生成一个随机字符串作为密钥 |
| `NEXTAUTH_URL` | 访问地址 | `http://your-domain-name:3000` | 部署后的访问地址 |
| `AUTH_TRUST_HOST` | 信任主机头 | `true` | 设置为 `true` 时自动推断 URL，适合 Docker/PaaS |
| `LOG_LEVEL` | 日志级别 | `debug` (开发) / `info` (生产) | 可选值：`trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `HTTP_PROXY` | HTTP 代理 | 无 | 设置 HTTP 代理 |
| `HTTPS_PROXY` | HTTPS 代理 | 无 | 设置 HTTPS 代理 |

**AI 配置**

| 环境变量 | 描述 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `AI_PROVIDER` | AI 提供商 | `gemini` | 可选 `gemini`、`openai` 或 `azure` |

**Gemini 配置**

| 环境变量 | 描述 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `GOOGLE_API_KEY` | Gemini API Key | 无 | 使用 Gemini 时必填，从 [Google AI Studio](https://aistudio.google.com/apikey) 获取 |
| `GEMINI_BASE_URL` | Gemini API 地址 | 无 | 可选，默认 `https://generativelanguage.googleapis.com`，通常无需修改 |
| `GEMINI_MODEL` | Gemini 模型 | `gemini-2.5-flash` | 可选，如 `gemini-2.5-pro`、`gemini-3.0-flash` 等 |

**OpenAI 配置**

| 环境变量 | 描述 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `OPENAI_API_KEY` | OpenAI API Key | 无 | 使用 OpenAI 时必填，从 [OpenAI Platform](https://platform.openai.com/api-keys) 获取 |
| `OPENAI_BASE_URL` | OpenAI API 地址 | 无 | 可选，默认 `https://api.openai.com/v1`；使用第三方兼容服务时填写对应地址 |
| `OPENAI_MODEL` | OpenAI 模型 | `gpt-4o` | 可选，如 `gpt-4-turbo`、`o3`、`o4-mini` 等 |

**Azure OpenAI 配置**

| 环境变量 | 描述 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `AZURE_OPENAI_API_KEY` | Azure API Key | 无 | 使用 Azure OpenAI 时必填，从 Azure 门户获取 |
| `AZURE_OPENAI_ENDPOINT` | Azure Endpoint | 无 | Azure 资源端点，如 `https://xxx.openai.azure.com` |
| `AZURE_OPENAI_DEPLOYMENT` | 部署名称 | 无 | Azure 中配置的部署名称，如 `gpt-4o` |
| `AZURE_OPENAI_API_VERSION` | API 版本 | `2024-02-15-preview` | 可选，Azure API 版本 |
| `AZURE_OPENAI_MODEL` | Azure 模型 | `gpt-4o` | 可选，显示用的模型名称 |

#### 5. 初始化数据库

```bash
npx prisma migrate dev
npx prisma db seed
```

#### 6. 管理员账户

默认管理员账户：
- **用户名**: `admin`（也可使用邮箱 `admin@localhost` 登录）
- **密码**: `admin`

> 管理员可在左侧“管理后台 → 管理员登录设置”或“设置 → 用户管理”修改自己的用户名和密码，修改时验证当前密码。已有账号的密码不会在重新运行初始化脚本时被覆盖。

### 每日推荐与 AI练习

- 每日推荐按上海时区日期更新，刷新后恢复当天的题目与作答。调整来源、科目、错题本、难度或数量可以获取另一组推荐。
- 错题本推荐和 AI练习使用“设置 → AI服务”中配置的 Gemini、OpenAI 兼容接口或 Azure OpenAI；空错题本会提示先录题。每道生成题可作答、查看解析并记录掌握情况。
- 网络推荐直接读取公开题库，不需要 AI 密钥。数学、语文、物理、化学、生物、历史、地理、政治来自 [CMMLU](https://github.com/haonan-li/CMMLU)，英语来自 [BIG-bench 英语谚语阅读](https://github.com/google/BIG-bench/tree/main/bigbench/benchmark_tasks/english_proverbs)。题库不提供学生错误率，页面不将随机题标为错误率排名。
- 每题显示来源、题号和许可证。CMMLU 数据采用 CC BY-NC-SA 4.0；英语题库保留 BIG-bench 项目许可证链接。原题答案用于选择题判分；未提供逐题解析时明确提示，可使用“AI解析”另行生成说明。开放题需对照解析自评。
- 公开题库缓存位于 `data/question-bank`，成功下载后缓存 7 天，网络不可用时优先使用已有缓存。备份学习数据时应同时保存 SQLite 数据库。
- 更新旧项目后运行 `npx prisma generate` 和 `npx prisma migrate deploy`，应用用户名与练习数据的新迁移，再启动服务。

### 知识库与公开试卷归档

“知识库”默认整理 2022—2026 年公开目录中的中高考试卷。页面显示实际收录、逐题数量、独立答案数量、来源以及每年的覆盖情况；目录处理完成不表示全国所有省市真题已经齐全。来源为 [考试卷网公开试卷目录](https://kaosj.com/topics/)，收录材料均标为公开整理版或待核验，未冒充考试机构官方原卷。

```powershell
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/sync-knowledge-library.ts
```

- 管理员也可点击知识库右上角“同步公开试卷”。工具低频读取公开页面，遇到 403/429 即停止；已归档资料默认跳过。状态、失败原因和源目录保存在 `data/knowledge-library`，原始 HTML 保存在 `raw` 子目录。
- `--refresh` 重新下载归档资料；`--reparse-cache` 仅重新解析已经保存的原始 HTML。两者均不删除个人错题数据。抓取任务使用 `sync.lock` 防止并发运行。
- 原文能逐题分离时独立存储题干与答案；不能可靠分题时保留整卷原文，显示“未逐题拆分”，不计入逐题统计。来源图片通过原始 HTTPS 地址加载，Word/PDF 附件保留下载出处。
- 题干疑似混入答案的段落在隐藏答案时默认折叠。答案默认隐藏，也可以仅查看单题；点击“一键隐藏全部答案”会清除已展开答案。
- 考试年级与知识年级分开处理。目前可识别的数学考点采用关键词推断年级并明确标注“待人工确认”；无法确定的其他题目不强行套用考试年级。
- 数据备份应包含 SQLite 数据库及 `data/knowledge-library`。公开资料的原始版权归相应命题/发布机构，保留出处，不把待核验内容当成官方结论。

### 多模型服务商设置

“设置 → AI服务”提供 OpenAI、阿里通义千问、百度千帆、腾讯混元、智谱 GLM、DeepSeek、字节豆包、Kimi、MiniMax、硅基流动十家服务商，以及 OpenAI Codex 模型的快捷预设；仍保留 Google Gemini 和 Azure OpenAI 配置。每个实例可以独立设置 API Key、服务地址、模型 ID 和 Chat Completions / Responses 协议，最多保存 20 个实例。

预设仅提供官方接口的接入起点；地区、业务空间、账户权限与模型可用性须以服务商控制台为准。地址和模型 ID 均可修改，也可使用自定义兼容网关。连接测试检查所选模型的文本/图片支持，不保证每个模型支持图片。

Codex 模型通过 [OpenAI Responses API](https://developers.openai.com/api/docs/models/gpt-5.3-codex) 调用，使用 OpenAI API 密钥；Codex 应用或 ChatGPT 登录凭据不作为 API 密钥使用。没有真实密钥时仅验证协议和解析逻辑，不宣称已经连通服务商。

### 每周错题分析

- 默认 `/` 展示学习统计；录题从“错题本 → 录入错题”或单科错题本的新增按钮进入。知识点管理位于“知识库 → 知识点管理”。后台设置入口保留在“设置 → 用户管理”中。
- 应用服务启动 30 秒后、之后每小时检查一次。报告按上海时区的周一划分每周周期；每个账号、每个错题本每周首次执行时分析当时最近七天新增的错题。本周已有成功/空报告时不会自动重复出题；可手动点击“重新分析最近七天”更新。
- 服务关闭、电脑关机期间无法运行；重新启动后补做尚未生成的本周分析，不补造历史周报。必须保持应用服务运行才能自动执行，无需在浏览器持续停留。
- 统计覆盖本周窗口内全部错题；按知识点频次和掌握程度排序，AI 诊断最多读取 40 道随机样本及其已有错因，生成最多 3 个重点对应的专项题。频次排序并不等于确定的认知诊断。
- 未配置密钥时保留统计和薄弱点列表；启用模型后可重新分析并生成详细周报和练习。无新增错题时不调用 AI。失败保留统计并进入重试冷却期。
- 报告和练习保存在数据库，执行租约和每周唯一记录防止并发重复生成。点击“开始薄弱点专项练习”进入 AI练习，作答记录进入学习统计。

### 年级、倒计时和作业推荐

在“设置 → 账户”选择当前年级，或保留按学段、入学年份自动推算。明确选择的年级优先；自动推算按上海时区的九月学年切换。学习统计显示初中阶段的中考目标、高中阶段的高考目标。中考日期需填写当地实际安排；未填写的高考日期按对应毕业年 6 月 7 日作预计值，明确标记待官方确认，支持自行修改。小学和大学不强行显示中高考倒计时。

每日推荐、默认 AI练习、每周专项题使用当前年级；AI练习仍可手动选择其他目标年级。修改年级后推荐缓存和每周报告重新匹配。低年级网络题从知识库中选择已标注、未超过当前年级且有可分离答案的内容；题库年级为推断标签，教材版本需核对。匹配题量不足时使用已配置 AI 按当前年级补充，并标明非真题来源，不使用未标注或更高年级题填满。高三可从高中公开题库复习。历史练习按明确链接保留。

### 账户菜单、试卷校对与连接恢复

设置位于左下角熊猫账户图标；鼠标悬停或键盘聚焦展开中文菜单，可直达账户、年级、考试日期和模型设置。关闭开发模式指示图标，避免产品界面显示英文开发工具菜单。

试卷质量提示按题目说明答案提示、疑似缺图、缺答案或未分题等问题，不将全卷笼统标为题干质量异常。管理员可对照来源编辑 Markdown 题干，保存本地校对版；原始题干、出处和校对记录保留，本地校对不代表官方原卷认证。再次抓取时，原文未变化的校对内容保留；变更前的本地校对备份在 `data/knowledge-library/corrections`。

只读请求遇到短暂连接失败或 502/503/504 时最多尝试三次。分析、出题和保存等写入请求不自动重发，防止重复记录与重复模型费用。网络、登录失效、超时、模型地址、密钥和额度问题使用中文说明，并保留手动重试入口。

#### 7. 启动开发服务器

```bash
npm run dev
```

访问 [http://your-domain-name:3000](http://your-domain-name:3000) 开始使用。

## ⚙️ AI 模型配置

本项目支持动态配置 AI 模型，无需重启服务器。

1.  **进入设置**：点击首页右上角的设置图标。
2.  **选择提供商**：支持 Google Gemini、OpenAI 和 **Azure OpenAI**。
3.  **填写参数**：
    *   **通用参数**: API Key、Base URL（或 Endpoint）、Model Name（或 Deployment Name）。
    *   **Azure 特有**: Deployment Name（部署名称）、API Version（API 版本）。
4.  **保存生效**：点击保存后即刻生效。

> **注意**：网页配置会保存到 `config/app-config.json` 文件中，该文件的优先级高于 `.env` 环境变量。

### 配置样例

选择提供商后，填写对应参数即可。各服务商获取方式如下：

#### Google Gemini

| 参数 | 获取方式 |
| :--- | :--- |
| API Key | [Google AI Studio](https://aistudio.google.com/apikey) → 创建 API Key |
| Base URL | 默认 `https://generativelanguage.googleapis.com`，通常无需修改 |
| 模型 | `gemini-2.5-flash`（推荐）、`gemini-2.5-pro`、`gemini-3.0-flash` 等 |

#### OpenAI

| 参数 | 获取方式 |
| :--- | :--- |
| API Key | [OpenAI Platform](https://platform.openai.com/api-keys) → Create new secret key |
| Base URL | 默认 `https://api.openai.com/v1` |
| 模型 | `gpt-4o`（推荐）、`gpt-4-turbo`、`o3`、`o4-mini` 等 |

> **兼容模式**：OpenAI 提供商兼容所有支持 OpenAI API 格式的第三方服务。只需将 Base URL 改为对应服务地址，即可使用硅基流动、智谱 GLM、月之暗面 Kimi、通义千问 DashScope 等平台的模型。模型名称需填写对应平台的完整模型 ID。

#### Azure OpenAI

| 参数 | 获取方式 |
| :--- | :--- |
| API Key | Azure 门户 → 你的 OpenAI 资源 → 密钥和终结点 |
| Endpoint | Azure 门户 → 你的 OpenAI 资源 → 终结点，如 `https://xxx.openai.azure.com` |
| 部署名称 | Azure 中配置的模型部署名称，如 `gpt-4o` |
| API 版本 | 默认 `2024-02-15-preview` |
| 模型 | 显示用的模型名称，如 `gpt-4o` |

## 🛠️ 实用脚本

在 `scripts/` 目录下提供了一些实用脚本，用于维护和调试：

- **重置密码**:
  ```bash
  node scripts/reset-password.js <邮箱> <新密码>
  ```
  示例:  
  ```bash
  node scripts/reset-password.js user@example.com 123456 
  ```

## 📄 许可证

MIT License

本地学习升级：网络推荐题量不足时按账户年级调用已启用模型补充，并标注 AI 来源；AI 练习首次进入且无可恢复记录时自动生成数学练习。学习统计同时计算适用的预计中考（6 月 15 日基准，可自定义）与高考（6 月 7 日基准）日期。知识库按科目筛选、年份倒序，填写后保存或完成可在作答历史继续练习；重新作答会创建新记录。`node scripts/repair-library.cjs` 可离线修复安全连续题号和数字重复误报，修改前保留备份；共享材料或整卷答案无法安全对应的资料保留整卷，不生成伪造真题答案。

练习收藏与历史：推荐、AI 出题、每周变式和单题举一反三均保存到 LearningSet。知识库分为试卷资料、知识点、练习历史三个页签；历史支持科目、年级、日期、来源、完成状态与标题筛选，收藏页可查看单题。整组删除进入回收站并从练习统计中移除，支持恢复；永久删除会连同作答记录删除。单题删除保留索引，并可在原练习恢复。错题本上方支持名称及题干、知识点、错因、笔记搜索。


## 2026-10-10 学习功能升级

- 设置 → 账户：完整学习备份（版本 2），包含错题与图片、知识点、练习题组与收藏、作答、周报、使用过的试卷、年级/考试日期/教材和学习计划。先校验校验和、关联与日期，再预览数量并恢复；恢复前自动保存当前账户快照；重复恢复去重，事务失败不留下部分数据库写入。账号密码与模型密钥不导出。旧版个人导入继续支持；管理员旧版全用户导入导出保留原格式。
- 服务启动一分钟后及每小时更新 data/backups/YYYY-MM-DD/ 下的数据库快照和各账户压缩备份。服务关闭时不会执行；按日期保留，当前不自动清理。完整数据库包含全部题库，个人便携备份包含使用过的试卷。请复制到其他磁盘；备份文件包含个人学习内容。
- 设置 → 账户：教材版本、上下学期、当前章节、每日时长。用于约束出题，不意味着已有公开题库已逐题映射全部教材。
- AI 出题和变式增加生成后独立解题复核，异常题最多重试一次。每天推荐优先使用已校对且资料完整的题目，排除缺图、混有答案或没有独立答案的来源；题库不足时 AI 补充。AI 复核仍可能出错，不标为人工认证。
- AI练习和每日推荐显示实际生成、校验、保存进度，保留通过的题目，可只补齐缺题。反馈保存到原题；手动重新生成同知识点题会单独保存新题，保留原题和旧作答。
- 练习提供三步提示、开放题批改建议、自评修正、答错一键回流并安排复习。批改建议不自动改写掌握状态。
- 学习统计增加今日任务、知识点掌握情况、错因和重复错误，分开展示客观判定与开放题/复习自评。至少三个不同日期正确复习才自动标记掌握；排期依据复习结果调整。
- 试卷提供计时、题号导航、未答标记、交卷汇总、作答保存、答错回流；没有评分标准时不估算总分。管理员校对支持 Markdown 答案及知识年级。
- 设置 → AI 提供商：识图、出题、复核/批改、周报分别选择已配置的兼容实例，设置备用实例并手动切换。记录调用耗时、成功状态及接口提供的输入/输出 token；未提供时不估算费用。
- Windows 本地生产构建使用常规输出，Linux 保留 standalone 输出。

验证备份恢复：在独立数据库中执行 scripts/verify-backup.cjs，脚本仅接受 DATABASE_URL 含 upgrade-verification 的测试数据库；先用 prisma db push 创建结构。禁止对真实数据库运行。

各科教材设置：账户里的教材与学习计划默认提供语文、数学、英语，支持手动添加其他科目，每科单独填写版本、学期、章节。新 AI练习、错题变式、周专项、复习提示和批改选择对应科目设置；旧通用设置作为未配置科目的后备。教材变化会使每日推荐/周报重新匹配，旧练习不改写。自定义科目也可在 AI练习中选择。这里只使用已填写的教材信息约束模型，不宣称已检索或逐页核对教材原文。

多平台完整原卷：sync-knowledge-library.ts 在原目录同步后会调用 sync-image-sources.ts，当前接入中国教育在线、高考100、中考网的4份公开整卷资料；分页逐页获取、区分题目与答案、保存到 public/knowledge-assets，并记录来源。整卷图像不冒充已逐题拆分题库，支持来源筛选、完整原卷筛选、同卷来源对照、图片放大和隐藏答案。完整学习备份包含已使用原卷的本地题图。教材面板的年级直接跟随账户表单当前年级选择，保存后供AI出题使用。

2026-10-11 家庭学习与拍照批改：左侧支持拍照/上传整张作业，逐题展示学生答案、正确答案、解题思路与批改结果，可人工校正后收录错题。新增错题的变式生成先独立复核原题答案并保存解析，再生成与校验变式；依赖题图而图缺失时不猜测。错题列表按时间或知识点章节排序，收藏与可恢复移除，已移除列表可恢复。错题与练习打印支持随机或手动选择、可选择带答案。学习身份由主账号创建和切换，年级、教材、错题、练习、拍照记录与统计分别保存；共享只复制题目/解析，不复制作答和掌握记录。拍照结果和家庭身份可备份。实际耗时取决于模型与图片，不承诺瞬时完成。
