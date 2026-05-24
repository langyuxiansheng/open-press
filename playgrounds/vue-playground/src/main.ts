import { createApp, computed, defineComponent, h, ref } from 'vue';
import type { VNodeChild } from 'vue';
import { OpenPressDesigner, type OpenPressDesignerExpose } from '@open-press/vue';
import { renderTemplateToHtml } from '@open-press/renderer';
import type {
  OpenPressComponent,
  OpenPressComponentType,
  OpenPressDataField,
  OpenPressFrame,
  OpenPressPageGuides,
  OpenPressStyle,
  OpenPressTableColumn,
  OpenPressTableComponent
} from '@open-press/core';
import { basicTemplate } from '../../../examples/basic-template';
import { getPlaygroundMessages, type PlaygroundMessages } from './i18n';
import './style.css';

/**
 * 左侧组件工具栏中的组件定义。
 *
 * playground 先提供最常用的基础组件入口；真正产品化时可以把这份配置抽到组件注册表，
 * 并允许业务系统禁用某些组件、覆盖默认 schema 或添加行业组件。
 */
interface ComponentTool {
  /** 工具显示名称。 */
  label: string;
  /** 触发时创建的 OpenPress 组件类型。 */
  type: OpenPressComponentType | 'line';
}

/**
 * 属性面板支持直接编辑的 frame 字段。
 */
type FrameKey = keyof Pick<OpenPressFrame, 'x' | 'y' | 'width' | 'height' | 'rotate'>;

/**
 * Vue playground 根组件。
 *
 * 这个页面现在承担真实交互验证职责：左侧负责组件和字段来源，中间是可选中、可拖拽、
 * 可缩放的设计画布，右侧是属性面板。模板编辑仍然通过 `@open-press/designer-core`
 * 执行，playground 只负责把用户输入转换为设计器命令。
 */
const App = defineComponent({
  name: 'VuePlaygroundApp',
  setup() {
    const template = ref(basicTemplate);
    const data = ref(basicTemplate.sampleData ?? {});
    const designerRef = ref<OpenPressDesignerExpose | null>(null);
    const selectedComponents = ref<OpenPressComponent[]>([]);
    const ui = getPlaygroundMessages('zh-CN');

    /**
     * 左侧组件面板配置。
     */
    const componentItems: ComponentTool[] = [
      { label: ui.componentTools.text, type: 'text' },
      { label: ui.componentTools.field, type: 'field' },
      { label: ui.componentTools.table, type: 'table' },
      { label: ui.componentTools.image, type: 'image' },
      { label: ui.componentTools.qrCode, type: 'qrCode' },
      { label: ui.componentTools.barCode, type: 'barCode' },
      { label: ui.componentTools.line, type: 'line' }
    ];

    /**
     * 当前模板声明的数据字段目录。
     */
    const fieldItems = computed(() => flattenFields(template.value.dataSchema?.fields ?? []));

    /**
     * 属性面板当前编辑的单个组件。
     */
    const activeComponent = computed(() => selectedComponents.value[0] ?? null);

    /**
     * 把组件工具信息写入浏览器拖放数据。
     *
     * 左侧组件工具只作为拖拽源使用，点击不会创建组件，避免用户在浏览字段或误触时
     * 把元素插入画布。真正创建动作统一发生在画布 drop 事件里。
     *
     * @param event 拖拽开始事件。
     * @param item 被拖拽的组件工具。
     */
    function handleComponentDragStart(event: DragEvent, item: ComponentTool): void {
      event.dataTransfer?.setData(
        'application/x-openpress-component',
        JSON.stringify({
          type: item.type
        })
      );
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
    }

    /**
     * 把字段信息写入浏览器拖放数据。
     *
     * 字段同样只允许拖入画布创建绑定组件，点击字段只负责聚焦，不产生模板变更。
     *
     * @param event 拖拽开始事件。
     * @param field 被拖拽的字段。
     */
    function handleFieldDragStart(event: DragEvent, field: OpenPressDataField): void {
      event.dataTransfer?.setData(
        'application/x-openpress-field',
        JSON.stringify({
          path: field.path,
          label: field.label
        })
      );
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
    }

    /**
     * 处理设计器选区变化。
     *
     * @param payload Vue 设计器抛出的选区载荷。
     */
    function handleSelect(payload: { components: OpenPressComponent[] }): void {
      selectedComponents.value = payload.components;
    }

    /**
     * 模板发生变化后刷新属性面板中的组件副本。
     *
     * @param nextTemplate 最新模板。
     */
    function handleTemplateUpdate(nextTemplate: typeof basicTemplate): void {
      template.value = nextTemplate;
      const activeIds = selectedComponents.value.map((component) => component.id);
      selectedComponents.value = activeIds.length ? findComponentsByIds(nextTemplate, activeIds) : [];
    }

    /**
     * 通过属性面板更新组件 frame。
     *
     * @param component 当前组件。
     * @param key frame 字段。
     * @param value 输入框字符串值。
     */
    function updateFrame(component: OpenPressComponent, key: FrameKey, value: string): void {
      const nextValue = Number(value);
      if (!Number.isFinite(nextValue)) return;
      designerRef.value?.resizeComponent(component.id, { [key]: nextValue });
    }

    /**
     * 通过属性面板更新组件结构化样式。
     *
     * @param component 当前组件。
     * @param key 样式字段。
     * @param value 新值。
     */
    function updateStyle<Key extends keyof OpenPressStyle>(component: OpenPressComponent, key: Key, value: OpenPressStyle[Key]): void {
      designerRef.value?.updateComponent(component.id, {
        style: {
          ...(component.style ?? {}),
          [key]: value
        }
      } as Partial<OpenPressComponent>);
    }

    /**
     * 根据组件类型更新内容字段。
     *
     * @param component 当前组件。
     * @param value 输入值。
     */
    function updateMainValue(component: OpenPressComponent, value: string): void {
      if (component.type === 'text') designerRef.value?.updateComponent(component.id, { text: value } as Partial<OpenPressComponent>);
      if (component.type === 'field') {
        designerRef.value?.updateComponent(component.id, {
          binding: { ...component.binding, path: value }
        } as Partial<OpenPressComponent>);
      }
      if (component.type === 'table') designerRef.value?.updateComponent(component.id, { dataPath: value } as Partial<OpenPressComponent>);
      if (component.type === 'qrCode' || component.type === 'barCode') {
        designerRef.value?.updateComponent(component.id, { value } as Partial<OpenPressComponent>);
      }
    }

    /**
     * 更新组件通用字段。
     *
     * 名称、可见性和锁定状态属于组件元信息，和 frame/style 分开处理，方便后续把这组
     * 基础属性沉淀到真正的 SDK 属性面板里。
     *
     * @param component 当前组件。
     * @param patch 通用字段补丁。
     */
    function updateComponentBase(component: OpenPressComponent, patch: Partial<OpenPressComponent>): void {
      designerRef.value?.updateComponent(component.id, patch);
    }

    /**
     * 更新组件绑定的路径或兜底值。
     *
     * 不同组件的 binding 是否必填并不一致：字段组件必须有 binding，图片和码图可以只有
     * 静态值。这里按组件类型收窄后更新，避免属性面板直接拼接不合法结构。
     *
     * @param component 当前组件。
     * @param patch 绑定字段补丁。
     */
    function updateBinding(component: OpenPressComponent, patch: { path?: string; fallback?: string }): void {
      if (component.type === 'field') {
        designerRef.value?.updateComponent(component.id, {
          binding: { ...component.binding, ...patch }
        } as Partial<OpenPressComponent>);
      }
      if (component.type === 'image' || component.type === 'qrCode' || component.type === 'barCode' || component.type === 'richText') {
        const current = component.binding ?? { path: '' };
        designerRef.value?.updateComponent(component.id, {
          binding: { ...current, ...patch }
        } as Partial<OpenPressComponent>);
      }
    }

    /**
     * 更新表格列定义。
     *
     * 表格列是数组结构，属性面板只提交单列局部变化。这里复制整组列后替换目标列，
     * 保证模板变更仍然是不可变更新，便于 Vue 重新渲染。
     *
     * @param table 当前表格组件。
     * @param columnId 目标列 id。
     * @param patch 列字段补丁。
     */
    function updateTableColumn(table: OpenPressTableComponent, columnId: string, patch: Partial<OpenPressTableColumn>): void {
      designerRef.value?.updateComponent(table.id, {
        columns: table.columns.map((column) => (column.id === columnId ? { ...column, ...patch } : column))
      } as Partial<OpenPressComponent>);
    }

    /**
     * 更新第一页页面辅助线配置。
     *
     * @param guides 页面辅助线局部配置。
     */
    function updatePageGuides(guides: Partial<OpenPressPageGuides>): void {
      designerRef.value?.updatePageGuides(guides);
    }

    /**
     * 打开只包含模板内容的打印预览。
     *
     * 这里不能直接调用当前窗口的 `window.print()`，否则浏览器会把设计器三栏界面、
     * 工具栏和属性面板一起打印出去。正确做法是用 renderer 生成独立打印 HTML，
     * 写入新窗口，再让浏览器打印这个纯模板文档。
     */
    function openPrintPreview(): void {
      const html = renderTemplateToHtml(template.value, data.value, { title: template.value.title });
      const previewWindow = window.open('', '_blank');
      if (!previewWindow) return;
      previewWindow.document.open();
      previewWindow.document.write(html);
      previewWindow.document.close();
      previewWindow.focus();
      window.setTimeout(() => previewWindow.print(), 120);
    }

    /**
     * 渲染多选对齐工具栏。
     *
     * @returns Vue 虚拟节点。
     */
    function renderAlignmentPanel() {
      if (selectedComponents.value.length < 2) return null;
      const buttons = [
        [ui.align.left, 'left'],
        [ui.align.center, 'center'],
        [ui.align.right, 'right'],
        [ui.align.top, 'top'],
        [ui.align.middle, 'middle'],
        [ui.align.bottom, 'bottom']
      ] as const;
      return h('section', { class: 'panel-card align-panel' }, [
        h('div', { class: 'section-title' }, ui.sections.alignSelected),
        h(
          'div',
          { class: 'align-grid' },
          buttons.map(([label, value]) =>
            h('button', { class: 'tool-button compact', onClick: () => designerRef.value?.alignSelected(value) }, label)
          )
        )
      ]);
    }

    /**
     * 渲染页面辅助配置面板。
     *
     * @returns Vue 虚拟节点。
     */
    function renderPageGuidesPanel() {
      const page = template.value.pages[0];
      const guides = page.guides ?? {};
      const margins = guides.margins ?? { top: 32, right: 32, bottom: 32, left: 32 };
      const gutter = guides.gutter ?? { side: 'left' as const, size: 18 };
      return h('section', { class: 'panel-card page-guides-panel' }, [
        h('div', { class: 'section-title' }, ui.sections.pageGuides),
        h('div', { class: 'property-grid two' }, [
          renderNumberInput(ui.pageGuides.header, guides.headerHeight ?? 48, (value) => updatePageGuides({ headerHeight: toNumber(value) })),
          renderNumberInput(ui.pageGuides.footer, guides.footerHeight ?? 36, (value) => updatePageGuides({ footerHeight: toNumber(value) }))
        ]),
        h('div', { class: 'property-grid four' }, [
          renderNumberInput(ui.pageGuides.top, margins.top, (value) => updatePageGuides({ margins: { ...margins, top: toNumber(value) } })),
          renderNumberInput(ui.pageGuides.right, margins.right, (value) => updatePageGuides({ margins: { ...margins, right: toNumber(value) } })),
          renderNumberInput(ui.pageGuides.bottom, margins.bottom, (value) => updatePageGuides({ margins: { ...margins, bottom: toNumber(value) } })),
          renderNumberInput(ui.pageGuides.left, margins.left, (value) => updatePageGuides({ margins: { ...margins, left: toNumber(value) } }))
        ]),
        h('div', { class: 'property-grid two' }, [
          renderSelectInput(ui.pageGuides.gutterSide, gutter.side, ['left', 'right', 'top', 'bottom'], (value) =>
            updatePageGuides({ gutter: { ...gutter, side: value as typeof gutter.side } }), ui.optionLabels
          ),
          renderNumberInput(ui.pageGuides.gutter, gutter.size, (value) => updatePageGuides({ gutter: { ...gutter, size: toNumber(value) } }))
        ])
      ]);
    }

    /**
     * 渲染属性面板。
     *
     * @returns Vue 虚拟节点。
     */
    function renderPropertiesPanel() {
      const component = activeComponent.value;
      if (!component) {
        return h('section', { class: 'panel-card empty-properties' }, [
          h('div', { class: 'section-title' }, ui.sections.properties),
          h('p', ui.properties.empty)
        ]);
      }

      return h('section', { class: 'panel-card properties-panel' }, [
        h('div', { class: 'section-title' }, ui.sections.properties),
        h('div', { class: 'property-head' }, [
          h('div', [
            h('strong', component.name ?? componentTypeLabel(component.type, ui)),
            h('code', component.id)
          ]),
          h('div', { class: 'property-actions' }, [
            h('button', { class: 'icon-button', title: ui.properties.duplicate, onClick: () => designerRef.value?.duplicateComponent(component.id) }, 'D'),
            h('button', { class: 'icon-button danger', title: ui.properties.delete, onClick: () => designerRef.value?.removeComponent(component.id) }, 'X')
          ])
        ]),
        renderPropertyGroup(ui.properties.basic, [
          h('div', { class: 'property-grid two' }, [
            renderTextInput(ui.properties.name, component.name ?? '', (value) => updateComponentBase(component, { name: value } as Partial<OpenPressComponent>)),
            renderNumberInput(ui.properties.rotate, component.frame.rotate ?? 0, (value) => updateFrame(component, 'rotate', value))
          ]),
          h('div', { class: 'property-grid two' }, [
            renderCheckboxInput(ui.properties.visible, component.visible !== false, (value) =>
              updateComponentBase(component, { visible: value } as Partial<OpenPressComponent>)
            ),
            renderCheckboxInput(ui.properties.locked, component.locked === true, (value) =>
              updateComponentBase(component, { locked: value } as Partial<OpenPressComponent>)
            )
          ]),
          h('div', { class: 'property-grid four' }, [
            renderNumberInput(ui.properties.x, component.frame.x, (value) => updateFrame(component, 'x', value)),
            renderNumberInput(ui.properties.y, component.frame.y, (value) => updateFrame(component, 'y', value)),
            renderNumberInput(ui.properties.width, component.frame.width, (value) => updateFrame(component, 'width', value)),
            renderNumberInput(ui.properties.height, component.frame.height, (value) => updateFrame(component, 'height', value))
          ])
        ]),
        renderPropertyGroup(ui.properties.content, [renderMainValueEditor(component)]),
        renderPropertyGroup(ui.properties.textStyle, [
          h('div', { class: 'property-grid two' }, [
            renderTextInput(ui.properties.fontFamily, component.style?.fontFamily ?? '', (value) => updateStyle(component, 'fontFamily', value)),
            renderNumberInput(ui.properties.fontSize, component.style?.fontSize ?? 13, (value) => updateStyle(component, 'fontSize', toNumber(value)))
          ]),
          h('div', { class: 'property-grid two' }, [
            renderTextInput(ui.properties.fontWeight, String(component.style?.fontWeight ?? ''), (value) => updateStyle(component, 'fontWeight', value)),
            renderTextInput(ui.properties.fontStyle, component.style?.fontStyle ?? '', (value) => updateStyle(component, 'fontStyle', value))
          ]),
          h('div', { class: 'property-grid two' }, [
            renderNumberInput(ui.properties.lineHeight, Number(component.style?.lineHeight ?? 1.4), (value) => updateStyle(component, 'lineHeight', toNumber(value))),
            renderNumberInput(ui.properties.letterSpacing, component.style?.letterSpacing ?? 0, (value) =>
              updateStyle(component, 'letterSpacing', toNumber(value))
            )
          ]),
          h('div', { class: 'property-grid two' }, [
            renderSelectInput(ui.properties.align, component.style?.textAlign ?? 'left', ['left', 'center', 'right'], (value) =>
              updateStyle(component, 'textAlign', value as OpenPressStyle['textAlign']), ui.optionLabels
            ),
            renderSelectInput(ui.properties.verticalAlign, component.style?.verticalAlign ?? 'top', ['top', 'middle', 'bottom'], (value) =>
              updateStyle(component, 'verticalAlign', value as OpenPressStyle['verticalAlign']), ui.optionLabels
            )
          ]),
          h('div', { class: 'property-grid two' }, [
            renderSelectInput(ui.properties.whiteSpace, component.style?.whiteSpace ?? 'normal', ['normal', 'nowrap', 'pre-wrap'], (value) =>
              updateStyle(component, 'whiteSpace', value as OpenPressStyle['whiteSpace']), ui.optionLabels
            ),
            renderSelectInput(ui.properties.textDecoration, component.style?.textDecoration ?? 'none', ['none', 'underline', 'line-through', 'overline'], (value) =>
              updateStyle(component, 'textDecoration', value as OpenPressStyle['textDecoration']), ui.optionLabels
            )
          ])
        ]),
        renderPropertyGroup(ui.properties.appearance, [
          h('div', { class: 'property-grid two' }, [
            renderColorInput(ui.properties.color, component.style?.color ?? '#333333', (value) => updateStyle(component, 'color', value)),
            renderColorInput(ui.properties.backgroundColor, component.style?.backgroundColor ?? '#ffffff', (value) =>
              updateStyle(component, 'backgroundColor', value)
            )
          ]),
          h('div', { class: 'property-grid two' }, [
            renderNumberInput(ui.properties.padding, component.style?.padding ?? 0, (value) => updateStyle(component, 'padding', toNumber(value))),
            renderNumberInput(ui.properties.opacity, component.style?.opacity ?? 1, (value) => updateStyle(component, 'opacity', clampUnit(value)))
          ]),
          h('div', { class: 'property-grid two' }, [
            renderSelectInput(ui.properties.borderStyle, component.style?.borderStyle ?? 'none', ['none', 'solid', 'dashed', 'dotted'], (value) =>
              updateStyle(component, 'borderStyle', value as OpenPressStyle['borderStyle']), ui.optionLabels
            ),
            renderNumberInput(ui.properties.borderWidth, component.style?.borderWidth ?? 0, (value) => updateStyle(component, 'borderWidth', toNumber(value)))
          ]),
          h('div', { class: 'property-grid two' }, [
            renderColorInput(ui.properties.borderColor, component.style?.borderColor ?? '#222222', (value) => updateStyle(component, 'borderColor', value)),
            renderNumberInput(ui.properties.borderRadius, component.style?.borderRadius ?? 0, (value) => updateStyle(component, 'borderRadius', toNumber(value)))
          ])
        ]),
        component.type === 'table' ? renderTableColumnsPanel(component) : null
      ]);
    }

    /**
     * 根据组件类型渲染主要内容编辑器。
     *
     * @param component 当前组件。
     * @returns Vue 虚拟节点。
     */
    function renderMainValueEditor(component: OpenPressComponent) {
      if (component.type === 'text') {
        return renderTextInput(ui.properties.text, component.text, (value) => updateMainValue(component, value));
      }
      if (component.type === 'field') {
        return h('div', { class: 'property-stack' }, [
          renderTextInput(ui.properties.label, component.label ?? '', (value) =>
            designerRef.value?.updateComponent(component.id, { label: value } as Partial<OpenPressComponent>)
          ),
          renderTextInput(ui.properties.bindingPath, component.binding.path, (value) => updateMainValue(component, value)),
          renderTextInput(ui.properties.fallback, component.binding.fallback ?? '', (value) => updateBinding(component, { fallback: value }))
        ]);
      }
      if (component.type === 'richText') {
        return h('div', { class: 'property-stack' }, [
          renderTextInput(ui.properties.text, component.html ?? '', (value) =>
            designerRef.value?.updateComponent(component.id, { html: value } as Partial<OpenPressComponent>)
          ),
          renderTextInput(ui.properties.bindingPath, component.binding?.path ?? '', (value) => updateBinding(component, { path: value }))
        ]);
      }
      if (component.type === 'image') {
        return h('div', { class: 'property-stack' }, [
          renderTextInput(ui.properties.imageSource, component.src ?? '', (value) =>
            designerRef.value?.updateComponent(component.id, { src: value } as Partial<OpenPressComponent>)
          ),
          renderTextInput(ui.properties.bindingPath, component.binding?.path ?? '', (value) => updateBinding(component, { path: value })),
          renderSelectInput(ui.properties.imageFit, component.fit ?? 'contain', ['contain', 'cover', 'fill'], (value) =>
            designerRef.value?.updateComponent(component.id, { fit: value } as Partial<OpenPressComponent>), ui.optionLabels
          )
        ]);
      }
      if (component.type === 'line') {
        return renderSelectInput(ui.properties.lineDirection, component.direction ?? 'horizontal', ['horizontal', 'vertical'], (value) =>
          designerRef.value?.updateComponent(component.id, { direction: value } as Partial<OpenPressComponent>), ui.optionLabels
        );
      }
      if (component.type === 'table') {
        return h('div', { class: 'property-stack' }, [
          renderTextInput(ui.properties.dataPath, component.dataPath, (value) => updateMainValue(component, value)),
          renderNumberInput(ui.properties.rowHeight, component.rowHeight ?? 28, (value) =>
            designerRef.value?.updateComponent(component.id, { rowHeight: toNumber(value) } as Partial<OpenPressComponent>)
          ),
          renderCheckboxInput(ui.properties.headerVisible, component.headerVisible !== false, (value) =>
            designerRef.value?.updateComponent(component.id, { headerVisible: value } as Partial<OpenPressComponent>)
          )
        ]);
      }
      if (component.type === 'qrCode' || component.type === 'barCode') {
        return h('div', { class: 'property-stack' }, [
          renderTextInput(ui.properties.codeValue, component.value ?? '', (value) => updateMainValue(component, value)),
          renderTextInput(ui.properties.bindingPath, component.binding?.path ?? '', (value) => updateBinding(component, { path: value }))
        ]);
      }
      return null;
    }

    /**
     * 渲染表格列配置面板。
     *
     * 这部分参考 hiprint 的“列属性”思路，但只开放当前数据模型已经稳定支持的字段：
     * 标题、绑定路径、列宽和对齐。更复杂的聚合、分组、单元格函数后续应先设计安全插件机制。
     *
     * @param table 当前表格组件。
     * @returns Vue 虚拟节点。
     */
    function renderTableColumnsPanel(table: OpenPressTableComponent) {
      return renderPropertyGroup(
        ui.properties.tableColumns,
        table.columns.map((column, index) =>
          h('div', { class: 'table-column-editor' }, [
            h('div', { class: 'table-column-title' }, `${index + 1}. ${column.title}`),
            h('div', { class: 'property-grid two' }, [
              renderTextInput(ui.properties.columnTitle, column.title, (value) => updateTableColumn(table, column.id, { title: value })),
              renderTextInput(ui.properties.columnPath, column.binding?.path ?? '', (value) =>
                updateTableColumn(table, column.id, { binding: value ? { ...(column.binding ?? {}), path: value } : undefined })
              )
            ]),
            h('div', { class: 'property-grid two' }, [
              renderNumberInput(ui.properties.columnWidth, column.width ?? 120, (value) => updateTableColumn(table, column.id, { width: toNumber(value) })),
              renderSelectInput(ui.properties.columnAlign, column.align ?? 'left', ['left', 'center', 'right'], (value) =>
                updateTableColumn(table, column.id, { align: value as OpenPressTableColumn['align'] }), ui.optionLabels
              )
            ])
          ])
        )
      );
    }

    return () =>
      h('main', { class: 'shell' }, [
        h('aside', { class: 'left-panel' }, [
          h('div', { class: 'brand' }, [
            h('div', { class: 'brand-mark' }, 'OP'),
            h('div', [h('h1', 'OpenPress'), h('p', ui.brandSubtitle)])
          ]),
          h('section', { class: 'panel-section' }, [
            h('div', { class: 'section-title' }, ui.sections.components),
            h(
              'div',
              { class: 'tool-list' },
              componentItems.map((item) =>
                h(
                  'button',
                  {
                    class: 'tool-button',
                    draggable: true,
                    title: ui.dragToCanvas,
                    onDragstart: (event: DragEvent) => handleComponentDragStart(event, item)
                  },
                  item.label
                )
              )
            )
          ]),
          h('section', { class: 'panel-section' }, [
            h('div', { class: 'section-title' }, ui.sections.dataFields),
            h(
              'div',
              { class: 'field-list' },
              fieldItems.value.map((field) =>
                h(
                  'button',
                  {
                    class: 'field-pill',
                    draggable: true,
                    title: ui.dragToCanvas,
                    onDragstart: (event: DragEvent) => handleFieldDragStart(event, field)
                  },
                  [h('span', field.label), h('code', field.path)]
                )
              )
            )
          ])
        ]),
        h('section', { class: 'workspace' }, [
          h('header', { class: 'topbar' }, [
            h('div', [h('p', { class: 'eyebrow' }, ui.playgroundName), h('h2', template.value.title)]),
            h('div', { class: 'actions' }, [
              h('button', { class: 'secondary' }, ui.actions.saveDraft),
              h('button', { class: 'primary', onClick: openPrintPreview }, ui.actions.printPreview)
            ])
          ]),
          h('div', { class: 'canvas' }, [
            h(OpenPressDesigner, {
              ref: designerRef,
              template: template.value,
              data: data.value,
              locale: 'zh-CN',
              'onUpdate:template': handleTemplateUpdate,
              onSelect: handleSelect
            })
          ])
        ]),
        h('aside', { class: 'right-panel' }, [
          renderAlignmentPanel(),
          renderPropertiesPanel(),
          renderPageGuidesPanel(),
          h('section', { class: 'panel-card template-card' }, [
            h('div', { class: 'section-title' }, ui.sections.template),
            h('dl', [
              h('div', [h('dt', ui.templateInfo.page), h('dd', ui.templateInfo.pageValue)]),
              h('div', [h('dt', ui.templateInfo.components), h('dd', String(template.value.pages[0].components.length))]),
              h('div', [h('dt', ui.templateInfo.selected), h('dd', activeComponent.value ? componentTypeLabel(activeComponent.value.type, ui) : ui.templateInfo.none)])
            ])
          ]),
          h('section', { class: 'panel-card sample-card' }, [
            h('div', { class: 'section-title' }, ui.sections.sampleData),
            h('pre', JSON.stringify(data.value, null, 2))
          ])
        ])
      ]);
  }
});

/**
 * 渲染文本输入项。
 *
 * @param label 控件标签。
 * @param value 当前值。
 * @param onInput 输入变化回调。
 * @returns Vue 虚拟节点。
 */
function renderTextInput(label: string, value: string, onInput: (value: string) => void) {
  return h('label', { class: 'property-field' }, [
    h('span', label),
    h('input', {
      value,
      onInput: (event: Event) => onInput((event.target as HTMLInputElement).value)
    })
  ]);
}

/**
 * 渲染数字输入项。
 *
 * @param label 控件标签。
 * @param value 当前数值。
 * @param onInput 输入变化回调。
 * @returns Vue 虚拟节点。
 */
function renderNumberInput(label: string, value: number, onInput: (value: string) => void) {
  return h('label', { class: 'property-field' }, [
    h('span', label),
    h('input', {
      type: 'number',
      value,
      onInput: (event: Event) => onInput((event.target as HTMLInputElement).value)
    })
  ]);
}

/**
 * 渲染颜色输入项。
 *
 * 颜色字段在打印模板里非常常见，使用原生 color input 能减少非法值输入；如果当前值
 * 不是十六进制颜色，则使用兜底颜色展示，后续仍可扩展为支持 CSS 变量。
 *
 * @param label 控件标签。
 * @param value 当前颜色值。
 * @param onInput 输入变化回调。
 * @returns Vue 虚拟节点。
 */
function renderColorInput(label: string, value: string, onInput: (value: string) => void) {
  const normalized = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
  return h('label', { class: 'property-field' }, [
    h('span', label),
    h('input', {
      type: 'color',
      value: normalized,
      onInput: (event: Event) => onInput((event.target as HTMLInputElement).value)
    })
  ]);
}

/**
 * 渲染布尔开关输入项。
 *
 * 这里先使用 checkbox，后续接入组件库时可以替换为开关控件，但对模板数据结构没有影响。
 *
 * @param label 控件标签。
 * @param checked 当前是否选中。
 * @param onInput 输入变化回调。
 * @returns Vue 虚拟节点。
 */
function renderCheckboxInput(label: string, checked: boolean, onInput: (value: boolean) => void) {
  return h('label', { class: 'property-field checkbox-field' }, [
    h('input', {
      type: 'checkbox',
      checked,
      onChange: (event: Event) => onInput((event.target as HTMLInputElement).checked)
    }),
    h('span', label)
  ]);
}

/**
 * 渲染下拉选择项。
 *
 * @param label 控件标签。
 * @param value 当前值。
 * @param options 可选值列表。
 * @param onInput 选择变化回调。
 * @param optionLabels 选项值到显示文案的映射。
 * @returns Vue 虚拟节点。
 */
function renderSelectInput(
  label: string,
  value: string,
  options: string[],
  onInput: (value: string) => void,
  optionLabels: Record<string, string> = {}
) {
  return h('label', { class: 'property-field' }, [
    h('span', label),
    h(
      'select',
      {
        value,
        onChange: (event: Event) => onInput((event.target as HTMLSelectElement).value)
      },
      options.map((option) => h('option', { value: option }, optionLabels[option] ?? option))
    )
  ]);
}

/**
 * 渲染属性面板分组。
 *
 * 分组结构参考成熟打印设计器的参数组织方式，把基础几何、数据绑定、文字和外观拆开，
 * 让右侧面板在配置项变多后仍然可以快速扫描。
 *
 * @param title 分组标题。
 * @param children 分组内容。
 * @returns Vue 虚拟节点。
 */
function renderPropertyGroup(title: string, children: VNodeChild[]) {
  return h('div', { class: 'property-group' }, [h('div', { class: 'property-group-title' }, title), ...children.filter(Boolean)]);
}

/**
 * 将嵌套字段目录拍平成可直接拖拽的字段列表。
 *
 * 数组或对象本身也保留在列表里，便于后续表格绑定；子字段会用父路径拼出完整路径。
 *
 * @param fields 当前层级字段。
 * @param parentPath 父字段路径。
 * @returns 拍平后的字段列表。
 */
function flattenFields(fields: OpenPressDataField[], parentPath = ''): OpenPressDataField[] {
  return fields.flatMap((field) => {
    const path = parentPath && field.path && !field.path.includes('.') ? `${parentPath}.${field.path}` : field.path;
    const current = { ...field, path };
    const children = field.children ? flattenFields(field.children, path) : [];
    return [current, ...children];
  });
}

/**
 * 按 id 从模板中查找组件副本。
 *
 * @param template 当前模板。
 * @param ids 要查找的组件 id。
 * @returns 匹配到的组件列表。
 */
function findComponentsByIds(template: typeof basicTemplate, ids: string[]): OpenPressComponent[] {
  return template.pages.flatMap((page) => page.components).filter((component) => ids.includes(component.id));
}

/**
 * 把组件类型转换为当前语言下的显示名称。
 *
 * @param type 组件类型。
 * @param messages 当前语言包。
 * @returns 组件类型显示名。
 */
function componentTypeLabel(type: OpenPressComponent['type'], messages: PlaygroundMessages): string {
  const labels: Record<OpenPressComponent['type'], string> = {
    text: messages.componentTools.text,
    field: messages.componentTools.field,
    richText: '富文本',
    image: messages.componentTools.image,
    line: messages.componentTools.line,
    qrCode: messages.componentTools.qrCode,
    barCode: messages.componentTools.barCode,
    table: messages.componentTools.table
  };
  return labels[type] ?? type;
}

/**
 * 将输入框字符串安全转换为数字。
 *
 * @param value 输入框字符串。
 * @returns 有效数字；非法输入时返回 0。
 */
function toNumber(value: string): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

/**
 * 将输入值限制到 0 到 1。
 *
 * 透明度是 CSS 的单位区间值，属性面板直接输入时需要做边界保护，避免保存出无效模板。
 *
 * @param value 输入框字符串。
 * @returns 0 到 1 之间的数字。
 */
function clampUnit(value: string): number {
  const numberValue = toNumber(value);
  return Math.max(0, Math.min(1, numberValue));
}

createApp(App).mount('#app');
