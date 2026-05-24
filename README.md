# OpenPress

OpenPress 是一个开源的 Web 打印模板设计器与渲染引擎，目标是做一套类似 hiprint 的自定义打印能力，但把数据绑定、模板 JSON、设计器交互和渲染输出拆成更清晰的工程分层。

当前项目还处在早期版本，已经具备可运行的 Vue 设计器 playground、基础模板 schema、无框架设计器核心、HTML 打印渲染器，以及表格分页和表头重复能力。

## 目标

OpenPress 主要解决这类场景：

- 用户在 Web 页面上拖拽组件，设计一份打印模板。
- 模板保存为纯 JSON，不绑定 Vue、React 或具体业务系统。
- 运行时把真实业务数据填充进模板，生成可打印 HTML。
- 字段、表格、图片、二维码、条码等组件通过数据路径绑定真实数据。
- 表格数据过长时自动分页，并在分页后重复打印表头，降低内容截断风险。

## 当前能力

- 纯 JSON 模板结构，支持页面、组件、样式、数据绑定和示例数据。
- Vue 设计器组件，支持选中、拖拽、缩放、框选、多选对齐。
- 左侧组件和字段拖入画布，点击不会误创建组件。
- 字段组件在设计态显示 `${字段名}` 占位，真实打印时再替换为业务数据。
- 页面辅助线：页眉、页脚、页边距、装订线、中心线。
- 自动吸附、吸附线、近距离标注。
- 属性面板：基础、内容 / 数据、文字、外观、表格列配置。
- 中文默认语言包，支持后续扩展英文或业务自定义文案。
- HTML 打印渲染器，支持字段解析、文本插值、基础格式化和表格分页。
- Vue 和 React 包结构已拆分；React 适配器当前仍是基础预览形态。

## 包结构

```text
packages/
  core/             模板 schema、数据绑定、字段路径、格式化工具
  designer-core/    无框架设计器状态与编辑命令
  renderer/         模板到可打印 HTML 的渲染器
  vue/              Vue 设计器适配层
  react/            React 适配层

playgrounds/
  vue-playground/   Vue 设计器演示与交互验收页面
  react-playground/ React 演示页面

examples/
  basic-template.ts 示例销售订单模板与 mock 数据

docs/
  architecture.md   架构说明
  progress.md       完成进度与路线图
```

## 快速开始

```bash
pnpm install
pnpm build
pnpm dev:vue
```

启动 Vue playground 后，浏览器打开 Vite 输出的本地地址即可体验设计器。

## 基础渲染示例

```ts
import { createTemplate } from '@open-press/core';
import { renderTemplateToHtml } from '@open-press/renderer';

const template = createTemplate({
  title: '销售订单',
  pages: [
    {
      components: [
        {
          id: 'title',
          type: 'text',
          text: '销售订单 {{orderNo}}',
          frame: { x: 24, y: 24, width: 300, height: 32 },
          style: { fontSize: 20, fontWeight: 700 }
        },
        {
          id: 'customer',
          type: 'field',
          label: '客户：',
          binding: { path: 'customer.name', fallback: '-' },
          frame: { x: 24, y: 72, width: 220, height: 28 },
          style: { fontSize: 13 }
        }
      ]
    }
  ]
});

const html = renderTemplateToHtml(template, {
  orderNo: 'SO-001',
  customer: { name: '某知名科技企业' }
});
```

## Vue 使用示例

```ts
import { createApp, h, ref } from 'vue';
import { OpenPressDesigner } from '@open-press/vue';
import { basicTemplate } from './examples/basic-template';

const template = ref(basicTemplate);

createApp({
  setup() {
    return () =>
      h(OpenPressDesigner, {
        template: template.value,
        data: template.value.sampleData,
        locale: 'zh-CN',
        'onUpdate:template': (next) => {
          template.value = next;
        }
      });
  }
}).mount('#app');
```

## 开发命令

```bash
pnpm build                  # 构建所有 packages
pnpm typecheck              # 类型检查所有 packages
pnpm dev:vue                # 启动 Vue playground
pnpm dev:react              # 启动 React playground
pnpm --filter @open-press/vue-playground build
```

## 设计原则

- 模板必须是纯 JSON，不能保存函数、DOM、框架实例或运行时临时对象。
- `@open-press/core` 只定义数据契约和通用工具，不依赖设计器或渲染器。
- `@open-press/designer-core` 只处理编辑状态和命令，不依赖 DOM、Vue 或 React。
- Vue / React 适配层只负责把浏览器交互转换成 designer-core 命令。
- renderer 独立接收模板和数据，输出可打印 HTML，便于浏览器打印或服务端 PDF 渲染。

## 文档

- [架构文档](./docs/architecture.md)
- [完成进度](./docs/progress.md)

## 当前限制

- 二维码和条形码当前还是码值占位，尚未接入真实码图生成器。
- React 适配层还没有达到 Vue 设计器同等交互能力。
- 打印分页目前重点处理单页内一个增长表格的业务单据场景，多表格和复杂跨页规则还需要继续扩展。
- 富文本渲染还需要补充安全清洗策略。
- 暂未提供历史记录、撤销重做、复制粘贴快捷键、模板插件市场等高级能力。

## License

MIT
