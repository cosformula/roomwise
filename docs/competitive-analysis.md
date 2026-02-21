# 竞品分析

## 市场概况

家居布局工具可分为三类：扫描测量工具、手动布局工具、AI 辅助布局工具。目前没有产品能做到"扫描房间 → 自动生成家具布局方案"的完整链路。

## 直接竞品

### magicplan

- 平台：iOS / Android
- 定价：免费扫描，导出付费（$9.99/月起）
- 核心功能：LiDAR 扫描生成平面图，可手动添加家具、标注、成本估算
- 优势：扫描精度高，支持多房间拼接，专业承包商常用
- 不足：家具布局完全手动，没有自动排列功能
- 用户规模：App Store 4.5 星，数百万下载

### Room Planner (Home Planner)

- 网站：homeplannerapp.com
- 平台：iOS / Android / Web
- 定价：免费基础版，Pro $6.99/月
- 核心功能：LiDAR 扫描 + 手动拖拽布局 + 20万件品牌家具模型 + AR 预览
- 优势：家具库庞大（IKEA 等品牌实物模型），扫描到购买的闭环
- 不足：布局完全手动，AI 仅用于风格推荐而非空间排布
- 差异：偏导购（家具电商入口），不解决"怎么摆"的问题

### Planner 5D

- 网站：planner5d.com
- 平台：Web / iOS / Android / macOS
- 定价：免费基础版，Premium $6.99/月
- 核心功能：2D/3D 室内设计，AI 家具放置建议，照片识别房间
- AI 功能：Smart Wizard 根据房间类型自动生成初始布局；AI Furniture Placement 考虑动线、间距、风格偏好
- 优势：目前最接近"自动布局"的消费级产品，有多方案生成
- 不足：输入依赖手动画平面图或上传照片（非 LiDAR 精确数据），AI 布局偏模板化，不理解用户现有家具
- 差异：RoomWise 用 LiDAR 扫描输入，精度更高；支持保留现有家具位置，只优化新增或重排

### RoomScan Pro LiDAR (Locometric)

- 平台：iOS
- 定价：$5.99 买断
- 核心功能：LiDAR 扫描生成精确平面图，支持多房间
- 优势：扫描质量高，专利技术，十年迭代
- 不足：纯测量工具，不做家具布局
- 差异：可作为 RoomWise 的扫描精度对标

### Live Home 3D

- 平台：iOS / macOS / Windows
- 定价：免费基础版，Pro $9.99 买断
- 核心功能：LiDAR 扫描 + 3D 室内设计 + 渲染
- 优势：功能全面，支持屋顶、楼梯等复杂结构
- 不足：专业软件定位，学习曲线陡峭，无自动布局

## AI 设计类（非直接竞品）

### MyToran

- 网站：mytoran.com
- 核心功能：上传房间照片，AI 生成风格化渲染图，支持从照片提取家具到其他房间
- 定位：AI 渲染/风格化工具，不做精确的空间布局优化
- 不足：Reddit 用户反馈 bug 多、界面粗糙、强推付费

### VisualGPT Room Planner

- 网站：visualgpt.io/room-planner
- 核心功能：上传照片，AI 生成不同风格的设计效果图
- 定位：纯视觉概念图，不输出可操作的家具坐标和尺寸

### Spacely AI / RoomGPT

- 核心功能：照片 → AI 重新风格化渲染
- 定位：概念探索（"我的房间换成北欧风会怎样"），不涉及精确空间规划

## 学术相关

| 论文 | 年份 | 方法 | 状态 |
|------|------|------|------|
| Automatic Optimization of Furniture Arrangement (SIGGRAPH) | 2011 | 约束优化 + 模拟退火 | 经典，RoomWise 的布局算法参考 |
| Automatic Generation of Constrained Furniture Layouts | 2017 | 混合整数规划 | 论文 |
| Chat2Layout: Interactive 3D Furniture Layout with Multimodal LLM | 2024 | LLM + 约束 | 论文，最接近 RoomWise Phase 2 目标 |
| LayoutGPT (Microsoft) | 2023 | LLM 生成空间布局 | 论文，CSS/3D 场景生成 |
| DiffuScene | 2024 | 扩散模型生成室内场景 | 论文 |

## RoomWise 的差异化

1. **LiDAR 精确输入**：不是照片猜测或手动画图，而是结构化 3D 数据（墙壁、门窗、现有家具的精确位置和尺寸）
2. **保留现有家具**：扫描识别已有家具，用户选择哪些固定、哪些可移动，只优化需要动的部分
3. **约束求解而非模板**：基于物理约束（不重叠、动线、门窗不堵）+ 软约束（功能关系、采光）做优化，不是套预设模板
4. **多方案比较**：模拟退火生成多个可行方案，按评分排序，用户挑选
5. **轻量 Web 端**：不需要装重型 3D 软件，浏览器里就能看 2D 布局、切换方案

## 市场机会

- 扫描工具成熟（magicplan、RoomScan），布局工具成熟（Planner 5D、Room Planner），但"扫描 → 自动布局"的桥梁没人搭好
- Planner 5D 的 AI 布局最接近，但输入精度不够（照片/手绘），且不理解用户现有家具
- 消费者痛点明确：搬家、换家具、重新布局时，"在脑子里想象摆放效果"的体验很差
- LiDAR 设备渗透率持续提升（iPhone Pro 全系标配），扫描门槛已降到零
