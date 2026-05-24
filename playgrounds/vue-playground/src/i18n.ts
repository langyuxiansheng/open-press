/**
 * Playground 当前支持的语言。
 *
 * Playground 是给开发和验收用的产品界面，不应该把文案硬编码在组件树里。
 * 这里先提供中文默认包和英文备用包，后续接入用户设置时只需要切换 locale。
 */
export type PlaygroundLocale = 'zh-CN' | 'en-US';

/**
 * Playground 界面文案。
 */
export interface PlaygroundMessages {
  /** 品牌副标题。 */
  brandSubtitle: string;
  /** 面板标题。 */
  sections: {
    components: string;
    dataFields: string;
    alignSelected: string;
    properties: string;
    pageGuides: string;
    template: string;
    sampleData: string;
  };
  /** 组件工具名称。 */
  componentTools: {
    text: string;
    field: string;
    table: string;
    image: string;
    qrCode: string;
    barCode: string;
    line: string;
  };
  /** 顶部操作区文案。 */
  actions: {
    saveDraft: string;
    printPreview: string;
  };
  /** 拖拽提示文案。 */
  dragToCanvas: string;
  /** 多选对齐按钮文案。 */
  align: {
    left: string;
    center: string;
    right: string;
    top: string;
    middle: string;
    bottom: string;
  };
  /** 属性面板文案。 */
  properties: {
    empty: string;
    basic: string;
    content: string;
    textStyle: string;
    appearance: string;
    tableColumns: string;
    duplicate: string;
    delete: string;
    visible: string;
    locked: string;
    x: string;
    y: string;
    width: string;
    height: string;
    rotate: string;
    name: string;
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    fontStyle: string;
    textDecoration: string;
    lineHeight: string;
    letterSpacing: string;
    color: string;
    backgroundColor: string;
    align: string;
    verticalAlign: string;
    whiteSpace: string;
    padding: string;
    borderStyle: string;
    borderWidth: string;
    borderColor: string;
    borderRadius: string;
    opacity: string;
    text: string;
    label: string;
    bindingPath: string;
    fallback: string;
    imageSource: string;
    imageFit: string;
    lineDirection: string;
    dataPath: string;
    rowHeight: string;
    headerVisible: string;
    codeValue: string;
    columnTitle: string;
    columnPath: string;
    columnWidth: string;
    columnAlign: string;
  };
  /** 页面辅助设置文案。 */
  pageGuides: {
    header: string;
    footer: string;
    top: string;
    right: string;
    bottom: string;
    left: string;
    gutterSide: string;
    gutter: string;
  };
  /** 模板信息面板文案。 */
  templateInfo: {
    page: string;
    pageValue: string;
    components: string;
    selected: string;
    none: string;
  };
  /** 对齐和装订线下拉选项文案。 */
  optionLabels: Record<string, string>;
  /** Playground 标识。 */
  playgroundName: string;
}

/**
 * Playground 内置语言包。
 */
export const playgroundLocales: Record<PlaygroundLocale, PlaygroundMessages> = {
  'zh-CN': {
    brandSubtitle: '打印模板设计器',
    sections: {
      components: '组件',
      dataFields: '数据字段',
      alignSelected: '多选对齐',
      properties: '属性',
      pageGuides: '页面辅助',
      template: '模板',
      sampleData: '示例数据'
    },
    componentTools: {
      text: '文本',
      field: '字段',
      table: '表格',
      image: '图片',
      qrCode: '二维码',
      barCode: '条码',
      line: '线条'
    },
    actions: {
      saveDraft: '保存草稿',
      printPreview: '打印预览'
    },
    dragToCanvas: '拖拽到画布',
    align: {
      left: '左对齐',
      center: '水平居中',
      right: '右对齐',
      top: '顶对齐',
      middle: '垂直居中',
      bottom: '底对齐'
    },
    properties: {
      empty: '选择画布中的元素后，可在这里编辑位置、尺寸、绑定和文本样式。',
      basic: '基础',
      content: '内容 / 数据',
      textStyle: '文字',
      appearance: '外观',
      tableColumns: '表格列',
      duplicate: '复制',
      delete: '删除',
      visible: '显示',
      locked: '锁定',
      x: 'X',
      y: 'Y',
      width: '宽',
      height: '高',
      rotate: '旋转',
      name: '名称',
      fontFamily: '字体',
      fontSize: '字号',
      fontWeight: '字重',
      fontStyle: '字形',
      textDecoration: '文本修饰',
      lineHeight: '行高',
      letterSpacing: '字间距',
      color: '颜色',
      backgroundColor: '背景',
      align: '对齐',
      verticalAlign: '垂直对齐',
      whiteSpace: '换行',
      padding: '内边距',
      borderStyle: '边框样式',
      borderWidth: '边框宽度',
      borderColor: '边框颜色',
      borderRadius: '圆角',
      opacity: '透明度',
      text: '文本',
      label: '标签',
      bindingPath: '绑定路径',
      fallback: '空值兜底',
      imageSource: '图片地址',
      imageFit: '图片缩放',
      lineDirection: '线条方向',
      dataPath: '数据路径',
      rowHeight: '行高',
      headerVisible: '显示表头',
      codeValue: '码值',
      columnTitle: '标题',
      columnPath: '字段',
      columnWidth: '列宽',
      columnAlign: '对齐'
    },
    pageGuides: {
      header: '页眉',
      footer: '页脚',
      top: '上',
      right: '右',
      bottom: '下',
      left: '左',
      gutterSide: '装订线方向',
      gutter: '装订线'
    },
    templateInfo: {
      page: '页面',
      pageValue: 'A4 纵向',
      components: '组件数',
      selected: '已选中',
      none: '无'
    },
    optionLabels: {
      left: '左',
      center: '居中',
      right: '右',
      top: '上',
      middle: '中',
      bottom: '下',
      solid: '实线',
      dashed: '虚线',
      dotted: '点线',
      none: '无',
      normal: '自动换行',
      nowrap: '不换行',
      'pre-wrap': '保留换行',
      contain: '等比',
      cover: '裁切',
      fill: '填充',
      horizontal: '横向',
      vertical: '竖向',
      italic: '斜体',
      underline: '下划线',
      'line-through': '删除线',
      overline: '上划线'
    },
    playgroundName: 'Vue 预览场'
  },
  'en-US': {
    brandSubtitle: 'Print template designer',
    sections: {
      components: 'Components',
      dataFields: 'Data fields',
      alignSelected: 'Align selected',
      properties: 'Properties',
      pageGuides: 'Page guides',
      template: 'Template',
      sampleData: 'Sample data'
    },
    componentTools: {
      text: 'Text',
      field: 'Field',
      table: 'Table',
      image: 'Image',
      qrCode: 'QR code',
      barCode: 'Bar code',
      line: 'Line'
    },
    actions: {
      saveDraft: 'Save draft',
      printPreview: 'Print preview'
    },
    dragToCanvas: 'Drag to canvas',
    align: {
      left: 'Left',
      center: 'H Center',
      right: 'Right',
      top: 'Top',
      middle: 'V Center',
      bottom: 'Bottom'
    },
    properties: {
      empty: 'Select an element on the canvas to edit position, size, binding, and text style.',
      basic: 'Basic',
      content: 'Content / Data',
      textStyle: 'Text',
      appearance: 'Appearance',
      tableColumns: 'Table columns',
      duplicate: 'Duplicate',
      delete: 'Delete',
      visible: 'Visible',
      locked: 'Locked',
      x: 'X',
      y: 'Y',
      width: 'W',
      height: 'H',
      rotate: 'Rotate',
      name: 'Name',
      fontFamily: 'Font',
      fontSize: 'Font size',
      fontWeight: 'Weight',
      fontStyle: 'Style',
      textDecoration: 'Decoration',
      lineHeight: 'Line height',
      letterSpacing: 'Letter spacing',
      color: 'Color',
      backgroundColor: 'Background',
      align: 'Align',
      verticalAlign: 'Vertical',
      whiteSpace: 'Wrap',
      padding: 'Padding',
      borderStyle: 'Border style',
      borderWidth: 'Border width',
      borderColor: 'Border color',
      borderRadius: 'Radius',
      opacity: 'Opacity',
      text: 'Text',
      label: 'Label',
      bindingPath: 'Binding path',
      fallback: 'Fallback',
      imageSource: 'Image source',
      imageFit: 'Image fit',
      lineDirection: 'Line direction',
      dataPath: 'Data path',
      rowHeight: 'Row height',
      headerVisible: 'Show header',
      codeValue: 'Code value',
      columnTitle: 'Title',
      columnPath: 'Field',
      columnWidth: 'Width',
      columnAlign: 'Align'
    },
    pageGuides: {
      header: 'Header',
      footer: 'Footer',
      top: 'Top',
      right: 'Right',
      bottom: 'Bottom',
      left: 'Left',
      gutterSide: 'Gutter side',
      gutter: 'Gutter'
    },
    templateInfo: {
      page: 'Page',
      pageValue: 'A4 portrait',
      components: 'Components',
      selected: 'Selected',
      none: 'None'
    },
    optionLabels: {
      left: 'left',
      center: 'center',
      right: 'right',
      top: 'top',
      middle: 'middle',
      bottom: 'bottom',
      solid: 'solid',
      dashed: 'dashed',
      dotted: 'dotted',
      none: 'none',
      normal: 'wrap',
      nowrap: 'nowrap',
      'pre-wrap': 'pre-wrap',
      contain: 'contain',
      cover: 'cover',
      fill: 'fill',
      horizontal: 'horizontal',
      vertical: 'vertical',
      italic: 'italic',
      underline: 'underline',
      'line-through': 'line-through',
      overline: 'overline'
    },
    playgroundName: 'Vue Playground'
  }
};

/**
 * 获取 Playground 文案。
 *
 * @param locale 目标语言。
 * @returns Playground 文案对象。
 */
export function getPlaygroundMessages(locale: PlaygroundLocale = 'zh-CN'): PlaygroundMessages {
  return playgroundLocales[locale] ?? playgroundLocales['zh-CN'];
}
