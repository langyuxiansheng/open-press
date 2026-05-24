import {
  formatValue,
  getArrayByPath,
  getValueByPath,
  interpolateText,
  resolveBinding,
  type OpenPressCodeComponent,
  type OpenPressComponent,
  type OpenPressFieldComponent,
  type OpenPressFrame,
  type OpenPressImageComponent,
  type OpenPressLineComponent,
  type OpenPressPage,
  type OpenPressPageGuides,
  type OpenPressRichTextComponent,
  type OpenPressStyle,
  type OpenPressTableComponent,
  type OpenPressTemplate,
  type OpenPressTextComponent
} from '@open-press/core';
import {
  createOpenPressDesigner,
  type DesignerSnapshot,
  type OpenPressAlignment,
  type OpenPressDesigner as HeadlessDesigner
} from '@open-press/designer-core';
import { computed, defineComponent, h, onBeforeUnmount, ref, shallowRef, watch, type CSSProperties, type PropType, type VNode } from 'vue';
import { resolveOpenPressVueMessages, type OpenPressVueLocale, type OpenPressVueMessages } from './i18n.js';

/**
 * Vue 设计器向宿主暴露的组件选区信息。
 *
 * 宿主属性面板不直接读取适配器内部状态，而是通过这个事件载荷拿到稳定的
 * `selectedIds` 和组件副本。这样后续增加多选、组合、锁定等能力时，事件结构仍然
 * 可以继续演进，不需要把 DOM 状态暴露给外部。
 */
export interface OpenPressVueSelectPayload {
  /** 当前选中的组件 id，顺序与用户选择顺序一致。 */
  selectedIds: string[];
  /** 当前选中的组件副本，适合属性面板读取。 */
  components: OpenPressComponent[];
}

/**
 * 可由外部工具栏拖入画布的数据字段描述。
 *
 * Playground、业务系统字段树、低代码表单字段面板都可以把字段序列化成这个结构后
 * 写入 `dataTransfer`，Vue 设计器在 drop 时会把它转换成标准 `field` 组件。
 */
export interface OpenPressDroppedField {
  /** 绑定到运行时数据的路径。 */
  path: string;
  /** 字段在人机界面中的展示名称。 */
  label: string;
}

/**
 * 可从组件工具栏拖入画布的组件类型描述。
 *
 * 组件拖入只保存“要创建什么类型”，真正的默认 schema 由设计器适配层统一生成，
 * 这样宿主工具栏不会散落一堆重复的默认组件结构。
 */
export interface OpenPressDroppedComponent {
  /** 要创建的组件类型。 */
  type: OpenPressComponent['type'] | 'line';
}

/**
 * 属性面板或外部工具栏可以调用的 Vue 设计器公开方法。
 *
 * 这些方法只是薄封装，真正的模板变更仍然进入 `@open-press/designer-core`。
 * 这样 Vue playground 和后续 React 适配层可以共享同一套命令语义。
 */
export interface OpenPressDesignerExpose {
  /** 在第一页添加普通文本组件。 */
  addText(point?: Partial<Pick<OpenPressFrame, 'x' | 'y'>>): void;
  /** 在第一页添加数据字段组件。 */
  addField(field: OpenPressDroppedField, point?: Partial<Pick<OpenPressFrame, 'x' | 'y'>>): void;
  /** 在第一页添加表格组件。 */
  addTable(point?: Partial<Pick<OpenPressFrame, 'x' | 'y'>>): void;
  /** 在第一页添加图片占位组件。 */
  addImage(point?: Partial<Pick<OpenPressFrame, 'x' | 'y'>>): void;
  /** 在第一页添加二维码或条码占位组件。 */
  addCode(type: OpenPressCodeComponent['type'], point?: Partial<Pick<OpenPressFrame, 'x' | 'y'>>): void;
  /** 在第一页添加线条组件。 */
  addLine(point?: Partial<Pick<OpenPressFrame, 'x' | 'y'>>): void;
  /** 按 id 更新组件。 */
  updateComponent(id: string, patch: Partial<OpenPressComponent>): void;
  /** 按 id 更新组件位置或尺寸。 */
  resizeComponent(id: string, frame: Partial<OpenPressFrame>): void;
  /** 删除指定组件。 */
  removeComponent(id: string): void;
  /** 复制指定组件。 */
  duplicateComponent(id: string): void;
  /** 对齐当前选中的多个组件。 */
  alignSelected(alignment: OpenPressAlignment): void;
  /** 更新第一页页面辅助线配置。 */
  updatePageGuides(guides: Partial<OpenPressPageGuides>): void;
  /** 清空当前选区。 */
  clearSelection(): void;
}

/**
 * 拖拽或缩放过程中的临时交互状态。
 *
 * 这类状态不写入模板 JSON，因为它只在一次 pointer 操作期间存在。模板只保存最终的
 * frame 值，避免把鼠标坐标、起始点等 UI 细节污染可持久化数据。
 */
interface ActivePointerAction {
  /** 当前操作类型。 */
  type: 'move' | 'resize';
  /** 本次操作涉及的组件 id。移动多选时会包含整个选区。 */
  componentIds: string[];
  /** 缩放时的主组件 id；移动时表示指针按下的组件。 */
  primaryId: string;
  /** pointerdown 时的客户端 X 坐标。 */
  startX: number;
  /** pointerdown 时的客户端 Y 坐标。 */
  startY: number;
  /** pointerdown 时每个参与组件的原始 frame。 */
  startFrames: Record<string, OpenPressFrame>;
  /** pointerdown 时本次操作的整体外接矩形。 */
  startBounds: OpenPressFrame;
  /** 缩放方向；移动操作不需要该字段。 */
  handle?: ResizeHandle;
}

/**
 * 鼠标框选过程中的临时状态。
 *
 * 框选只影响设计器选区，不写入模板 JSON。`baseSelectedIds` 用于 Shift 框选时保留
 * 之前的选区，并把新框中的组件追加进去。
 */
interface MarqueeSelection {
  /** pointerdown 时的页面坐标。 */
  start: Pick<OpenPressFrame, 'x' | 'y'>;
  /** 当前 pointer 所在的页面坐标。 */
  current: Pick<OpenPressFrame, 'x' | 'y'>;
  /** pointerdown 前已经选中的组件 id。 */
  baseSelectedIds: string[];
  /** 是否按住 Shift 进行追加选择。 */
  additive: boolean;
  /** 是否已经移动到足以显示框选矩形。 */
  active: boolean;
}

/**
 * 设计态可见辅助线。
 *
 * 页面辅助线和吸附辅助线都复用这个结构。`orientation` 决定使用 x 还是 y 坐标，
 * `kind` 决定视觉样式。
 */
interface VisibleGuide {
  /** 辅助线方向。 */
  orientation: 'vertical' | 'horizontal';
  /** 辅助线在页面坐标中的位置。 */
  position: number;
  /** 辅助线类型。 */
  kind: 'page' | 'snap';
}

/**
 * 设计态距离标注。
 *
 * 距离标注用于显示拖拽对象到最近页面辅助线或组件边缘之间的间距。它和吸附线一起
 * 出现，帮助用户判断当前排版间距，而不是只能靠肉眼估计。
 */
interface DistanceGuide {
  /** 标注方向。 */
  orientation: 'horizontal' | 'vertical';
  /** 线段起点坐标。水平线使用 x，垂直线使用 y。 */
  start: number;
  /** 线段终点坐标。水平线使用 x，垂直线使用 y。 */
  end: number;
  /** 线段所在的交叉轴坐标。水平线使用 y，垂直线使用 x。 */
  cross: number;
  /** 展示给用户看的距离文本。 */
  label: string;
}

/**
 * 组件缩放手柄方向。
 *
 * 方向字符串直接表达参与变化的边，例如 `se` 表示右下角，同时修改宽度和高度。
 */
type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

/**
 * OpenPress 的 Vue 设计器适配组件。
 *
 * 这个组件提供真实的浏览器交互层：选中框、拖拽移动、缩放手柄、字段拖入绑定和组件
 * 基础渲染。它不承担业务状态管理，所有模板变更都通过无头 `OpenPressDesigner`
 * 执行，再以 `v-model:template` 和事件回传给宿主应用。
 */
export default defineComponent({
  name: 'OpenPressDesigner',
  props: {
    /** 当前正在编辑的模板 JSON。 */
    template: {
      type: Object as PropType<OpenPressTemplate>,
      required: true
    },
    /** 用于在画布上实时展示字段绑定结果的运行时数据。 */
    data: {
      type: Object,
      default: () => ({})
    },
    /** 设计器内置文案语言，默认中文。 */
    locale: {
      type: String as PropType<OpenPressVueLocale>,
      default: 'zh-CN'
    },
    /** 业务侧局部覆盖文案。 */
    messages: {
      type: Object as PropType<Partial<OpenPressVueMessages>>,
      default: () => ({})
    }
  },
  emits: ['update:template', 'change', 'select'],
  setup(props, { emit, expose }) {
    /** 无头设计器实例不需要 Vue 深度代理，使用 `shallowRef` 可以避免 class 实例被包装。 */
    const designer = shallowRef<HeadlessDesigner>(createOpenPressDesigner({ template: props.template }));
    /** 适配层渲染用快照。快照始终来自 designer-core，避免出现两份模板状态。 */
    const snapshot = ref<DesignerSnapshot>(designer.value.getSnapshot());
    /** 画布 DOM 节点，用于把浏览器坐标换算成页面坐标。 */
    const pageRef = ref<HTMLElement | null>(null);
    /** 当前 pointer 操作；为 null 表示没有拖拽或缩放正在发生。 */
    const activeAction = ref<ActivePointerAction | null>(null);
    /** 当前正在显示的动态吸附线。 */
    const snapGuides = ref<VisibleGuide[]>([]);
    /** 当前正在显示的距离标注。 */
    const distanceGuides = ref<DistanceGuide[]>([]);
    /** 当前框选状态；为 null 表示没有框选操作。 */
    const marqueeSelection = ref<MarqueeSelection | null>(null);
    /** 当前语言下的设计器文案。 */
    const ui = computed(() => resolveOpenPressVueMessages(props.locale, props.messages));
    /** 最近一次由本组件向外 emit 的模板对象，用于避免受控 prop 回流时重复 setTemplate。 */
    let lastEmittedTemplate: OpenPressTemplate | null = null;

    /**
     * 订阅模板变化，把无头设计器快照同步给宿主。
     */
    const stopChange = designer.value.on('change', (nextSnapshot) => {
      snapshot.value = nextSnapshot;
      lastEmittedTemplate = nextSnapshot.template;
      emit('update:template', nextSnapshot.template);
      emit('change', nextSnapshot);
    });

    /**
     * 订阅选区变化，让宿主属性面板可以跟随当前选中组件刷新。
     */
    const stopSelect = designer.value.on('select', (selectedIds) => {
      snapshot.value = designer.value.getSnapshot();
      emit('select', {
        selectedIds,
        components: designer.value.getSelectedComponents()
      } satisfies OpenPressVueSelectPayload);
    });

    /**
     * 外部受控模板被替换时，同步进 designer-core。
     *
     * 如果变更来源就是当前组件刚刚 emit 的模板，则跳过同步，避免清空选区或产生重复
     * change 事件。业务系统从远端加载新模板时会传入新的对象引用，这里仍会正确接收。
     */
    watch(
      () => props.template,
      (template) => {
        if (template === lastEmittedTemplate) {
          lastEmittedTemplate = null;
          return;
        }
        designer.value.setTemplate(template);
        snapshot.value = designer.value.getSnapshot();
      }
    );

    onBeforeUnmount(() => {
      stopChange();
      stopSelect();
      removeWindowPointerListeners();
      removeWindowMarqueeListeners();
      window.removeEventListener('blur', handleWindowInteractionCancel);
    });

    /**
     * 暴露给 playground 和业务属性面板的命令式方法。
     */
    expose({
      addText,
      addField,
      addTable,
      addImage,
      addCode,
      addLine,
      updateComponent,
      resizeComponent,
      removeComponent,
      duplicateComponent,
      alignSelected: (alignment: OpenPressAlignment) => designer.value.alignSelectedComponents(alignment),
      updatePageGuides: (guides: Partial<OpenPressPageGuides>) => designer.value.updatePageGuides(0, guides),
      clearSelection: () => designer.value.clearSelection()
    } satisfies OpenPressDesignerExpose);

    /**
     * 添加一个默认文本组件。
     *
     * @param point 可选页面坐标；缺失时使用默认位置。
     */
    function addText(point: Partial<Pick<OpenPressFrame, 'x' | 'y'>> = {}): void {
      designer.value.addComponent({
        id: createComponentId('text'),
        type: 'text',
        text: ui.value.defaultText,
        frame: { x: round(point.x ?? 48), y: round(point.y ?? 48), width: 180, height: 30 },
        style: { fontSize: 14, fontWeight: 600, color: '#333333' }
      });
    }

    /**
     * 根据字段定义添加一个绑定字段组件。
     *
     * @param field 被拖入或点击添加的数据字段。
     * @param point 可选页面坐标；缺失时使用默认位置。
     */
    function addField(field: OpenPressDroppedField, point: Partial<Pick<OpenPressFrame, 'x' | 'y'>> = {}): void {
      const placeholderWidth = estimateFieldWidth(field.label, 13);
      designer.value.addComponent({
        id: createComponentId('field'),
        type: 'field',
        label: `${field.label}:`,
        binding: { path: field.path, fallback: '-' },
        frame: {
          x: round(point.x ?? 48),
          y: round(point.y ?? 92),
          width: placeholderWidth,
          height: 30
        },
        style: { fontSize: 13, color: '#333333' }
      });
    }

    /**
     * 添加一个默认明细表格组件。
     *
     * @param point 可选页面坐标；缺失时使用默认位置。
     */
    function addTable(point: Partial<Pick<OpenPressFrame, 'x' | 'y'>> = {}): void {
      designer.value.addComponent({
        id: createComponentId('table'),
        type: 'table',
        dataPath: 'items',
        frame: { x: round(point.x ?? 48), y: round(point.y ?? 140), width: 520, height: 220 },
        headerVisible: true,
        rowHeight: 30,
        columns: [
          { id: createComponentId('col'), title: ui.value.tableColumns.name, binding: { path: 'name' }, width: 240 },
          { id: createComponentId('col'), title: ui.value.tableColumns.quantity, binding: { path: 'qty' }, width: 80, align: 'right' },
          { id: createComponentId('col'), title: ui.value.tableColumns.price, binding: { path: 'price' }, width: 120, align: 'right' }
        ]
      });
    }

    /**
     * 添加一个图片占位组件。
     *
     * @param point 可选页面坐标；缺失时使用默认位置。
     */
    function addImage(point: Partial<Pick<OpenPressFrame, 'x' | 'y'>> = {}): void {
      designer.value.addComponent({
        id: createComponentId('image'),
        type: 'image',
        frame: { x: round(point.x ?? 48), y: round(point.y ?? 48), width: 140, height: 96 },
        fit: 'contain',
        style: { borderColor: '#d4d0c8', borderWidth: 1, borderStyle: 'dashed' }
      });
    }

    /**
     * 添加一个码图占位组件。
     *
     * @param type 二维码或条形码类型。
     * @param point 可选页面坐标；缺失时使用默认位置。
     */
    function addCode(type: OpenPressCodeComponent['type'], point: Partial<Pick<OpenPressFrame, 'x' | 'y'>> = {}): void {
      designer.value.addComponent({
        id: createComponentId(type),
        type,
        value: type === 'qrCode' ? 'https://openpress.local' : 'OPENPRESS-001',
        frame: {
          x: round(point.x ?? 48),
          y: round(point.y ?? 48),
          width: type === 'qrCode' ? 110 : 180,
          height: type === 'qrCode' ? 110 : 64
        },
        style: { borderColor: '#d4d0c8', borderWidth: 1, borderStyle: 'solid' }
      });
    }

    /**
     * 添加一条默认横线。
     *
     * @param point 可选页面坐标；缺失时使用默认位置。
     */
    function addLine(point: Partial<Pick<OpenPressFrame, 'x' | 'y'>> = {}): void {
      designer.value.addComponent({
        id: createComponentId('line'),
        type: 'line',
        direction: 'horizontal',
        frame: { x: round(point.x ?? 48), y: round(point.y ?? 48), width: 220, height: 1 },
        style: { borderColor: '#333333', borderWidth: 1, borderStyle: 'solid' }
      });
    }

    /**
     * 透传组件更新命令。
     *
     * @param id 组件 id。
     * @param patch 要应用到组件的局部补丁。
     */
    function updateComponent(id: string, patch: Partial<OpenPressComponent>): void {
      designer.value.updateComponent(id, patch);
    }

    /**
     * 透传 frame 更新命令。
     *
     * @param id 组件 id。
     * @param frame 要更新的坐标或尺寸。
     */
    function resizeComponent(id: string, frame: Partial<OpenPressFrame>): void {
      designer.value.resizeComponent(id, frame);
    }

    /**
     * 删除组件。
     *
     * @param id 组件 id。
     */
    function removeComponent(id: string): void {
      designer.value.removeComponent(id);
    }

    /**
     * 复制组件并生成新的前端临时 id。
     *
     * @param id 被复制的组件 id。
     */
    function duplicateComponent(id: string): void {
      designer.value.duplicateComponent(id, createComponentId('copy'));
    }

    /**
     * 根据拖入的组件类型在指定坐标创建组件。
     *
     * @param component 从工具栏拖入的组件描述。
     * @param point drop 发生时的页面坐标。
     */
    function addDroppedComponent(component: OpenPressDroppedComponent, point: Partial<Pick<OpenPressFrame, 'x' | 'y'>>): void {
      if (component.type === 'text') addText(point);
      if (component.type === 'field') addField({ path: ui.value.defaultFieldPath, label: ui.value.defaultFieldLabel }, point);
      if (component.type === 'table') addTable(point);
      if (component.type === 'image') addImage(point);
      if (component.type === 'qrCode' || component.type === 'barCode') addCode(component.type, point);
      if (component.type === 'line') addLine(point);
    }

    /**
     * 组件 pointerdown 入口，用于开始移动组件。
     *
     * @param event 浏览器 pointer 事件。
     * @param component 被操作组件。
     */
    function startMove(event: PointerEvent, component: OpenPressComponent): void {
      if (event.button !== 0) return;
      if (component.locked) return;
      event.preventDefault();
      event.stopPropagation();
      const selectedIds = snapshot.value.selectedIds;
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        designer.value.toggleSelection(component.id);
      } else if (selectedIds.includes(component.id)) {
        // 即使 id 没变化也重新派发选区，保证外层属性面板在模板更新后可被点击重新同步。
        designer.value.select(selectedIds);
      } else {
        designer.value.select([component.id]);
      }
      const actionIds = designer.value.getSnapshot().selectedIds.includes(component.id)
        ? designer.value.getSnapshot().selectedIds
        : [component.id];
      const startFrames = getFramesByIds(actionIds);
      beginPointerAction({
        type: 'move',
        componentIds: actionIds,
        primaryId: component.id,
        startX: event.clientX,
        startY: event.clientY,
        startFrames,
        startBounds: getBounds(Object.values(startFrames))
      });
    }

    /**
     * 缩放手柄 pointerdown 入口。
     *
     * @param event 浏览器 pointer 事件。
     * @param component 被操作组件。
     * @param handle 当前缩放手柄方向。
     */
    function startResize(event: PointerEvent, component: OpenPressComponent, handle: ResizeHandle): void {
      if (event.button !== 0) return;
      if (component.locked) return;
      event.preventDefault();
      event.stopPropagation();
      designer.value.select([component.id]);
      beginPointerAction({
        type: 'resize',
        componentIds: [component.id],
        primaryId: component.id,
        startX: event.clientX,
        startY: event.clientY,
        startFrames: { [component.id]: { ...component.frame } },
        startBounds: { ...component.frame },
        handle
      });
    }

    /**
     * 保存 pointer 操作状态，并注册全局监听。
     *
     * 监听注册在 window 上，是为了用户拖出组件边界后仍能继续移动或缩放，交互体验
     * 与 Figma、表单设计器等常见工具保持一致。
     *
     * @param action 本次 pointer 操作的起始状态。
     */
    function beginPointerAction(action: ActivePointerAction): void {
      activeAction.value = action;
      window.addEventListener('pointermove', handleWindowPointerMove);
      window.addEventListener('pointerup', handleWindowPointerUp);
      window.addEventListener('pointercancel', handleWindowInteractionCancel);
      window.addEventListener('blur', handleWindowInteractionCancel);
    }

    /**
     * pointermove 时根据起始 frame 计算新 frame。
     *
     * @param event 浏览器 pointer 事件。
     */
    function handleWindowPointerMove(event: PointerEvent): void {
      const action = activeAction.value;
      if (!action) return;
      const dx = event.clientX - action.startX;
      const dy = event.clientY - action.startY;
      const template = snapshot.value.template;
      const page = template.pages[0];
      const pageSize = getPageSize(template);
      if (action.type === 'move') {
        const proposedBounds = {
          ...action.startBounds,
          x: action.startBounds.x + dx,
          y: action.startBounds.y + dy
        };
        const snapped = snapFrame(proposedBounds, page, pageSize, snapshot.value.template.pages[0].components, action.componentIds);
        const snappedDx = snapped.frame.x - action.startBounds.x;
        const snappedDy = snapped.frame.y - action.startBounds.y;
        snapGuides.value = snapped.guides;
        distanceGuides.value = createDistanceGuides(
          snapped.frame,
          page,
          pageSize,
          snapshot.value.template.pages[0].components,
          action.componentIds
        );
        for (const id of action.componentIds) {
          const startFrame = action.startFrames[id];
          if (!startFrame) continue;
          designer.value.resizeComponent(id, {
            x: round(startFrame.x + snappedDx),
            y: round(startFrame.y + snappedDy)
          });
        }
        return;
      }
      const startFrame = action.startFrames[action.primaryId];
      if (!startFrame) return;
      const resizedFrame = calculateResizeFrame(startFrame, dx, dy, action.handle ?? 'se');
      const snapped = snapResizeFrame(
        { ...startFrame, ...resizedFrame },
        action.handle ?? 'se',
        page,
        pageSize,
        snapshot.value.template.pages[0].components,
        action.componentIds
      );
      snapGuides.value = snapped.guides;
      distanceGuides.value = createDistanceGuides(
        snapped.frame,
        page,
        pageSize,
        snapshot.value.template.pages[0].components,
        action.componentIds
      );
      designer.value.resizeComponent(action.primaryId, snapped.frame);
    }

    /**
     * pointerup 时结束当前交互。
     */
    function handleWindowPointerUp(): void {
      activeAction.value = null;
      snapGuides.value = [];
      distanceGuides.value = [];
      removeWindowPointerListeners();
    }

    /**
     * 浏览器取消 pointer 或窗口失焦时重置交互态。
     *
     * 某些系统菜单、开发者工具切换或窗口失焦场景不会稳定触发 `pointerup`。如果不在这里
     * 清理，下一次点击可能会继承旧的拖拽状态，看起来就像组件无法重新选中。
     */
    function handleWindowInteractionCancel(): void {
      activeAction.value = null;
      snapGuides.value = [];
      distanceGuides.value = [];
      marqueeSelection.value = null;
      removeWindowPointerListeners();
      removeWindowMarqueeListeners();
    }

    /**
     * 移除全局 pointer 监听，避免组件卸载后残留事件。
     */
    function removeWindowPointerListeners(): void {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowInteractionCancel);
      window.removeEventListener('blur', handleWindowInteractionCancel);
    }

    /**
     * 画布空白区域 pointerdown 入口，用于开始框选。
     *
     * 单击空白处仍然清空选区；按住并拖动时会显示框选矩形，并实时选中与矩形相交的组件。
     *
     * @param event 浏览器 pointer 事件。
     */
    function startMarqueeSelection(event: PointerEvent): void {
      if (event.button !== 0) return;
      event.preventDefault();
      const point = getPagePoint(event);
      marqueeSelection.value = {
        start: point,
        current: point,
        baseSelectedIds: snapshot.value.selectedIds,
        additive: event.shiftKey,
        active: false
      };
      window.addEventListener('pointermove', handleWindowMarqueeMove);
      window.addEventListener('pointerup', handleWindowMarqueeUp);
    }

    /**
     * 框选 pointermove 处理。
     *
     * @param event 浏览器 pointer 事件。
     */
    function handleWindowMarqueeMove(event: PointerEvent): void {
      const marquee = marqueeSelection.value;
      if (!marquee) return;
      marquee.current = getPagePoint(event);
      marquee.active = marquee.active || getPointDistance(marquee.start, marquee.current) > 3;
      if (!marquee.active) return;
      const rect = getSelectionRect(marquee.start, marquee.current);
      const selectedIds = snapshot.value.template.pages[0].components
        .filter((component) => component.visible !== false)
        .filter((component) => framesIntersect(rect, component.frame))
        .map((component) => component.id);
      designer.value.select(marquee.additive ? uniqueIds([...marquee.baseSelectedIds, ...selectedIds]) : selectedIds);
    }

    /**
     * 框选 pointerup 处理。
     */
    function handleWindowMarqueeUp(): void {
      const marquee = marqueeSelection.value;
      if (marquee && !marquee.active && !marquee.additive) designer.value.clearSelection();
      marqueeSelection.value = null;
      removeWindowMarqueeListeners();
    }

    /**
     * 移除框选全局监听。
     */
    function removeWindowMarqueeListeners(): void {
      window.removeEventListener('pointermove', handleWindowMarqueeMove);
      window.removeEventListener('pointerup', handleWindowMarqueeUp);
    }

    /**
     * 画布 drop 入口，将字段面板拖入的数据转换成 field 组件。
     *
     * @param event 浏览器拖放事件。
     */
    function handleDrop(event: DragEvent): void {
      event.preventDefault();
      const point = getPagePoint(event);
      const rawComponent = event.dataTransfer?.getData('application/x-openpress-component');
      if (rawComponent) {
        try {
          addDroppedComponent(JSON.parse(rawComponent) as OpenPressDroppedComponent, point);
        } catch {
          // 拖放数据由外部系统提供，格式不合法时直接忽略，避免破坏设计器状态。
        }
        return;
      }
      const rawField = event.dataTransfer?.getData('application/x-openpress-field');
      if (!rawField) return;
      try {
        const field = JSON.parse(rawField) as OpenPressDroppedField;
        addField(field, point);
      } catch {
        // 拖放数据由外部系统提供，格式不合法时直接忽略，避免破坏设计器状态。
      }
    }

    /**
     * 将浏览器坐标换算成页面内部坐标。
     *
     * @param event 鼠标、指针或拖放事件。
     * @returns 页面左上角为原点的坐标。
     */
    function getPagePoint(event: MouseEvent): Pick<OpenPressFrame, 'x' | 'y'> {
      const rect = pageRef.value?.getBoundingClientRect();
      if (!rect) return { x: 48, y: 48 };
      return {
        x: round(event.clientX - rect.left),
        y: round(event.clientY - rect.top)
      };
    }

    /**
     * 从当前快照中按 id 读取组件 frame。
     *
     * pointer 操作必须基于 pointerdown 时的原始 frame 计算，否则拖拽过程中连续更新
     * 模板会让位移被重复叠加，产生“越拖越快”的错误。
     *
     * @param ids 要读取 frame 的组件 id 列表。
     * @returns 组件 id 到原始 frame 的映射。
     */
    function getFramesByIds(ids: string[]): Record<string, OpenPressFrame> {
      const frames: Record<string, OpenPressFrame> = {};
      for (const component of snapshot.value.template.pages[0].components) {
        if (ids.includes(component.id)) frames[component.id] = { ...component.frame };
      }
      return frames;
    }

    /**
     * 渲染设计页。
     */
    return () => {
      const template = snapshot.value.template;
      const page = template.pages[0];
      const pageSize = getPageSize(template);
      return h('div', { class: 'open-press-vue-designer' }, [
        h(
          'div',
          {
            ref: pageRef,
            class: 'op-designer-page',
            style: {
              width: `${pageSize.width}px`,
              height: `${pageSize.height}px`
            },
            onPointerdown: startMarqueeSelection,
            onDragover: (event: DragEvent) => event.preventDefault(),
            onDrop: handleDrop
          },
          [
            renderPageRegions(page, pageSize),
            renderPageGuides(page, pageSize),
            snapGuides.value.map((guide) => renderGuide(guide)),
            distanceGuides.value.map((guide) => renderDistanceGuide(guide)),
            marqueeSelection.value?.active ? renderMarqueeSelection(marqueeSelection.value) : null,
            page.components.map((component) => renderComponent(component))
          ]
        )
      ]);
    };

    /**
     * 渲染页面级辅助线。
     *
     * @param page 当前页面。
     * @param pageSize 当前页面像素尺寸。
     * @returns Vue 虚拟节点数组。
     */
    function renderPageGuides(page: OpenPressPage, pageSize: Pick<OpenPressFrame, 'width' | 'height'>): VNode[] {
      return getPageGuideLines(page, pageSize).map((guide) => renderGuide(guide));
    }

    /**
     * 渲染页面级辅助区域。
     *
     * 页眉、页脚、页边距和装订线需要比单条线更容易被识别，因此这里用半透明区域
     * 表示它们的占位范围。区域仅用于设计态，不会进入打印渲染器输出。
     *
     * @param page 当前页面。
     * @param pageSize 当前页面像素尺寸。
     * @returns Vue 虚拟节点数组。
     */
    function renderPageRegions(page: OpenPressPage, pageSize: Pick<OpenPressFrame, 'width' | 'height'>): VNode[] {
      const guides = page.guides;
      const regions: VNode[] = [];
      if (guides?.headerHeight) {
        regions.push(
          h('div', {
            class: 'op-page-region is-header',
            style: { left: '0px', top: '0px', width: `${pageSize.width}px`, height: `${guides.headerHeight}px` }
          })
        );
      }
      if (guides?.footerHeight) {
        regions.push(
          h('div', {
            class: 'op-page-region is-footer',
            style: {
              left: '0px',
              top: `${pageSize.height - guides.footerHeight}px`,
              width: `${pageSize.width}px`,
              height: `${guides.footerHeight}px`
            }
          })
        );
      }
      if (guides?.margins) {
        regions.push(
          h('div', {
            class: 'op-page-region is-margin-box',
            style: {
              left: `${guides.margins.left}px`,
              top: `${guides.margins.top}px`,
              width: `${pageSize.width - guides.margins.left - guides.margins.right}px`,
              height: `${pageSize.height - guides.margins.top - guides.margins.bottom}px`
            }
          })
        );
      }
      if (guides?.gutter?.size) {
        const gutter = guides.gutter;
        const style =
          gutter.side === 'left'
            ? { left: '0px', top: '0px', width: `${gutter.size}px`, height: `${pageSize.height}px` }
            : gutter.side === 'right'
              ? { left: `${pageSize.width - gutter.size}px`, top: '0px', width: `${gutter.size}px`, height: `${pageSize.height}px` }
              : gutter.side === 'top'
                ? { left: '0px', top: '0px', width: `${pageSize.width}px`, height: `${gutter.size}px` }
                : { left: '0px', top: `${pageSize.height - gutter.size}px`, width: `${pageSize.width}px`, height: `${gutter.size}px` };
        regions.push(h('div', { class: 'op-page-region is-gutter', style }));
      }
      return regions;
    }

    /**
     * 渲染单条辅助线。
     *
     * @param guide 可见辅助线。
     * @returns Vue 虚拟节点。
     */
    function renderGuide(guide: VisibleGuide): VNode {
      return h('div', {
        class: ['op-guide-line', `is-${guide.orientation}`, `is-${guide.kind}`],
        style:
          guide.orientation === 'vertical'
            ? { left: `${guide.position}px` }
            : { top: `${guide.position}px` }
      });
    }

    /**
     * 渲染拖拽或缩放时的距离标注。
     *
     * @param guide 距离标注。
     * @returns Vue 虚拟节点。
     */
    function renderDistanceGuide(guide: DistanceGuide): VNode {
      const length = Math.abs(guide.end - guide.start);
      const left = guide.orientation === 'horizontal' ? Math.min(guide.start, guide.end) : guide.cross;
      const top = guide.orientation === 'horizontal' ? guide.cross : Math.min(guide.start, guide.end);
      return h(
        'div',
        {
          class: ['op-distance-guide', `is-${guide.orientation}`],
          style:
            guide.orientation === 'horizontal'
              ? { left: `${left}px`, top: `${top}px`, width: `${length}px` }
              : { left: `${left}px`, top: `${top}px`, height: `${length}px` }
        },
        [h('span', guide.label)]
      );
    }

    /**
     * 渲染框选矩形。
     *
     * @param marquee 当前框选状态。
     * @returns Vue 虚拟节点。
     */
    function renderMarqueeSelection(marquee: MarqueeSelection): VNode {
      const rect = getSelectionRect(marquee.start, marquee.current);
      return h('div', {
        class: 'op-marquee-selection',
        style: {
          left: `${rect.x}px`,
          top: `${rect.y}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`
        }
      });
    }

    /**
     * 渲染单个可交互组件。
     *
     * @param component 当前模板组件。
     * @returns Vue 虚拟节点。
     */
    function renderComponent(component: OpenPressComponent): VNode {
      const selected = snapshot.value.selectedIds.includes(component.id);
      return h(
        'div',
        {
          key: component.id,
          class: ['op-designer-component', `op-component-${component.type}`, selected && 'is-selected', component.locked && 'is-locked'],
          style: componentBoxStyle(component),
          onPointerdown: (event: PointerEvent) => startMove(event, component)
        },
        [
          h('div', { class: 'op-component-content' }, [renderComponentContent(component)]),
          selected ? h('div', { class: 'op-selection-outline' }) : null,
          selected ? renderResizeHandles(component) : null
        ]
      );
    }

    /**
     * 渲染组件内容。
     *
     * 设计态渲染追求“足够接近最终打印结果”，但不会在这里生成完整打印 HTML。
     * 最终分页、打印 CSS 和离线导出仍由 renderer 包负责。
     *
     * @param component 当前模板组件。
     * @returns Vue 虚拟节点。
     */
    function renderComponentContent(component: OpenPressComponent): VNode {
      if (component.visible === false) return h('div');
      switch (component.type) {
        case 'text':
          return renderText(component);
        case 'field':
          return renderField(component);
        case 'richText':
          return renderRichText(component);
        case 'image':
          return renderImage(component);
        case 'line':
          return renderLine(component);
        case 'qrCode':
        case 'barCode':
          return renderCode(component);
        case 'table':
          return renderTable(component);
      }
    }

    /**
     * 渲染普通文本组件。
     *
     * @param component 文本组件。
     * @returns Vue 虚拟节点。
     */
    function renderText(component: OpenPressTextComponent): VNode {
      return h('div', { class: 'op-text-render' }, interpolateText(component.text, props.data));
    }

    /**
     * 渲染字段绑定组件。
     *
     * @param component 字段组件。
     * @returns Vue 虚拟节点。
     */
    function renderField(component: OpenPressFieldComponent): VNode {
      const placeholder = getFieldPlaceholder(component);
      return h('div', { class: 'op-field-render' }, [
        component.label ? h('span', { class: 'op-field-label' }, component.label) : null,
        h('span', { class: 'op-field-value is-placeholder' }, placeholder)
      ]);
    }

    /**
     * 渲染富文本组件。
     *
     * @param component 富文本组件。
     * @returns Vue 虚拟节点。
     */
    function renderRichText(component: OpenPressRichTextComponent): VNode {
      const html = component.binding ? resolveBinding(props.data, component.binding) : component.html ?? '';
      return h('div', { class: 'op-rich-text-render', innerHTML: html });
    }

    /**
     * 渲染图片组件。
     *
     * @param component 图片组件。
     * @returns Vue 虚拟节点。
     */
    function renderImage(component: OpenPressImageComponent): VNode {
      const src = component.binding ? resolveBinding(props.data, component.binding) : component.src;
      if (!src) return h('div', { class: 'op-placeholder' }, ui.value.imagePlaceholder);
      return h('img', {
        class: 'op-image-render',
        src,
        alt: component.name ?? ui.value.imageAlt,
        style: { objectFit: component.fit ?? 'contain' }
      });
    }

    /**
     * 渲染线条组件。
     *
     * @param component 线条组件。
     * @returns Vue 虚拟节点。
     */
    function renderLine(component: OpenPressLineComponent): VNode {
      return h('div', {
        class: ['op-line-render', `is-${component.direction ?? 'horizontal'}`]
      });
    }

    /**
     * 渲染二维码或条形码占位组件。
     *
     * @param component 码图组件。
     * @returns Vue 虚拟节点。
     */
    function renderCode(component: OpenPressCodeComponent): VNode {
      const value = component.binding ? resolveBinding(props.data, component.binding) : component.value ?? '';
      return h('div', { class: ['op-code-render', `is-${component.type}`] }, [
        h('span', component.type === 'qrCode' ? ui.value.qrCodeLabel : ui.value.barCodeLabel),
        h('small', value)
      ]);
    }

    /**
     * 渲染表格组件。
     *
     * @param component 表格组件。
     * @returns Vue 虚拟节点。
     */
    function renderTable(component: OpenPressTableComponent): VNode {
      const rows = getArrayByPath(props.data, component.dataPath).slice(0, 6);
      return h('table', { class: 'op-table-render' }, [
        component.headerVisible === false
          ? null
          : h(
              'thead',
              h(
                'tr',
                component.columns.map((column) =>
                  h('th', { style: { width: column.width ? `${column.width}px` : undefined, textAlign: column.align } }, column.title)
                )
              )
            ),
        h(
          'tbody',
          rows.map((row) =>
            h(
              'tr',
              { style: { height: component.rowHeight ? `${component.rowHeight}px` : undefined } },
              component.columns.map((column) => {
                const value = column.binding ? getValueByPath(row, column.binding.path) : '';
                return h('td', { style: { textAlign: column.align } }, formatValue(value, column.format ?? column.binding?.format));
              })
            )
          )
        )
      ]);
    }

    /**
     * 渲染选中组件的八个缩放手柄。
     *
     * @param component 当前选中组件。
     * @returns Vue 虚拟节点数组。
     */
    function renderResizeHandles(component: OpenPressComponent): VNode[] {
      const handles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
      return handles.map((handle) =>
        h('button', {
          class: ['op-resize-handle', `is-${handle}`],
          type: 'button',
          title: `${ui.value.resizeHandle} ${handle}`,
          onPointerdown: (event: PointerEvent) => startResize(event, component, handle)
        })
      );
    }
  }
});

/**
 * 根据模板页面尺寸计算设计画布的 CSS 像素尺寸。
 *
 * 打印模板默认使用毫米记录纸张尺寸，但浏览器交互层需要像素坐标。这里仅转换页面
 * 外框尺寸，组件 frame 仍按已有模板坐标直接渲染，以兼容当前示例和历史模板。
 *
 * @param template 当前模板。
 * @returns CSS 像素页面尺寸。
 */
function getPageSize(template: OpenPressTemplate): Pick<OpenPressFrame, 'width' | 'height'> {
  const page = template.pages[0] ?? { components: [] };
  const width = page.width ?? template.page.width;
  const height = page.height ?? template.page.height;
  const unit = page.unit ?? template.page.unit;
  if (unit === 'mm') {
    return {
      width: round((width * 96) / 25.4),
      height: round((height * 96) / 25.4)
    };
  }
  return { width, height };
}

/**
 * 生成页面级固定辅助线。
 *
 * @param page 当前页面。
 * @param pageSize 页面像素尺寸。
 * @returns 固定显示的页面辅助线列表。
 */
function getPageGuideLines(page: OpenPressPage, pageSize: Pick<OpenPressFrame, 'width' | 'height'>): VisibleGuide[] {
  const guides = page.guides;
  const lines: VisibleGuide[] = [
    { orientation: 'vertical', position: pageSize.width / 2, kind: 'page' },
    { orientation: 'horizontal', position: pageSize.height / 2, kind: 'page' }
  ];
  if (guides?.margins) {
    lines.push(
      { orientation: 'vertical', position: guides.margins.left, kind: 'page' },
      { orientation: 'vertical', position: pageSize.width - guides.margins.right, kind: 'page' },
      { orientation: 'horizontal', position: guides.margins.top, kind: 'page' },
      { orientation: 'horizontal', position: pageSize.height - guides.margins.bottom, kind: 'page' }
    );
  }
  if (guides?.headerHeight) {
    lines.push({ orientation: 'horizontal', position: guides.headerHeight, kind: 'page' });
  }
  if (guides?.footerHeight) {
    lines.push({ orientation: 'horizontal', position: pageSize.height - guides.footerHeight, kind: 'page' });
  }
  if (guides?.gutter?.size) {
    const gutter = guides.gutter;
    if (gutter.side === 'left') lines.push({ orientation: 'vertical', position: gutter.size, kind: 'page' });
    if (gutter.side === 'right') lines.push({ orientation: 'vertical', position: pageSize.width - gutter.size, kind: 'page' });
    if (gutter.side === 'top') lines.push({ orientation: 'horizontal', position: gutter.size, kind: 'page' });
    if (gutter.side === 'bottom') lines.push({ orientation: 'horizontal', position: pageSize.height - gutter.size, kind: 'page' });
  }
  return lines.map((line) => ({ ...line, position: round(line.position) }));
}

/**
 * 对移动或缩放后的 frame 执行自动吸附。
 *
 * 吸附目标包含页面边缘、页面中心线、页边距、页眉页脚边界、装订线边界，以及未选中
 * 组件的边缘和中心线。函数返回被吸附后的 frame 和需要显示的动态辅助线。
 *
 * @param frame 待吸附的组件或多选外接矩形。
 * @param page 当前页面。
 * @param pageSize 页面像素尺寸。
 * @param components 当前页面组件。
 * @param excludedIds 本次操作中的组件 id，避免吸附到自己。
 * @returns 吸附后的 frame 和动态辅助线。
 */
function snapFrame(
  frame: OpenPressFrame,
  page: OpenPressPage,
  pageSize: Pick<OpenPressFrame, 'width' | 'height'>,
  components: OpenPressComponent[],
  excludedIds: string[]
): { frame: OpenPressFrame; guides: VisibleGuide[] } {
  const threshold = 5;
  const verticalTargets = [
    0,
    pageSize.width,
    pageSize.width / 2,
    ...getPageGuideLines(page, pageSize).filter((guide) => guide.orientation === 'vertical').map((guide) => guide.position),
    ...components
      .filter((component) => !excludedIds.includes(component.id))
      .flatMap((component) => [component.frame.x, component.frame.x + component.frame.width / 2, component.frame.x + component.frame.width])
  ];
  const horizontalTargets = [
    0,
    pageSize.height,
    pageSize.height / 2,
    ...getPageGuideLines(page, pageSize).filter((guide) => guide.orientation === 'horizontal').map((guide) => guide.position),
    ...components
      .filter((component) => !excludedIds.includes(component.id))
      .flatMap((component) => [component.frame.y, component.frame.y + component.frame.height / 2, component.frame.y + component.frame.height])
  ];
  const verticalEdges = [frame.x, frame.x + frame.width / 2, frame.x + frame.width];
  const horizontalEdges = [frame.y, frame.y + frame.height / 2, frame.y + frame.height];
  const verticalSnap = findNearestSnap(verticalEdges, verticalTargets, threshold);
  const horizontalSnap = findNearestSnap(horizontalEdges, horizontalTargets, threshold);
  const nextFrame = { ...frame };
  const guides: VisibleGuide[] = [];
  if (verticalSnap) {
    nextFrame.x = round(frame.x + verticalSnap.delta);
    guides.push({ orientation: 'vertical', position: round(verticalSnap.target), kind: 'snap' });
  }
  if (horizontalSnap) {
    nextFrame.y = round(frame.y + horizontalSnap.delta);
    guides.push({ orientation: 'horizontal', position: round(horizontalSnap.target), kind: 'snap' });
  }
  return { frame: nextFrame, guides };
}

/**
 * 对缩放后的 frame 执行边缘吸附。
 *
 * 缩放吸附与移动吸附不同：拖右边缘时应该改变宽度，拖左边缘时应该同时改变 x 和宽度。
 * 因此这里按手柄方向只吸附正在被用户拖动的边，而不是移动整个组件。
 *
 * @param frame 已按鼠标位移计算出的 frame。
 * @param handle 当前缩放手柄方向。
 * @param page 当前页面。
 * @param pageSize 页面像素尺寸。
 * @param components 当前页面组件。
 * @param excludedIds 本次操作中的组件 id。
 * @returns 吸附后的 frame 和动态辅助线。
 */
function snapResizeFrame(
  frame: OpenPressFrame,
  handle: ResizeHandle,
  page: OpenPressPage,
  pageSize: Pick<OpenPressFrame, 'width' | 'height'>,
  components: OpenPressComponent[],
  excludedIds: string[]
): { frame: OpenPressFrame; guides: VisibleGuide[] } {
  const threshold = 5;
  const minWidth = 20;
  const minHeight = 12;
  const nextFrame = { ...frame };
  const guides: VisibleGuide[] = [];
  const pageLines = getPageGuideLines(page, pageSize);
  const verticalTargets = [
    0,
    pageSize.width,
    pageSize.width / 2,
    ...pageLines.filter((guide) => guide.orientation === 'vertical').map((guide) => guide.position),
    ...components
      .filter((component) => !excludedIds.includes(component.id))
      .flatMap((component) => [component.frame.x, component.frame.x + component.frame.width / 2, component.frame.x + component.frame.width])
  ];
  const horizontalTargets = [
    0,
    pageSize.height,
    pageSize.height / 2,
    ...pageLines.filter((guide) => guide.orientation === 'horizontal').map((guide) => guide.position),
    ...components
      .filter((component) => !excludedIds.includes(component.id))
      .flatMap((component) => [component.frame.y, component.frame.y + component.frame.height / 2, component.frame.y + component.frame.height])
  ];

  if (handle.includes('e')) {
    const snap = findNearestSnap([frame.x + frame.width], verticalTargets, threshold);
    if (snap) {
      nextFrame.width = Math.max(minWidth, round(frame.width + snap.delta));
      guides.push({ orientation: 'vertical', position: round(snap.target), kind: 'snap' });
    }
  }
  if (handle.includes('w')) {
    const snap = findNearestSnap([frame.x], verticalTargets, threshold);
    if (snap) {
      nextFrame.x = round(frame.x + snap.delta);
      nextFrame.width = Math.max(minWidth, round(frame.width - snap.delta));
      guides.push({ orientation: 'vertical', position: round(snap.target), kind: 'snap' });
    }
  }
  if (handle.includes('s')) {
    const snap = findNearestSnap([frame.y + frame.height], horizontalTargets, threshold);
    if (snap) {
      nextFrame.height = Math.max(minHeight, round(frame.height + snap.delta));
      guides.push({ orientation: 'horizontal', position: round(snap.target), kind: 'snap' });
    }
  }
  if (handle.includes('n')) {
    const snap = findNearestSnap([frame.y], horizontalTargets, threshold);
    if (snap) {
      nextFrame.y = round(frame.y + snap.delta);
      nextFrame.height = Math.max(minHeight, round(frame.height - snap.delta));
      guides.push({ orientation: 'horizontal', position: round(snap.target), kind: 'snap' });
    }
  }

  return { frame: nextFrame, guides };
}

/**
 * 根据当前操作对象生成距离标注。
 *
 * 标注会优先寻找对象左/右/上/下最近的页面辅助线或其他组件边缘。为了避免画布过载，
 * 每次最多显示水平和垂直两个方向各一条距离。
 *
 * @param frame 当前操作对象的外接矩形。
 * @param page 当前页面。
 * @param pageSize 页面像素尺寸。
 * @param components 当前页面组件。
 * @param excludedIds 当前正在操作的组件 id。
 * @returns 距离标注列表。
 */
function createDistanceGuides(
  frame: OpenPressFrame,
  page: OpenPressPage,
  pageSize: Pick<OpenPressFrame, 'width' | 'height'>,
  components: OpenPressComponent[],
  excludedIds: string[]
): DistanceGuide[] {
  const pageLines = getPageGuideLines(page, pageSize);
  const verticalTargets = uniqueNumbers([
    0,
    pageSize.width,
    ...pageLines.filter((guide) => guide.orientation === 'vertical').map((guide) => guide.position),
    ...components
      .filter((component) => !excludedIds.includes(component.id))
      .flatMap((component) => [component.frame.x, component.frame.x + component.frame.width])
  ]);
  const horizontalTargets = uniqueNumbers([
    0,
    pageSize.height,
    ...pageLines.filter((guide) => guide.orientation === 'horizontal').map((guide) => guide.position),
    ...components
      .filter((component) => !excludedIds.includes(component.id))
      .flatMap((component) => [component.frame.y, component.frame.y + component.frame.height])
  ]);
  const guides: DistanceGuide[] = [];
  const horizontalGuide = createAxisDistanceGuide(verticalTargets, frame.x, frame.x + frame.width, frame.y - 14, 'horizontal');
  const verticalGuide = createAxisDistanceGuide(horizontalTargets, frame.y, frame.y + frame.height, frame.x - 14, 'vertical');
  if (horizontalGuide) guides.push(horizontalGuide);
  if (verticalGuide) guides.push(verticalGuide);
  return guides;
}

/**
 * 在单一轴向上生成最近距离标注。
 *
 * @param targets 可测距目标线。
 * @param startEdge 操作对象起始边。
 * @param endEdge 操作对象结束边。
 * @param cross 标注所在交叉轴坐标。
 * @param orientation 标注方向。
 * @returns 最近距离标注；没有有效间距时返回 null。
 */
function createAxisDistanceGuide(
  targets: number[],
  startEdge: number,
  endEdge: number,
  cross: number,
  orientation: DistanceGuide['orientation']
): DistanceGuide | null {
  const maxUsefulDistance = 96;
  const before = targets.filter((target) => target <= startEdge).sort((a, b) => b - a)[0];
  const after = targets.filter((target) => target >= endEdge).sort((a, b) => a - b)[0];
  const candidates = [
    before === undefined ? null : { start: before, end: startEdge, distance: startEdge - before },
    after === undefined ? null : { start: endEdge, end: after, distance: after - endEdge }
  ].filter((item): item is { start: number; end: number; distance: number } =>
    Boolean(item && item.distance > 0 && item.distance <= maxUsefulDistance)
  );
  if (!candidates.length) return null;
  const nearest = candidates.sort((a, b) => a.distance - b.distance)[0];
  return {
    orientation,
    start: round(nearest.start),
    end: round(nearest.end),
    cross: round(Math.max(0, cross)),
    label: `${round(nearest.distance)}`
  };
}

/**
 * 在一组待吸附边和目标线之间寻找最近的吸附结果。
 *
 * @param edges 待吸附的边或中心线位置。
 * @param targets 可吸附目标线。
 * @param threshold 吸附阈值。
 * @returns 最近吸附结果；没有命中时返回 null。
 */
function findNearestSnap(edges: number[], targets: number[], threshold: number): { delta: number; target: number } | null {
  let result: { delta: number; target: number } | null = null;
  for (const edge of edges) {
    for (const target of targets) {
      const delta = target - edge;
      if (Math.abs(delta) > threshold) continue;
      if (!result || Math.abs(delta) < Math.abs(result.delta)) result = { delta, target };
    }
  }
  return result;
}

/**
 * 计算多个 frame 的外接矩形。
 *
 * @param frames frame 列表。
 * @returns 外接矩形。
 */
function getBounds(frames: OpenPressFrame[]): OpenPressFrame {
  const left = Math.min(...frames.map((frame) => frame.x));
  const top = Math.min(...frames.map((frame) => frame.y));
  const right = Math.max(...frames.map((frame) => frame.x + frame.width));
  const bottom = Math.max(...frames.map((frame) => frame.y + frame.height));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

/**
 * 根据两个点生成框选矩形。
 *
 * @param start 起点。
 * @param current 当前点。
 * @returns 标准化后的矩形。
 */
function getSelectionRect(
  start: Pick<OpenPressFrame, 'x' | 'y'>,
  current: Pick<OpenPressFrame, 'x' | 'y'>
): OpenPressFrame {
  const left = Math.min(start.x, current.x);
  const top = Math.min(start.y, current.y);
  return {
    x: left,
    y: top,
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y)
  };
}

/**
 * 判断两个矩形是否相交。
 *
 * @param a 第一个矩形。
 * @param b 第二个矩形。
 * @returns 相交时返回 true。
 */
function framesIntersect(a: OpenPressFrame, b: OpenPressFrame): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

/**
 * 计算两个点之间的直线距离。
 *
 * @param start 起点。
 * @param current 当前点。
 * @returns 两点距离。
 */
function getPointDistance(start: Pick<OpenPressFrame, 'x' | 'y'>, current: Pick<OpenPressFrame, 'x' | 'y'>): number {
  return Math.hypot(current.x - start.x, current.y - start.y);
}

/**
 * 去重组件 id，并保留首次出现顺序。
 *
 * @param ids 组件 id 列表。
 * @returns 去重后的组件 id。
 */
function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

/**
 * 去重数值列表，并保留一位小数。
 *
 * @param values 数值列表。
 * @returns 去重后的数值列表。
 */
function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values.map((value) => round(value))));
}

/**
 * 计算组件外层绝对定位样式。
 *
 * @param component 当前模板组件。
 * @returns 可直接绑定到 Vue style 的样式对象。
 */
function componentBoxStyle(component: OpenPressComponent): CSSProperties {
  return {
    left: `${component.frame.x}px`,
    top: `${component.frame.y}px`,
    width: `${component.frame.width}px`,
    height: `${component.frame.height}px`,
    transform: component.frame.rotate ? `rotate(${component.frame.rotate}deg)` : undefined,
    ...componentContentStyle(component.style)
  };
}

/**
 * 将结构化模板样式转换为设计态 DOM 样式。
 *
 * @param style 模板组件样式。
 * @returns CSSProperties 样式对象。
 */
function componentContentStyle(style: OpenPressStyle = {}): CSSProperties {
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize ? `${style.fontSize}px` : undefined,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    textDecoration: style.textDecoration,
    letterSpacing: style.letterSpacing ? `${style.letterSpacing}px` : undefined,
    color: style.color,
    backgroundColor: style.backgroundColor,
    textAlign: style.textAlign,
    verticalAlign: style.verticalAlign,
    whiteSpace: style.whiteSpace,
    lineHeight: typeof style.lineHeight === 'number' ? String(style.lineHeight) : style.lineHeight,
    padding: style.padding ? `${style.padding}px` : undefined,
    borderColor: style.borderColor,
    borderStyle: style.borderStyle,
    borderWidth: style.borderWidth ? `${style.borderWidth}px` : undefined,
    borderRadius: style.borderRadius ? `${style.borderRadius}px` : undefined,
    opacity: style.opacity
  };
}

/**
 * 根据缩放方向和鼠标位移计算新的 frame。
 *
 * @param startFrame pointerdown 时的原始 frame。
 * @param dx 水平位移。
 * @param dy 垂直位移。
 * @param handle 缩放手柄方向。
 * @returns 更新后的 frame 局部对象。
 */
function calculateResizeFrame(startFrame: OpenPressFrame, dx: number, dy: number, handle: ResizeHandle): Partial<OpenPressFrame> {
  const minWidth = 20;
  const minHeight = 12;
  let x = startFrame.x;
  let y = startFrame.y;
  let width = startFrame.width;
  let height = startFrame.height;

  if (handle.includes('e')) width = Math.max(minWidth, startFrame.width + dx);
  if (handle.includes('s')) height = Math.max(minHeight, startFrame.height + dy);
  if (handle.includes('w')) {
    width = Math.max(minWidth, startFrame.width - dx);
    x = startFrame.x + (startFrame.width - width);
  }
  if (handle.includes('n')) {
    height = Math.max(minHeight, startFrame.height - dy);
    y = startFrame.y + (startFrame.height - height);
  }

  return { x: round(x), y: round(y), width: round(width), height: round(height) };
}

/**
 * 获取字段组件在设计态展示的变量占位文本。
 *
 * 设计态不能直接依赖 sampleData 的真实值，否则用户会误以为组件宽度已经覆盖了生产数据
 * 的所有长度。这里统一展示 `${字段名}`，真实打印时仍由 renderer 使用运行时数据替换。
 *
 * @param component 字段组件。
 * @returns 字段变量占位文本。
 */
function getFieldPlaceholder(component: OpenPressFieldComponent): string {
  const label = normalizeFieldLabel(component.label);
  const variableName = label || component.binding.path;
  return `\${${variableName}}`;
}

/**
 * 根据字段名估算字段组件的初始宽度。
 *
 * 这个宽度只是设计态虚拟宽度，用来让 `订单号:${订单号}` 这类单字段在拖入后有一个
 * 合理可见的占位框。最终打印仍按组件 frame 渲染真实数据；真实值过长时应由后续
 * 溢出策略决定裁剪、换行或自动缩小字号。
 *
 * @param label 字段展示名。
 * @param fontSize 字段默认字号。
 * @returns 建议的组件初始宽度。
 */
function estimateFieldWidth(label: string, fontSize: number): number {
  const normalizedLabel = normalizeFieldLabel(label);
  const text = `${normalizedLabel}:\${${normalizedLabel}}`;
  const measured = Array.from(text).reduce((sum, char) => {
    return sum + (char.charCodeAt(0) > 255 ? fontSize : fontSize * 0.58);
  }, 0);
  return Math.min(360, Math.max(140, round(measured + 18)));
}

/**
 * 规整字段标签，去掉标签末尾的中英文冒号。
 *
 * @param label 原始字段标签。
 * @returns 可用于变量占位符的字段名。
 */
function normalizeFieldLabel(label = ''): string {
  return label.trim().replace(/[:：]\s*$/, '');
}

/**
 * 为新组件创建前端临时 id。
 *
 * 第一阶段使用时间戳和随机片段即可满足本地编辑；后续接入协作或服务端保存时，可以
 * 在 designer-core 外部替换为业务自己的 id 策略。
 *
 * @param prefix id 前缀，通常是组件类型。
 * @returns 新组件 id。
 */
function createComponentId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * 保留一位小数，减少拖拽过程中产生的长浮点数。
 *
 * @param value 原始数值。
 * @returns 四舍五入后的数值。
 */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}
