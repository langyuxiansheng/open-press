import {
  assertTemplate,
  formatValue,
  getArrayByPath,
  getValueByPath,
  interpolateText,
  resolveBinding,
  type OpenPressComponent,
  type OpenPressPage,
  type OpenPressStyle,
  type OpenPressTableComponent,
  type OpenPressTemplate
} from '@open-press/core';

/**
 * HTML 渲染输出配置。
 */
export interface RenderOptions {
  /** 输出完整 HTML 文档时使用的页面标题。 */
  title?: string;
  /**
   * 是否输出完整 HTML 壳和基础 CSS。
   *
   * 只有调用方已经自行提供兼容的 OpenPress CSS 时，才建议设置为 `false`。
   * 设计器预览通常应使用默认完整文档，并放入 iframe 中，避免打印样式和绝对定位
   * 影响宿主应用。
   */
  includeDocument?: boolean;
}

/**
 * renderer 内部用于描述分页后的页面片段。
 *
 * 模板页面和打印页面不是一回事：一个模板页面中的表格可能因为真实数据过长而拆成
 * 多个打印页面。这个结构保存拆页后的 HTML 片段和原始模板页索引。
 */
interface RenderedPage {
  /** 原始模板页索引，从 0 开始。 */
  sourcePageIndex: number;
  /** 当前打印页上的组件 HTML。 */
  componentsHtml: string;
}

/**
 * 表格分页后的单页片段。
 */
interface TableSegment {
  /** 当前片段内的行数据。 */
  rows: unknown[];
  /** 当前片段是否是该表格最后一段。 */
  isLast: boolean;
}

/**
 * 把 OpenPress 模板渲染为可打印 HTML。
 *
 * 渲染器保持无框架依赖，只接收纯模板 JSON 和运行时数据，返回完整 HTML 文档
 * 或 body 片段。完整 HTML 文档适合 iframe 预览、浏览器打印和后续服务端 PDF 渲染。
 *
 * @param template 要渲染的 OpenPress 模板。
 * @param data 用于字段绑定和文本插值的运行时数据。
 * @param options HTML 渲染配置。
 * @returns HTML 字符串。
 */
export function renderTemplateToHtml(
  template: OpenPressTemplate,
  data: unknown = {},
  options: RenderOptions = {}
): string {
  assertTemplate(template);
  const body = template.pages
    .flatMap((page, index) => paginatePage(page, index, template, data))
    .map((renderedPage, index) => {
      const page = template.pages[renderedPage.sourcePageIndex];
      const width = page.width ?? template.page.width;
      const height = page.height ?? template.page.height;
      const unit = page.unit ?? template.page.unit;
      return `<section class="op-page" data-page="${index + 1}" style="width:${width}${unit};height:${height}${unit};">${renderedPage.componentsHtml}</section>`;
    })
    .join('');

  if (options.includeDocument === false) return body;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(options.title ?? template.title)}</title>
<style>${baseCss(template)}</style>
</head>
<body>${body}</body>
</html>`;
}

/**
 * 将一个模板页转换为一个或多个打印页。
 *
 * 当前第一阶段重点处理“一个页面里有一个会增长的表格”的业务单据场景。表格会按
 * 真实数据拆分成多页，并在每个分页片段重复表头；非表格组件只出现在第一页，避免
 * 页头、基础字段在续页中重复覆盖明细区域。后续可以通过组件级 `repeatOnPage` 元数据
 * 扩展更细的续页规则。
 *
 * @param page 模板页。
 * @param pageIndex 模板页索引。
 * @param template 完整模板。
 * @param data 运行时数据。
 * @returns 一个或多个可打印页片段。
 */
function paginatePage(page: OpenPressPage, pageIndex: number, template: OpenPressTemplate, data: unknown): RenderedPage[] {
  const visibleComponents = page.components.filter((component) => component.visible !== false);
  const table = visibleComponents.find((component): component is OpenPressTableComponent => component.type === 'table');
  if (!table) {
    return [
      {
        sourcePageIndex: pageIndex,
        componentsHtml: visibleComponents.map((component) => renderComponent(component, data)).join('')
      }
    ];
  }

  const tableRows = getArrayByPath(data, table.dataPath);
  const segments = paginateTableRows(table, tableRows);
  const nonTableHtml = visibleComponents
    .filter((component) => component.id !== table.id)
    .map((component) => renderComponent(component, data))
    .join('');
  const tableStyle = componentStyle(table);

  return segments.map((segment, segmentIndex) => ({
    sourcePageIndex: pageIndex,
    componentsHtml: `${segmentIndex === 0 ? nonTableHtml : ''}${renderTable(table, segment.rows, tableStyle, tableRows, segment.isLast)}`
  }));
}

/**
 * 渲染单个组件。
 *
 * 这里按组件 `type` 做联合类型收窄，把各组件的 HTML 生成逻辑集中在同一个分发点。
 * 后续新增组件时，应优先在这里添加对应分支，再考虑是否需要独立渲染模块。
 *
 * @param component 页面上的组件 schema。
 * @param data 运行时数据。
 * @returns 当前组件的 HTML。
 */
function renderComponent(component: OpenPressComponent, data: unknown): string {
  const style = componentStyle(component);
  switch (component.type) {
    case 'text':
      return `<div class="op-comp op-text" style="${style}">${escapeHtml(interpolateText(component.text, data))}</div>`;
    case 'field': {
      const label = component.label ? `<span class="op-field-label">${escapeHtml(component.label)}</span>` : '';
      return `<div class="op-comp op-field" style="${style}">${label}<span class="op-field-value">${escapeHtml(resolveBinding(data, component.binding))}</span></div>`;
    }
    case 'richText': {
      const value = component.binding ? String(getValueByPath(data, component.binding.path) ?? '') : component.html ?? '';
      return `<div class="op-comp op-rich-text" style="${style}">${value}</div>`;
    }
    case 'image': {
      const src = component.binding ? resolveBinding(data, component.binding) : component.src ?? '';
      return `<img class="op-comp op-image" style="${style};object-fit:${component.fit ?? 'contain'};" src="${escapeAttr(src)}" alt="">`;
    }
    case 'line':
      return `<div class="op-comp op-line op-line-${component.direction ?? 'horizontal'}" style="${style}"></div>`;
    case 'qrCode':
    case 'barCode': {
      const value = component.binding ? resolveBinding(data, component.binding) : component.value ?? '';
      return `<div class="op-comp op-code" style="${style}" data-code-type="${component.type}">${escapeHtml(value)}</div>`;
    }
    case 'table':
      return renderTable(component, getArrayByPath(data, component.dataPath), style, getArrayByPath(data, component.dataPath), true);
  }
}

/**
 * 根据数组数据渲染表格组件。
 *
 * 表格在分页时会被多次调用，每次只渲染当前页片段的行。表头由每个片段重复输出，
 * 合计行只在最后一个片段输出，这样打印出来的每一页都能独立理解列含义。
 *
 * @param component 表格组件 schema。
 * @param rows 当前分页片段内的行数据。
 * @param style 由组件 frame/style 转换得到的绝对定位 CSS。
 * @param allRows 表格完整行数据，用于合计计算。
 * @param includeSummary 当前片段是否输出合计行。
 * @returns 带定位容器的表格 HTML。
 */
function renderTable(
  component: OpenPressTableComponent,
  rows: unknown[],
  style: string,
  allRows: unknown[],
  includeSummary: boolean
): string {
  const header = component.headerVisible === false ? '' : `<thead><tr>${component.columns
    .map((column) => `<th style="${column.width ? `width:${column.width}px;` : ''}text-align:${column.align ?? 'left'};">${escapeHtml(column.title)}</th>`)
    .join('')}</tr></thead>`;
  const body = rows
    .map((row) => {
      const cells = component.columns
        .map((column) => {
          const raw = column.binding ? getValueByPath(row, column.binding.path) : '';
          const value = formatValue(raw, column.format ?? column.binding?.format ?? {});
          return `<td style="height:${component.rowHeight ?? 28}px;text-align:${column.align ?? 'left'};">${escapeHtml(value)}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  const summary = includeSummary ? renderSummary(component, allRows) : '';
  return `<div class="op-comp op-table-wrap" style="${style}"><table class="op-table">${header}<tbody>${body}${summary}</tbody></table></div>`;
}

/**
 * 按表格可用高度把真实数据拆成多个分页片段。
 *
 * 浏览器打印环境很难在字符串渲染阶段得到精确 DOM 高度，所以这里使用保守估算：
 * 基于列宽、字号、字符宽度估算每行会换几行，再按表格 frame 高度切分。这样比固定
 * 行数分页更接近真实打印，能显著降低长文本导致的截断风险。
 *
 * @param component 表格组件 schema。
 * @param rows 表格完整数据行。
 * @returns 分页片段，至少返回一个片段。
 */
function paginateTableRows(component: OpenPressTableComponent, rows: unknown[]): TableSegment[] {
  if (!rows.length) return [{ rows: [], isLast: true }];
  const headerHeight = component.headerVisible === false ? 0 : 30;
  const summaryHeight = component.summary?.length ? 30 : 0;
  const bodyHeight = Math.max(component.rowHeight ?? 28, component.frame.height - headerHeight);
  const rowCosts = rows.map((row) => estimateTableRowHeight(component, row));
  const segments: unknown[][] = [];
  let currentRows: unknown[] = [];
  let currentHeight = 0;

  rows.forEach((row, index) => {
    const rowHeight = rowCosts[index];
    if (currentRows.length && currentHeight + rowHeight > bodyHeight) {
      segments.push(currentRows);
      currentRows = [];
      currentHeight = 0;
    }
    currentRows.push(row);
    currentHeight += rowHeight;
  });
  if (currentRows.length) segments.push(currentRows);

  if (segments.length) {
    let last = segments[segments.length - 1];
    let lastHeight = sumEstimatedRowsHeight(component, last);
    while (last.length > 1 && lastHeight + summaryHeight > bodyHeight) {
      const moved = last.pop();
      if (!moved) break;
      segments.push([moved]);
      last = segments[segments.length - 1];
      lastHeight = sumEstimatedRowsHeight(component, last);
    }
  }

  return segments.map((segmentRows, index) => ({
    rows: segmentRows,
    isLast: index === segments.length - 1
  }));
}

/**
 * 汇总一组表格行的估算高度。
 *
 * @param component 表格组件 schema。
 * @param rows 要汇总的行数据。
 * @returns 行高合计。
 */
function sumEstimatedRowsHeight(component: OpenPressTableComponent, rows: unknown[]): number {
  return rows.reduce<number>((sum, row) => sum + estimateTableRowHeight(component, row), 0);
}

/**
 * 估算表格单行在打印时需要的高度。
 *
 * @param component 表格组件 schema。
 * @param row 当前行数据。
 * @returns 估算行高，单位为像素。
 */
function estimateTableRowHeight(component: OpenPressTableComponent, row: unknown): number {
  const baseRowHeight = component.rowHeight ?? 28;
  const fontSize = typeof component.style?.fontSize === 'number' ? component.style.fontSize : 12;
  const lineHeight = Math.ceil(fontSize * 1.45);
  const maxLines = component.columns.reduce((lines, column) => {
    const raw = column.binding ? getValueByPath(row, column.binding.path) : '';
    const text = formatValue(raw, column.format ?? column.binding?.format ?? {});
    const width = column.width ?? Math.max(80, component.frame.width / component.columns.length);
    const estimatedCharsPerLine = Math.max(4, Math.floor(width / (fontSize * 0.62)));
    return Math.max(lines, Math.ceil(weightedTextLength(text) / estimatedCharsPerLine));
  }, 1);
  return Math.max(baseRowHeight, maxLines * lineHeight + 10);
}

/**
 * 渲染表格合计行。
 *
 * 合计规则按列 id 关联，而不是按列索引关联。这样设计器后续支持拖拽换列时，
 * 合计规则仍然能稳定跟随目标列。
 *
 * @param component 表格组件 schema。
 * @param rows 从 `component.dataPath` 解析出来的运行时行数据。
 * @returns 合计行 HTML；没有合计规则时返回空字符串。
 */
function renderSummary(component: OpenPressTableComponent, rows: unknown[]): string {
  if (!component.summary?.length) return '';
  const summaryByColumn = new Map(component.summary.map((item) => [item.columnId, item]));
  const cells = component.columns
    .map((column, index) => {
      const summary = summaryByColumn.get(column.id);
      if (!summary) return `<td>${index === 0 ? 'Total' : ''}</td>`;
      if (summary.type === 'count') return `<td>${summary.label ?? rows.length}</td>`;
      const total = rows.reduce<number>((sum, row) => {
        const value = column.binding ? Number(getValueByPath(row, column.binding.path)) : 0;
        return Number.isFinite(value) ? sum + value : sum;
      }, 0);
      return `<td>${escapeHtml(`${summary.label ?? ''}${total.toFixed(summary.digits ?? 2)}`)}</td>`;
    })
    .join('');
  return `<tr class="op-table-summary">${cells}</tr>`;
}

/**
 * 把组件几何信息和结构化样式转换为内联 CSS。
 *
 * 内联 CSS 能让渲染产物自包含，便于浏览器打印、iframe 预览和服务端 PDF 渲染。
 * 文档级公共样式则保留在 `baseCss` 中统一输出。
 *
 * @param component 组件 schema。
 * @returns CSS 声明字符串。
 */
function componentStyle(component: OpenPressComponent): string {
  const { x, y, width, height, rotate = 0 } = component.frame;
  const base = [
    'position:absolute',
    `left:${x}px`,
    `top:${y}px`,
    `width:${width}px`,
    `height:${height}px`,
    rotate ? `transform:rotate(${rotate}deg)` : ''
  ];
  return base.concat(styleToCss(component.style)).filter(Boolean).join(';');
}

/**
 * 把 OpenPress 结构化样式转换为 CSS 声明数组。
 *
 * 渲染器只输出白名单字段，避免模板直接注入任意 CSS，也让持久化 schema 更容易迁移。
 *
 * @param style 组件结构化样式。
 * @returns 不带结尾分号的 CSS 声明数组。
 */
function styleToCss(style: OpenPressStyle = {}): string[] {
  const entries: string[] = [];
  const push = (key: string, value: unknown, unit = '') => {
    if (value !== undefined && value !== null && value !== '') entries.push(`${key}:${value}${unit}`);
  };
  push('font-family', style.fontFamily);
  push('font-size', style.fontSize, typeof style.fontSize === 'number' ? 'px' : '');
  push('font-weight', style.fontWeight);
  push('font-style', style.fontStyle);
  push('text-decoration', style.textDecoration);
  push('letter-spacing', style.letterSpacing, 'px');
  push('color', style.color);
  push('background-color', style.backgroundColor);
  push('text-align', style.textAlign);
  push('vertical-align', style.verticalAlign);
  push('white-space', style.whiteSpace);
  push('border-color', style.borderColor);
  push('border-width', style.borderWidth, 'px');
  push('border-style', style.borderStyle);
  push('border-radius', style.borderRadius, 'px');
  push('line-height', style.lineHeight);
  push('padding', style.padding, 'px');
  push('opacity', style.opacity);
  return entries;
}

/**
 * 生成渲染文档的基础样式。
 *
 * 这些样式定义了页面尺寸、页面容器、绝对定位上下文、表格默认样式和基础打印规则。
 * 宿主系统后续可以提供主题扩展，但基础渲染器必须在没有外部样式时也能独立工作。
 *
 * @param template 用于推导 `@page` 尺寸的模板。
 * @returns 嵌入 HTML 文档的 CSS 字符串。
 */
function baseCss(template: OpenPressTemplate): string {
  return `
*{box-sizing:border-box}
body{margin:0;background:#f2f3f5;font-family:Arial,"Helvetica Neue",sans-serif;color:#111}
.op-page{position:relative;margin:16px auto;background:#fff;box-shadow:0 1px 8px rgba(0,0,0,.12);page-break-after:always;overflow:hidden}
.op-comp{overflow:visible}
.op-text,.op-field,.op-rich-text{white-space:normal;overflow-wrap:anywhere;line-height:1.45}
.op-field{display:flex;align-items:flex-start;gap:4px}
.op-field-label{font-weight:600}
.op-table-wrap{overflow:visible}
.op-table{width:100%;border-collapse:collapse;font-size:12px}
.op-table thead{display:table-header-group}
.op-table tr{break-inside:avoid;page-break-inside:avoid}
.op-table th,.op-table td{border:1px solid #222;padding:4px;vertical-align:top;white-space:normal;overflow-wrap:anywhere;line-height:1.45}
.op-table-summary td{font-weight:700}
.op-code{display:flex;align-items:center;justify-content:center;border:1px dashed #999;font-size:11px;color:#555}
@page{size:${template.page.width}${template.page.unit} ${template.page.height}${template.page.unit};margin:0}
@media print{body{background:#fff}.op-page{margin:0;box-shadow:none}}
`;
}

/**
 * 计算字符串的近似打印宽度权重。
 *
 * 中文、日文等全角字符按 2 个英文字符估算，英文和数字按 1 个字符估算。该函数用于
 * 在没有真实 DOM 测量的字符串渲染阶段，为表格分页提供保守行高估算。
 *
 * @param value 待估算文本。
 * @returns 加权后的字符长度。
 */
function weightedTextLength(value: string): number {
  return Array.from(value).reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
}

/**
 * 转义普通文本，避免插入 HTML 时破坏文档结构。
 *
 * @param value 原始文本。
 * @returns 可安全插入 HTML 文本节点的字符串。
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return map[char];
  });
}

/**
 * 转义 HTML 属性值。
 *
 * 这里复用 `escapeHtml`，并额外处理反引号，避免宿主系统把渲染结果嵌入模板字符串时
 * 出现属性逃逸问题。
 *
 * @param value 原始属性值。
 * @returns 可安全插入 HTML 属性的字符串。
 */
function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#096;');
}
