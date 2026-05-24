/**
 * Vue 设计器当前支持的内置语言。
 *
 * 语言包先覆盖组件默认名称、占位符和设计态提示。业务系统如果需要更完整的多语言，
 * 可以通过 `messages` prop 局部覆盖，而不必 fork 组件源码。
 */
export type OpenPressVueLocale = 'zh-CN' | 'en-US';

/**
 * Vue 设计器内部可见文案。
 */
export interface OpenPressVueMessages {
  /** 新建文本组件的默认内容。 */
  defaultText: string;
  /** 从组件工具栏拖入“字段”组件时使用的默认字段名称。 */
  defaultFieldLabel: string;
  /** 从组件工具栏拖入“字段”组件时使用的默认字段路径。 */
  defaultFieldPath: string;
  /** 默认表格列标题。 */
  tableColumns: {
    /** 名称列标题。 */
    name: string;
    /** 数量列标题。 */
    quantity: string;
    /** 单价列标题。 */
    price: string;
  };
  /** 图片为空时的设计态占位文案。 */
  imagePlaceholder: string;
  /** 图片组件默认 alt 文案。 */
  imageAlt: string;
  /** 二维码占位组件标题。 */
  qrCodeLabel: string;
  /** 条形码占位组件标题。 */
  barCodeLabel: string;
  /** 缩放手柄 title 文案前缀。 */
  resizeHandle: string;
}

/**
 * Vue 设计器内置语言包。
 */
export const openPressVueLocales: Record<OpenPressVueLocale, OpenPressVueMessages> = {
  'zh-CN': {
    defaultText: '新建文本',
    defaultFieldLabel: '客户',
    defaultFieldPath: 'customer.name',
    tableColumns: {
      name: '名称',
      quantity: '数量',
      price: '单价'
    },
    imagePlaceholder: '图片',
    imageAlt: 'OpenPress 图片',
    qrCodeLabel: '二维码',
    barCodeLabel: '条码',
    resizeHandle: '调整尺寸'
  },
  'en-US': {
    defaultText: 'New text',
    defaultFieldLabel: 'Customer',
    defaultFieldPath: 'customer.name',
    tableColumns: {
      name: 'Name',
      quantity: 'Qty',
      price: 'Price'
    },
    imagePlaceholder: 'Image',
    imageAlt: 'OpenPress image',
    qrCodeLabel: 'QR',
    barCodeLabel: 'BAR',
    resizeHandle: 'Resize'
  }
};

/**
 * 合并内置语言包和业务侧覆盖文案。
 *
 * @param locale 目标语言。
 * @param messages 业务侧局部覆盖文案。
 * @returns 完整可用的设计器文案。
 */
export function resolveOpenPressVueMessages(
  locale: OpenPressVueLocale = 'zh-CN',
  messages: Partial<OpenPressVueMessages> = {}
): OpenPressVueMessages {
  const base = openPressVueLocales[locale] ?? openPressVueLocales['zh-CN'];
  return {
    ...base,
    ...messages,
    tableColumns: {
      ...base.tableColumns,
      ...messages.tableColumns
    }
  };
}
