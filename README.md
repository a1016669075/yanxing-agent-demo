# 尹Agent 网页演示

一个面向“星上大气异常事件的资源约束自适应及时反演”主题的网页演示原型。

## 本地运行

在 `D:\agent_RS\code` 下执行:

```powershell
node server.js
```

然后在浏览器打开:

```text
http://localhost:4173
```

## 分享链接

如果你想直接生成一个可以发给别人打开的公网链接，在 `D:\agent_RS\code` 下执行:

```powershell
npm run share
```

脚本会自动:

1. 启动本地网页服务
2. 创建一个临时公网访问链接
3. 在终端输出可直接发送给别人的网址
4. 自动打印 `Tunnel Password`（如果 `loca.lt` 要求填写密码）

注意:

1. 这是临时分享链接
2. 关闭当前终端窗口后，链接会失效
3. 如果访问者打开后看到 `Tunnel Password` 页面，把终端里显示的那串密码发给对方即可
4. 如果你需要长期稳定的固定网址，后续可以再部署到 Vercel、Netlify 或 GitHub Pages

## Demo 特点

1. 面向星上大气异常场景。
2. 显式建模时延、功耗、下传策略。
3. 通过小型工作流知识库做流程选择。
4. 通过执行引擎模拟工具调用和预算消耗。
5. 能演示云污染、预算超限、质量降级等修复动作。
6. 提供与固定脚本基线的结果对比。

## 文件

1. `index.html`: 页面入口
2. `styles.css`: 页面样式
3. `server.js`: 本地静态服务
4. `share.js`: 临时公网分享脚本
5. `src/scenarios.mjs`: 场景数据
6. `src/workflows.mjs`: 工作流知识库
7. `src/engine.mjs`: 智能体规划与执行逻辑
8. `src/app.mjs`: 页面交互与渲染
9. `demo_implementation_plan.md`: 实施方案文档
