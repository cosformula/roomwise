# RoomWise

扫描房间，自动布局家具。

## 背景

现有家居布局工具（Room Planner、酷家乐等）都需要用户手动拖拽家具。没有消费级产品能做到：扫描你的房间 + 你的家具 → 自动生成合理的布局方案。

学术界从 2011 年起有大量家具自动布局研究（约束优化、GAN、LLM），但没有落地成好用的产品。

Apple RoomPlan API（iOS 16+，LiDAR）把房间扫描的门槛降到了零，输出结构化的 3D 数据（墙、门、窗、家具分类和尺寸）。结合 LLM 处理模糊约束的能力，现在是做这件事的好时机。

## 产品愿景

1. **扫描房间** — RoomPlan 扫描，自动识别现有家具
2. **自动布局** — 基于约束（日照、动线、插座、用户偏好）生成多种布局方案
3. **3D/AR 预览** — 在手机上预览摆好的效果，AR 模式下投影到实际空间
4. **添加新家具** — 输入想购买的家具（尺寸 + 图片），混入现有家具重新布局
5. **购买闭环**（远期）— 接入家具品牌模型库，预览后直接下单

## 技术栈

- iOS (Swift) — RoomPlan 扫描 + RealityKit 渲染 + AR 预览
- 布局引擎 — 约束求解 / 模拟退火 / LLM 辅助（待定）
- Web（可选）— 2D 布局编辑器 + 可视化

## 开发计划

### Phase 0: 最小可玩原型（1-2 周）

目标：验证"自动布局"的体验是否有吸引力。

- [ ] RoomPlan 扫描房间，导出 CapturedRoom 为 JSON（房间多边形 + 家具列表）
- [ ] Web 端 2D 俯视图，显示房间轮廓 + 家具方块
- [ ] 用户可添加"新家具"（名称 + 长宽）
- [ ] 实现基础布局算法（硬约束：不重叠、离墙距离、动线宽度 ≥ 80cm）
- [ ] 模拟退火生成多个方案，按评分排序
- [ ] 方案切换 + 2D 预览

### Phase 1: 3D 预览 + AR

- [ ] 将布局方案转回 USDZ，在 iOS 端 3D 渲染
- [ ] AR 模式：将方案投影到实际房间
- [ ] 家具用占位几何体（带颜色分类），不追求真实模型

### Phase 2: 智能约束 + 家具模型

- [ ] LLM 理解自然语言约束（"电视对着沙发"、"书桌靠窗"）
- [ ] 接入 IKEA 3D 模型（USDZ 格式）
- [ ] 图片转 3D（TripoSR / InstantMesh）作为备选方案
- [ ] 风水 / 采光 / 通风等高级约束

### Phase 3: 商业化探索

- [ ] 家具品牌合作 + 导购分佣
- [ ] 设计师版本（专业约束 + 客户交付）

## 参考资料

- [Apple RoomPlan](https://developer.apple.com/augmented-reality/roomplan/)
- [Automatic Optimization of Furniture Arrangement (SIGGRAPH 2011)](https://web.cs.ucla.edu/~dt/papers/siggraph11/siggraph11.pdf)
- [Chat2Layout: Interactive 3D Furniture Layout with a Multimodal LLM (2024)](https://www.aimodels.fyi/papers/arxiv/chat2layout-interactive-3d-furniture-layout-multimodal-llm)
- [Automatic Generation of Constrained Furniture Layouts](https://arxiv.org/pdf/1711.10939)
