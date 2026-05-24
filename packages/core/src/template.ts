import type { OpenPressTemplate, OpenPressTemplateInput } from './types.js';

/**
 * OpenPress 默认纸张配置。
 *
 * 第一阶段以业务单据打印为核心场景，因此默认使用 A4 纵向尺寸，而不是
 * 偏网页布局的像素画布。后续如果支持标签、小票、连续纸，可以在模板层
 * 继续扩展纸张预设。
 */
const DEFAULT_PAGE = {
  width: 210,
  height: 297,
  unit: 'mm' as const
};

/**
 * 默认页面辅助线配置。
 *
 * 当前设计器坐标以 CSS 像素表达组件位置，因此这里使用与示例模板一致的像素值。
 * 这组默认值只影响设计态辅助线，不会直接改变最终打印内容。
 */
const DEFAULT_PAGE_GUIDES = {
  margins: { top: 32, right: 32, bottom: 32, left: 32 },
  headerHeight: 48,
  footerHeight: 36,
  gutter: { side: 'left' as const, size: 18 }
};

/**
 * 创建一个结构完整的 OpenPress 模板。
 *
 * 所有入口都应该通过这个函数生成模板，避免 Vue、React、后端服务各自
 * 拼接模板默认值。函数会统一写入 `schemaVersion: 1`，确保至少存在一页，
 * 并在缺省时补齐创建时间和更新时间。
 *
 * @param input 模板初始化数据，必须包含标题，其余字段可选。
 * @returns 结构完整的 OpenPress v1 模板。
 */
export function createTemplate(input: OpenPressTemplateInput): OpenPressTemplate {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    title: input.title,
    page: input.page ?? DEFAULT_PAGE,
    pages: input.pages?.length
      ? input.pages.map((page) => ({ guides: DEFAULT_PAGE_GUIDES, ...page }))
      : [{ guides: DEFAULT_PAGE_GUIDES, components: [] }],
    dataSchema: input.dataSchema,
    sampleData: input.sampleData,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    id: input.id
  };
}

/**
 * 深拷贝一个模板。
 *
 * OpenPress 模板必须是纯 JSON，因此这里使用 JSON 序列化作为拷贝策略。
 * 这既是实现方式，也是约束：模板中不应保存函数、DOM、框架响应式对象
 * 或其他无法稳定序列化的运行时状态。
 *
 * @param template 待拷贝的模板。
 * @returns 可独立修改的模板副本。
 */
export function cloneTemplate(template: OpenPressTemplate): OpenPressTemplate {
  return JSON.parse(JSON.stringify(template)) as OpenPressTemplate;
}

/**
 * 校验渲染器所需的最低模板条件。
 *
 * 这不是完整的 schema 校验器，只负责拦截当前渲染器一定无法处理的硬错误。
 * 后续可以单独提供 `@open-press/validator`，用于返回字段级错误、兼容性提示
 * 和模板迁移建议。
 *
 * @param template 待校验的模板。
 * @throws 当 schema 版本不支持或页面集合无效时抛出错误。
 */
export function assertTemplate(template: OpenPressTemplate): void {
  if (template.schemaVersion !== 1) {
    throw new Error(`Unsupported OpenPress template schema: ${template.schemaVersion}`);
  }
  if (!Array.isArray(template.pages)) {
    throw new Error('OpenPress template pages must be an array.');
  }
}
