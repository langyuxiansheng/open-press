# OpenPress 架构文档

本文档记录 OpenPress 当前的工程架构、包职责、数据流和后续扩展边界。它描述的是当前仓库已经落地的结构，不把未来能力写成已完成能力。

## 总体分层

OpenPress 按五层拆分：

```text
业务系统
  │
  ├─ Vue / React 适配层
  │    负责组件渲染、鼠标交互、拖放、属性面板接入
  │
  ├─ designer-core
  │    负责模板编辑状态、组件增删改、选区、多选对齐
  │
  ├─ renderer
  │    负责把模板 JSON + 真实数据渲染成可打印 HTML
  │
  └─ core
       负责模板 schema、数据绑定、字段路径、格式化和模板创建
```

核心原则是：模板数据必须保持纯 JSON。框架适配层可以很复杂，但不能把 Vue 实例、React 状态、DOM 节点或函数写进模板。

## 包职责

### `@open-press/core`

位置：`packages/core`

职责：

- 定义 OpenPress 模板类型。
- 定义页面、组件、样式、绑定、格式化、数据字段目录等结构。
- 提供 `createTemplate`、`cloneTemplate`、`assertTemplate` 等模板工具。
- 提供 `getValueByPath`、`getArrayByPath`、`resolveBinding`、`interpolateText` 等数据绑定工具。

当前组件类型：

- `text`
- `field`
- `richText`
- `image`
- `line`
- `qrCode`
- `barCode`
- `table`

### `@open-press/designer-core`

位置：`packages/designer-core`

职责：

- 持有当前模板快照和选区。
- 提供无框架编辑命令。
- 发布 `change` 和 `select` 事件。
- 保证所有模板修改都通过命令 API 发生。

核心命令包括：

- `addComponent`
- `updateComponent`
- `moveComponent`
- `resizeComponent`
- `removeComponent`
- `duplicateComponent`
- `updatePage`
- `updatePageGuides`
- `alignSelectedComponents`
- `select`
- `toggleSelection`
- `clearSelection`

这一层不应该依赖 DOM、Vue、React、浏览器事件或 CSS。

### `@open-press/renderer`

位置：`packages/renderer`

职责：

- 接收 `OpenPressTemplate` 和运行时数据。
- 输出完整 HTML 文档或 HTML 片段。
- 将组件 frame 和结构化 style 转换为打印 CSS。
- 解析字段绑定、文本插值和表格列绑定。
- 对增长表格做保守分页估算，并在分页后重复表头。

当前 renderer 重点覆盖浏览器打印和后续 PDF 服务渲染的基础链路。它不依赖 Vue 或 React。

### `@open-press/vue`

位置：`packages/vue`

职责：

- 提供 `OpenPressDesigner` Vue 组件。
- 把 pointer、drag/drop、resize、marquee selection 等浏览器交互转换为 designer-core 命令。
- 渲染设计态页面、组件、辅助线、选中框和缩放手柄。
- 提供中文默认语言包和业务覆盖入口。

当前已实现：

- 组件选中、重新选中、多选、框选。
- 拖拽移动和缩放。
- 字段和组件从左侧面板拖入画布。
- 自动吸附、辅助线、距离标注。
- 页面辅助区域：页眉、页脚、页边距、装订线。
- 暴露命令式方法给 playground 或业务属性面板。

### `@open-press/react`

位置：`packages/react`

职责：

- 提供 React 包入口和基础设计器组件。
- 当前还不是主要交互实现层。

后续 React 层应复用 `designer-core`，不要重新实现一套编辑状态。

## 模板数据流

### 设计阶段

```text
用户操作
  ↓
Vue / React 适配层
  ↓
designer-core 命令
  ↓
OpenPressTemplate JSON
  ↓
change / select 事件
  ↓
业务系统保存模板或刷新属性面板
```

设计器中的组件坐标、尺寸、样式、绑定路径都会保存到模板 JSON。运行时真实数据不会写进模板，只保存绑定规则。

### 打印阶段

```text
OpenPressTemplate JSON
  +
业务数据 data
  ↓
renderer
  ↓
可打印 HTML
  ↓
浏览器打印 / iframe 预览 / 服务端 PDF
```

字段组件在设计态显示 `${字段名}`，打印态通过 `binding.path` 从真实数据中取值。

## 页面与辅助线

页面结构包含：

- 默认纸张尺寸：`template.page`
- 单页自定义尺寸：`page.width`、`page.height`、`page.unit`
- 页面辅助配置：`page.guides`
- 页面组件列表：`page.components`

`page.guides` 当前支持：

- `margins`：页边距安全区域。
- `headerHeight`：页眉辅助区域。
- `footerHeight`：页脚辅助区域。
- `gutter`：装订线区域。

辅助线只服务设计态，不会默认打印出来。

## 数据绑定模型

组件通过 `OpenPressBinding` 绑定数据：

```ts
{
  path: 'customer.name',
  fallback: '-',
  format: { type: 'text' }
}
```

表格组件通过 `dataPath` 绑定数组：

```ts
{
  type: 'table',
  dataPath: 'items',
  columns: [
    {
      id: 'name',
      title: '商品',
      binding: { path: 'name' }
    }
  ]
}
```

路径解析当前覆盖点路径和基础数组路径。复杂表达式、函数计算、条件显示等能力应通过后续插件机制设计，不能直接把函数写进模板 JSON。

## 样式模型

OpenPress 使用结构化 style，而不是任意 CSS 字符串。

当前 `OpenPressStyle` 覆盖：

- 字体：`fontFamily`、`fontSize`、`fontWeight`、`fontStyle`
- 文本：`color`、`textAlign`、`verticalAlign`、`lineHeight`、`letterSpacing`、`textDecoration`、`whiteSpace`
- 外观：`backgroundColor`、`borderColor`、`borderWidth`、`borderStyle`、`borderRadius`、`padding`、`opacity`

这样做的原因：

- 方便序列化和版本迁移。
- 方便属性面板生成控件。
- 降低模板注入任意 CSS 的风险。
- 让不同渲染器可以按同一结构转换输出。

## 表格分页策略

当前 HTML renderer 的表格分页是保守估算：

- 根据表格 frame 高度估算可用行区域。
- 根据列宽、字号和文本长度估算每一行高度。
- 行数据超过可用高度后拆到下一页。
- 每个分页片段重复表头。
- 合计行只在最后一个分页片段显示。

这套策略适合早期业务单据验证，但不是最终的高精度排版引擎。后续如果要做到更接近浏览器实际布局，需要引入 DOM 测量、分页布局器或服务端 PDF 引擎测量。

## 扩展方向

优先级较高的扩展点：

- 二维码 / 条形码真实渲染插件。
- 表格多级表头、合并单元格、分组、固定表头和复杂页脚。
- 组件注册表，让业务系统注册自定义组件。
- 历史记录、撤销重做、快捷键。
- 更完整的 React 设计器适配层。
- 模板校验器和版本迁移器。
- 富文本安全清洗和受控 HTML 白名单。

## 约束

- 不在模板中保存函数。
- 不让 renderer 依赖前端框架。
- 不让 designer-core 依赖 DOM。
- 不在框架适配层复制核心编辑状态。
- 不把示例数据当成模板真实值保存。
