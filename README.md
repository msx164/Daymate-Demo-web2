# Daymate Web2 无密钥分享版

真人与数字人协同陪伴平台，包含今日任务、快速开始、AI任务草稿、双人同行、共享计时、私人复盘和搭子关系。

## 下载与安装

在 [Releases](https://github.com/msx164/Daymate-Demo-web2/releases) 下载 **Daymate-Web2-Public-1.0.0-Setup.exe**。安装完成后从桌面的“Daymate Web2 公开版”打开，无需另装Python或Node.js。仓库自动发布任务完成前，也可以下载整个源码ZIP，解压后运行“合并安装包.cmd”，组合并校验出安装程序。

安装程序未进行数字签名。当前交付完成了封装后服务的启动、注册、任务、账号隔离、双人就绪及WebSocket检查；安装向导尚未在另一台干净电脑上验证。

## 不包含任何预置密钥

安装包没有API密钥、个人账号数据库、聊天记录或浏览器配置。AI功能由使用者自行配置，其余任务与同行功能可独立使用。模型配置位于 `%LOCALAPPDATA%/DaymateWeb2Public/.sandbox/development/ai.env`：

```dotenv
DAYMATE_AI_PROVIDER=compatible
DAYMATE_AI_BASE_URL=https://your-provider.example/v1
DAYMATE_AI_API_KEY=your-own-key
DAYMATE_AI_MODEL=your-model-name
```

不要公开上述配置文件。安装包默认AI状态为未配置。

## 隔离运行

安装版仅绑定本机地址，使用端口8018和5188，数据保存在当前用户的LocalAppData/DaymateWeb2Public，不修改原Daymate。多人跨设备访问需要另行部署共同的网络服务，不是将密钥随安装包分发。

## 源码开发

源码开发版沿用端口8016/5186。安装Python 3.14与Node.js 22.12或以上版本，在独立目录执行：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-web2.txt
cd frontend
npm.cmd ci
cd ..
.\.venv\Scripts\python.exe scripts/prepare_assets.py
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Open-Daymate.ps1
```

开发版AI配置位于本项目 `.sandbox/development/ai.env`，同样自行填写。依赖、缓存与数据目录均被Git忽略。

`packaging/` 保存公开安装版的入口、启动及安装器源码。`release-parts/` 保存经过扫描的安装程序分片；GitHub Actions组合并核对SHA256后发布完整安装程序，不使用个人模型密钥。角色插画为本项目生成素材；第三方模型与运行依赖遵循各自许可证。论文中的会员、预约与长期项目方案不代表代码已经接入支付服务。
