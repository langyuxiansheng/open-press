/**
 * 页面尺寸使用的单位。
 *
 * OpenPress 当前支持面向打印尺寸的 `mm`，以及面向浏览器预览的 `px`。
 * 组件坐标统一保存为数字，具体单位由所在页面解释。
 */
export type OpenPressUnit = 'px' | 'mm';

/**
 * 页面上的组件矩形区域。
 *
 * 所有可定位组件都通过这个结构表达几何信息。Vue、React 以及未来其他适配层
 * 必须共享同一套坐标契约，避免每个框架各自维护一套布局模型。
 */
export interface OpenPressFrame {
  /** 距离页面左边缘的水平偏移。 */
  x: number;
  /** 距离页面上边缘的垂直偏移。 */
  y: number;
  /** 组件宽度。 */
  width: number;
  /** 组件高度。 */
  height: number;
  /** 顺时针旋转角度，单位为度。 */
  rotate?: number;
}

/**
 * 页面级安全区域边距。
 *
 * 这个结构用于描述打印模板里的“内容建议区域”，设计器会把它渲染为辅助线，
 * 并在吸附时把边距线作为可吸附目标。它本身不代表 CSS margin，也不会强制裁剪组件；
 * 是否允许组件越过边距，应由宿主产品按业务规则决定。
 */
export interface OpenPressPageMargins {
  /** 距离页面上边缘的安全距离。 */
  top: number;
  /** 距离页面右边缘的安全距离。 */
  right: number;
  /** 距离页面下边缘的安全距离。 */
  bottom: number;
  /** 距离页面左边缘的安全距离。 */
  left: number;
}

/**
 * 装订线配置。
 *
 * 装订线用于双面打印、合同装订、档案归档等场景。设计器只把它作为页面辅助区域显示，
 * 不会自动修改组件坐标；如果业务需要强制避让装订线，可以在上层保存模板前做校验。
 */
export interface OpenPressPageGutter {
  /** 装订线所在边。 */
  side: 'left' | 'right' | 'top' | 'bottom';
  /** 装订线占用的宽度或高度，单位与组件坐标一致。 */
  size: number;
}

/**
 * 页面级设计辅助配置。
 *
 * 这些配置服务于设计阶段的排版判断，例如页眉、页脚、页边距和装订线。它们可以被
 * HTML/PDF 渲染器读取用于调试水印或预检，但默认不会生成可见打印内容。
 */
export interface OpenPressPageGuides {
  /** 页面内容安全边距。 */
  margins?: OpenPressPageMargins;
  /** 页眉辅助区域高度，从页面顶部开始计算。 */
  headerHeight?: number;
  /** 页脚辅助区域高度，从页面底部向上计算。 */
  footerHeight?: number;
  /** 装订线辅助区域。 */
  gutter?: OpenPressPageGutter;
}

/**
 * 组件的结构化样式。
 *
 * 这里故意只覆盖一组保守 CSS 子集，而不是允许任意 style 字符串。结构化样式
 * 更容易序列化、迁移、校验，也能降低模板被注入任意 CSS 的风险。
 */
export interface OpenPressStyle {
  /** 文本类组件使用的字体族。 */
  fontFamily?: string;
  /** 字号；数字会按像素处理。 */
  fontSize?: number;
  /** 字重，可以是数字或 CSS 命名值。 */
  fontWeight?: number | string;
  /** 字体样式，例如 `italic`。 */
  fontStyle?: string;
  /** 文本修饰，例如下划线或删除线。 */
  textDecoration?: 'none' | 'underline' | 'line-through' | 'overline';
  /** 字符间距，单位为像素。 */
  letterSpacing?: number;
  /** 文本颜色。 */
  color?: string;
  /** 组件背景色。 */
  backgroundColor?: string;
  /** 水平文本对齐方式。 */
  textAlign?: 'left' | 'center' | 'right';
  /** 垂直对齐提示，具体实现由渲染器决定。 */
  verticalAlign?: 'top' | 'middle' | 'bottom';
  /** 文本换行策略。 */
  whiteSpace?: 'normal' | 'nowrap' | 'pre-wrap';
  /** 边框颜色。 */
  borderColor?: string;
  /** 边框宽度，单位为像素。 */
  borderWidth?: number;
  /** 边框样式。 */
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
  /** 边框圆角，单位为像素。 */
  borderRadius?: number;
  /** CSS line-height 值。 */
  lineHeight?: number | string;
  /** 统一内边距，单位为像素。 */
  padding?: number;
  /** 元素透明度，取值范围 0 到 1。 */
  opacity?: number;
}

/**
 * 组件的数据绑定描述。
 *
 * 绑定通过路径把模板组件连接到运行时数据，例如 `customer.name` 或
 * `items[0].name`。组件本身不直接保存真实业务值，只保存如何取值。
 */
export interface OpenPressBinding {
  /** 指向运行时数据的点路径或数组路径。 */
  path: string;
  /** 解析结果为空时使用的兜底文本。 */
  fallback?: string;
  /** 取值后的可选格式化规则。 */
  format?: OpenPressFormat;
}

/**
 * 字段、表格列、计算值使用的格式化规则。
 */
export interface OpenPressFormat {
  /** 格式化类型；未设置或 `text` 表示普通字符串转换。 */
  type?: 'text' | 'number' | 'date' | 'currency' | 'boolean';
  /** 数字和金额的小数位数。 */
  digits?: number;
  /** 布尔值为真时展示的文本。 */
  trueText?: string;
  /** 布尔值为假时展示的文本。 */
  falseText?: string;
  /** 格式化结果前缀。 */
  prefix?: string;
  /** 格式化结果后缀。 */
  suffix?: string;
}

/**
 * 所有组件共享的基础字段。
 *
 * 具体组件接口会继承该基础结构，并通过 `type` 字段收窄为对应组件类型。
 */
export interface OpenPressBaseComponent {
  /** 模板内稳定的组件唯一标识。 */
  id: string;
  /** 设计器里展示的人类可读名称。 */
  name?: string;
  /** 组件类型判别字段。 */
  type: OpenPressComponentType;
  /** 组件在页面上的几何区域。 */
  frame: OpenPressFrame;
  /** 组件结构化样式。 */
  style?: OpenPressStyle;
  /** 是否锁定。锁定后设计器命令不应移动该组件。 */
  locked?: boolean;
  /** 是否可见。不可见组件保留在模板里，但渲染器会跳过。 */
  visible?: boolean;
  /** 业务扩展元数据，供宿主系统保存额外信息。 */
  meta?: Record<string, unknown>;
}

/**
 * OpenPress v1 支持的组件类型。
 */
export type OpenPressComponentType =
  | 'text'
  | 'field'
  | 'richText'
  | 'image'
  | 'line'
  | 'qrCode'
  | 'barCode'
  | 'table';

/**
 * 普通文本组件，支持 `{{path}}` 形式的轻量插值。
 */
export interface OpenPressTextComponent extends OpenPressBaseComponent {
  type: 'text';
  /** 文本内容，其中的 `{{path}}` 会按运行时数据解析。 */
  text: string;
}

/**
 * 带标签的数据字段组件。
 */
export interface OpenPressFieldComponent extends OpenPressBaseComponent {
  type: 'field';
  /** 字段值前展示的静态标签。 */
  label?: string;
  /** 字段值的数据绑定。 */
  binding: OpenPressBinding;
}

/**
 * 富文本组件。
 *
 * 富文本和普通文本分开建模，是因为富文本通常需要更严格的安全策略、
 * 内容清洗和渲染限制，不能简单当作普通字符串处理。
 */
export interface OpenPressRichTextComponent extends OpenPressBaseComponent {
  type: 'richText';
  /** 静态 HTML 内容。 */
  html?: string;
  /** 可选的 HTML 内容数据绑定。 */
  binding?: OpenPressBinding;
}

/**
 * 图片组件，支持静态图片地址或运行时数据绑定。
 */
export interface OpenPressImageComponent extends OpenPressBaseComponent {
  type: 'image';
  /** 静态图片 URL 或 data URL。 */
  src?: string;
  /** 图片地址的数据绑定。 */
  binding?: OpenPressBinding;
  /** HTML 渲染器使用的 object-fit 策略。 */
  fit?: 'contain' | 'cover' | 'fill';
}

/**
 * 简单横线或竖线组件。
 */
export interface OpenPressLineComponent extends OpenPressBaseComponent {
  type: 'line';
  /** 线条方向，默认横向。 */
  direction?: 'horizontal' | 'vertical';
}

/**
 * 二维码或条形码占位组件。
 *
 * 第一阶段 HTML 渲染器只展示码值占位。后续可以在 renderer 内接入真实二维码、
 * 条码生成器，或让宿主系统提供渲染插件。
 */
export interface OpenPressCodeComponent extends OpenPressBaseComponent {
  type: 'qrCode' | 'barCode';
  /** 静态码值。 */
  value?: string;
  /** 码值的数据绑定。 */
  binding?: OpenPressBinding;
}

/**
 * 表格列定义。
 */
export interface OpenPressTableColumn {
  /** 稳定列标识，用于合计规则和设计器操作。 */
  id: string;
  /** 表头标题。 */
  title: string;
  /** 每一行数据对象上的取值绑定。 */
  binding?: OpenPressBinding;
  /** 列宽，单位为像素。 */
  width?: number;
  /** 单元格水平对齐方式。 */
  align?: 'left' | 'center' | 'right';
  /** 列级格式化规则，会覆盖 binding 上的格式化规则。 */
  format?: OpenPressFormat;
}

/**
 * 数据驱动表格组件。
 */
export interface OpenPressTableComponent extends OpenPressBaseComponent {
  type: 'table';
  /** 指向运行时数组数据的路径，例如 `items`。 */
  dataPath: string;
  /** 有序列定义。 */
  columns: OpenPressTableColumn[];
  /** 是否渲染表头，默认渲染。 */
  headerVisible?: boolean;
  /** 表体行高，单位为像素。 */
  rowHeight?: number;
  /** 可选合计行定义。 */
  summary?: OpenPressTableSummary[];
}

/**
 * 表格合计规则。
 */
export interface OpenPressTableSummary {
  /** 接收合计值的列 id。 */
  columnId: string;
  /** 合计单元格中展示的标签或前缀。 */
  label?: string;
  /** 合计计算类型。 */
  type: 'sum' | 'count';
  /** `sum` 类型使用的小数位数。 */
  digits?: number;
}

/**
 * OpenPress v1 支持的所有组件 schema 联合类型。
 */
export type OpenPressComponent =
  | OpenPressTextComponent
  | OpenPressFieldComponent
  | OpenPressRichTextComponent
  | OpenPressImageComponent
  | OpenPressLineComponent
  | OpenPressCodeComponent
  | OpenPressTableComponent;

/**
 * 可打印页面。
 */
export interface OpenPressPage {
  /** 多页模板中的可选页面标识。 */
  id?: string;
  /** 页面自定义宽度；未设置时使用模板默认页面宽度。 */
  width?: number;
  /** 页面自定义高度；未设置时使用模板默认页面高度。 */
  height?: number;
  /** 页面自定义单位；未设置时使用模板默认页面单位。 */
  unit?: OpenPressUnit;
  /** 页面级设计辅助线配置，例如页边距、页眉页脚和装订线。 */
  guides?: OpenPressPageGuides;
  /** 放置在当前页面上的组件。 */
  components: OpenPressComponent[];
}

/**
 * OpenPress 模板根对象。
 *
 * 模板必须是纯 JSON。不要在模板里保存框架对象、函数、DOM 节点或运行时临时状态。
 * 这样同一份模板才能在浏览器、Node 渲染服务、Vue/React 设计器之间稳定流转。
 */
export interface OpenPressTemplate {
  /** schema 版本，用于后续模板迁移。 */
  schemaVersion: 1;
  /** 后端、仓库或宿主系统中的模板 id。 */
  id?: string;
  /** 模板标题。 */
  title: string;
  /** 所有页面的默认纸张配置。 */
  page: {
    width: number;
    height: number;
    unit: OpenPressUnit;
  };
  /** 页面列表，顺序即打印顺序。 */
  pages: OpenPressPage[];
  /** 设计器可展示的数据字段目录。 */
  dataSchema?: OpenPressDataSchema;
  /** 预览时使用的示例数据。 */
  sampleData?: unknown;
  /** 模板创建时间，ISO 字符串。 */
  createdAt?: string;
  /** 模板最近更新时间，ISO 字符串。 */
  updatedAt?: string;
}

/**
 * 提供给模板设计器的数据字段目录。
 */
export interface OpenPressDataSchema {
  /** 顶层字段或字段分组。 */
  fields: OpenPressDataField[];
}

/**
 * 数据字段目录中的单个字段或嵌套字段分组。
 */
export interface OpenPressDataField {
  /** 可用于绑定的数据路径。 */
  path: string;
  /** 展示给用户看的字段名称。 */
  label: string;
  /** 字段类型提示，用于设计器选择控件和格式化策略。 */
  type?: 'string' | 'number' | 'date' | 'boolean' | 'array' | 'object' | 'image' | 'richText';
  /** 对象或数组字段下的子字段。 */
  children?: OpenPressDataField[];
}

/**
 * `createTemplate` 接收的模板输入。`schemaVersion` 由 core 统一写入。
 */
export type OpenPressTemplateInput = Partial<Omit<OpenPressTemplate, 'schemaVersion'>> &
  Pick<OpenPressTemplate, 'title'>;
