# 楚河棋社云端部署

固定前端：https://tokuhochou.github.io/Web-CS/
云端服务：https://chuhe-chess.tokuhochou-chess.workers.dev/

GitHub Pages 从 main 分支的 docs/ 发布。前端通过 HTTPS JSON 接口连接 Cloudflare Worker，约每 780ms 同步一次。房间和棋局保存在 D1；无活动 24 小时后过期，无需本机在线。

- worker.mjs：规则、房间接口和备用完整页面；跨域允许 https://tokuhochou.github.io。
- schema.sql：D1 表结构。
- wrangler.jsonc：可复用的部署配置，不含密钥。
- worker.test.mjs：规则和房间流程测试，运行 node --test cloud/worker.test.mjs。

前端 docs/index.html 由 Worker 内嵌页面生成，API 指向固定 Worker 地址；邀请链接保留 /Web-CS/ 路径。

旧的本机 Socket.IO 服务保持可用，与云端房间独立。此次迁移不会转移旧房间，需要在新网址重新创建。

网络兼容入口：https://chuhe-chess-online.pages.dev/ 。该入口用同域 /api/ 请求和原 D1 数据库；GitHub 前端亦已改为连接此 Pages API。部署文件：pages/_worker.js（Cloudflare Pages advanced mode）。具体网络可达性需在访问者网络验证。

观战与席位：满员或已结束的棋局自动以观战身份进入；观战者可将任一红黑棋手移至观战，再选择空位入座。观战权限不能直接走棋、悔棋、重开或认输。换位保留棋盘，缺少棋手时暂停；棋手退出也空出席位，观战者退出不结束对局。所有房间成员离开后删除房间。旧房间 JSON 自动兼容。