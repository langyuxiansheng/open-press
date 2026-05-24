import type { OpenPressBinding, OpenPressFormat } from './types.js';

/**
 * 根据点路径或数组路径，从任意运行时数据对象中读取值。
 *
 * 支持的路径形式：
 *
 * - `customer.name`
 * - `items[0].name`
 * - `items.0.name`
 *
 * 空路径会直接返回原始数据对象。中间节点不存在时返回 `undefined`，
 * 不主动抛错，这样预览渲染可以容忍不完整的 mock 数据或后端返回数据。
 *
 * @param data 渲染器收到的运行时数据。
 * @param path 数据路径，支持点路径和数组下标路径。
 * @returns 解析到的值；空路径返回原始数据；缺失路径返回 `undefined`。
 */
export function getValueByPath(data: unknown, path: string): unknown {
  if (!path) return data;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cursor: any = data;
  for (const part of parts) {
    if (cursor == null) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

/**
 * 根据路径读取数组，并把非数组结果统一收敛为空数组。
 *
 * 表格、明细循环、后续分页模型都会依赖这个函数。这里不允许非数组数据
 * 继续向下游扩散，避免渲染阶段因为数据结构异常而崩溃。
 *
 * @param data 渲染器收到的运行时数据。
 * @param path 预期指向数组的路径。
 * @returns 解析到的数组；如果结果不是数组，则返回空数组。
 */
export function getArrayByPath(data: unknown, path: string): unknown[] {
  const value = getValueByPath(data, path);
  return Array.isArray(value) ? value : [];
}

/**
 * 解析一个组件或表格列的数据绑定，并返回可展示字符串。
 *
 * 这是模板 JSON 和真实业务数据之间的核心桥接点。函数会先按照绑定路径取值，
 * 如果值为空则使用 fallback，再交给 `formatValue` 做格式化。
 *
 * @param data 渲染器收到的运行时数据。
 * @param binding 组件或表格列上的可选绑定描述。
 * @returns 可直接用于 HTML/PDF 渲染的展示字符串。
 */
export function resolveBinding(data: unknown, binding?: OpenPressBinding): string {
  if (!binding) return '';
  const value = getValueByPath(data, binding.path);
  if (value == null || value === '') return binding.fallback ?? '';
  return formatValue(value, binding.format);
}

/**
 * 替换静态文本里的 `{{path}}` 占位符。
 *
 * 这里故意只实现轻量插值能力，而不是表达式引擎。条件显示、公式计算、
 * 跨字段拼接等能力后续应放进独立的安全表达式模块，避免在文本组件里
 * 承担过多业务逻辑。
 *
 * @param template 包含零个或多个 `{{path}}` 占位符的文本。
 * @param data 渲染器收到的运行时数据。
 * @returns 插值后的文本；缺失值会替换为空字符串。
 */
export function interpolateText(template: string, data: unknown): string {
  return template.replace(/\{\{\s*([\w.[\]-]+)\s*\}\}/g, (_match, path: string) => {
    const value = getValueByPath(data, path);
    return value == null ? '' : formatValue(value);
  });
}

/**
 * 把原始运行时值转换为展示字符串。
 *
 * 这个格式化函数除了处理普通基础类型，也兼容企业表单系统里常见的
 * `{ showFieldValue }` 数据形态。这样 OpenPress 可以直接接入低代码表单、
 * 动态表单和已有业务接口，不必强制调用方提前清洗所有字段。
 *
 * @param value 原始运行时值。
 * @param format 可选格式化规则。
 * @returns 应用格式化规则、前缀、后缀之后的展示字符串。
 */
export function formatValue(value: unknown, format: OpenPressFormat = {}): string {
  let text: string;
  if (format.type === 'number' || format.type === 'currency') {
    const num = Number(value);
    text = Number.isFinite(num) ? num.toFixed(format.digits ?? 2) : '';
  } else if (format.type === 'boolean') {
    text = value ? format.trueText ?? 'Yes' : format.falseText ?? 'No';
  } else if (format.type === 'date') {
    const date = value instanceof Date ? value : new Date(String(value));
    text = Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  } else if (Array.isArray(value)) {
    text = value.map((item) => formatValue(item)).join(', ');
  } else if (typeof value === 'object') {
    const maybeDisplay = value as { showFieldValue?: unknown; label?: unknown; value?: unknown };
    text = String(maybeDisplay.showFieldValue ?? maybeDisplay.label ?? maybeDisplay.value ?? '');
  } else {
    text = String(value);
  }
  return `${format.prefix ?? ''}${text}${format.suffix ?? ''}`;
}
