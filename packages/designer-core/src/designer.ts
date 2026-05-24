import {
  cloneTemplate,
  createTemplate,
  type OpenPressComponent,
  type OpenPressPage,
  type OpenPressPageGuides,
  type OpenPressTemplate,
  type OpenPressTemplateInput
} from '@open-press/core';
import { Emitter } from './events.js';

/**
 * 设计器对外发布的不可变快照。
 *
 * 适配层应该基于这个对象渲染界面，而不是读取 `OpenPressDesigner` 的私有字段。
 * 快照里的模板会在发布前深拷贝，因此调用方可以安全保存、diff 或传给外部状态库，
 * 不会意外修改设计器内部状态。
 */
export interface DesignerSnapshot {
  /** 当前模板状态。 */
  template: OpenPressTemplate;
  /** 当前选中的组件 id 列表。 */
  selectedIds: string[];
}

/**
 * `OpenPressDesigner` 的事件契约。
 */
export interface DesignerEvents {
  /** 模板发生变化后触发，例如新增、更新、移动、删除组件。 */
  change: DesignerSnapshot;
  /** 选区发生变化后触发。 */
  select: string[];
}

/**
 * 创建无头设计器时的配置项。
 */
export interface CreateDesignerOptions {
  /** 要编辑的已有模板。传入后会被深拷贝，不会直接修改原对象。 */
  template?: OpenPressTemplate;
  /** 没有传入已有模板时，用于创建初始模板的数据。 */
  initial?: OpenPressTemplateInput;
}

/**
 * 多选组件对齐方向。
 *
 * 水平方向对齐会修改组件的 `frame.x`，垂直方向对齐会修改组件的 `frame.y`。
 */
export type OpenPressAlignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/**
 * OpenPress 的无框架设计器状态模型。
 *
 * 这个类只负责模板编辑状态和命令式操作，不依赖 Vue、React、DOM 事件或具体渲染器。
 * Vue/React 适配层只需要把用户交互转换为这里的命令，再订阅 `change` 和 `select`
 * 事件即可。这样可以避免把核心逻辑拆成两套框架实现。
 */
export class OpenPressDesigner {
  private emitter = new Emitter<DesignerEvents>();
  private template: OpenPressTemplate;
  private selectedIds: string[] = [];

  /**
   * 创建一个设计器实例。
   *
   * 如果传入 `template`，设计器会基于模板副本进行编辑；否则会根据 `initial`
   * 创建一个结构完整的默认模板。
   *
   * @param options 可选的已有模板或初始模板数据。
   */
  constructor(options: CreateDesignerOptions = {}) {
    this.template = options.template
      ? cloneTemplate(options.template)
      : createTemplate(options.initial ?? { title: 'Untitled Template' });
  }

  /**
   * 订阅设计器事件。
   *
   * @param event 事件名称。
   * @param listener 接收类型化事件载荷的监听函数。
   * @returns 取消订阅函数，框架适配层应在组件销毁时调用。
   */
  on<Key extends keyof DesignerEvents>(
    event: Key,
    listener: (payload: DesignerEvents[Key]) => void
  ): () => void {
    return this.emitter.on(event, listener);
  }

  /**
   * 获取当前设计器公开状态。
   *
   * 返回的模板是深拷贝副本，外部无法绕过命令 API 修改设计器状态。这样所有模板变更
   * 都会通过事件发布，便于 UI、历史记录、协同编辑和自动保存逻辑统一接入。
   *
   * @returns 当前设计器快照。
   */
  getSnapshot(): DesignerSnapshot {
    return {
      template: cloneTemplate(this.template),
      selectedIds: [...this.selectedIds]
    };
  }

  /**
   * 获取当前选中的组件副本。
   *
   * 这个方法为属性面板、快捷键状态和后续多选工具栏提供读取入口。返回值会深拷贝，
   * 调用方不能通过修改返回对象绕过命令 API。
   *
   * @returns 当前选中组件的副本列表，顺序与 `selectedIds` 一致。
   */
  getSelectedComponents(): OpenPressComponent[] {
    return this.selectedIds
      .map((id) => this.findComponent(id)?.component)
      .filter((component): component is OpenPressComponent => Boolean(component))
      .map((component) => cloneJson(component));
  }

  /**
   * 替换当前正在编辑的模板。
   *
   * 这个方法主要给受控组件适配层使用，例如 Vue/React 外部传入了新的 `template`
   * prop。替换模板时会清空选区，因为旧模板中的选中组件 id 在新模板里不一定存在。
   *
   * @param template 要加载到设计器里的模板。
   */
  setTemplate(template: OpenPressTemplate): void {
    this.template = cloneTemplate(template);
    this.selectedIds = [];
    this.emitChange();
  }

  /**
   * 向指定页面追加组件，并把该组件设为当前选中。
   *
   * 如果目标页面不存在，会自动补齐空页面。这让调用方可以按页序逐步构建多页模板，
   * 不必在外部先处理页面数组长度。
   *
   * @param component 要追加的组件。
   * @param pageIndex 目标页索引，从 0 开始，默认第一页。
   */
  addComponent(component: OpenPressComponent, pageIndex = 0): void {
    this.ensurePage(pageIndex);
    this.template.pages[pageIndex].components.push(component);
    this.select([component.id]);
    this.emitChange();
  }

  /**
   * 按组件 id 局部更新组件属性。
   *
   * `frame` 和 `style` 会与原对象浅合并，而不是整体替换。这样属性面板可以只提交
   * `frame.x`、`frame.width`、`style.fontSize` 这类局部字段，不需要重新发送完整组件。
   *
   * @param id 组件 id。
   * @param patch 要合并到组件上的局部属性。
   */
  updateComponent(id: string, patch: Partial<OpenPressComponent>): void {
    const found = this.findComponent(id);
    if (!found) return;
    const nextPatch = patch as any;
    found.page.components[found.index] = {
      ...found.component,
      ...nextPatch,
      frame: nextPatch.frame ? { ...found.component.frame, ...nextPatch.frame } : found.component.frame,
      style: nextPatch.style ? { ...found.component.style, ...nextPatch.style } : found.component.style
    } as OpenPressComponent;
    this.touch();
    this.emitChange();
  }

  /**
   * 按增量移动一个组件。
   *
   * 已锁定组件会被忽略。吸附、参考线、边界限制等交互规则不放在这里，而应由上层
   * 设计器 UI 在调用该命令前计算好，这样核心模型保持简单且可复用。
   *
   * @param id 组件 id。
   * @param delta 移动增量，单位与模板坐标系统一致。
   */
  moveComponent(id: string, delta: { x: number; y: number }): void {
    const found = this.findComponent(id);
    if (!found || found.component.locked) return;
    this.updateComponent(id, {
      frame: {
        ...found.component.frame,
        x: found.component.frame.x + delta.x,
        y: found.component.frame.y + delta.y
      }
    } as Partial<OpenPressComponent>);
  }

  /**
   * 调整组件尺寸或位置。
   *
   * 与 `updateComponent` 相比，这个方法只允许修改 `frame`，适合拖拽缩放手柄、
   * 属性面板里的坐标输入框，以及后续键盘微调逻辑调用。
   *
   * @param id 组件 id。
   * @param framePatch 要合并到组件 frame 上的局部几何属性。
   */
  resizeComponent(id: string, framePatch: Partial<OpenPressComponent['frame']>): void {
    const found = this.findComponent(id);
    if (!found || found.component.locked) return;
    this.updateComponent(id, {
      frame: {
        ...found.component.frame,
        ...framePatch
      }
    } as Partial<OpenPressComponent>);
  }

  /**
   * 更新指定页面的页面级配置。
   *
   * 这个方法用于页边距、页眉页脚、装订线等页面辅助配置。它只浅合并页面对象；
   * `guides` 会额外做一层浅合并，避免属性面板只更新 `headerHeight` 时覆盖已有边距。
   *
   * @param pageIndex 页面索引，从 0 开始。
   * @param patch 页面局部补丁。
   */
  updatePage(pageIndex: number, patch: Partial<OpenPressPage>): void {
    this.ensurePage(pageIndex);
    const page = this.template.pages[pageIndex];
    this.template.pages[pageIndex] = {
      ...page,
      ...patch,
      guides: patch.guides ? { ...page.guides, ...patch.guides } : page.guides
    };
    this.touch();
    this.emitChange();
  }

  /**
   * 更新指定页面的设计辅助线配置。
   *
   * 该方法比 `updatePage` 更窄，适合页面设置面板调用。`margins` 和 `gutter`
   * 都会保留原对象中未被提交的字段，避免四个边距输入框互相覆盖。
   *
   * @param pageIndex 页面索引，从 0 开始。
   * @param guides 页面辅助线局部配置。
   */
  updatePageGuides(pageIndex: number, guides: Partial<OpenPressPageGuides>): void {
    this.ensurePage(pageIndex);
    const page = this.template.pages[pageIndex];
    this.template.pages[pageIndex] = {
      ...page,
      guides: {
        ...page.guides,
        ...guides,
        margins: guides.margins ? { ...page.guides?.margins, ...guides.margins } : page.guides?.margins,
        gutter: guides.gutter ? { ...page.guides?.gutter, ...guides.gutter } : page.guides?.gutter
      }
    };
    this.touch();
    this.emitChange();
  }

  /**
   * 将当前多选组件按指定方向对齐。
   *
   * 对齐基准取当前选区的整体外接矩形：左对齐取最小 x，右对齐取最大 right，
   * 居中对齐取选区中心线。这样无论用户先选中哪个组件，结果都稳定可预期。
   *
   * @param alignment 对齐方向。
   */
  alignSelectedComponents(alignment: OpenPressAlignment): void {
    const selected: Array<{ page: OpenPressPage; index: number; component: OpenPressComponent }> = [];
    for (const id of this.selectedIds) {
      const found = this.findComponent(id);
      if (found && !found.component.locked) selected.push(found);
    }
    if (selected.length < 2) return;

    const bounds = getComponentsBounds(selected.map((found) => found.component));
    for (const found of selected) {
      const frame = found.component.frame;
      if (alignment === 'left') frame.x = bounds.left;
      if (alignment === 'center') frame.x = bounds.left + bounds.width / 2 - frame.width / 2;
      if (alignment === 'right') frame.x = bounds.right - frame.width;
      if (alignment === 'top') frame.y = bounds.top;
      if (alignment === 'middle') frame.y = bounds.top + bounds.height / 2 - frame.height / 2;
      if (alignment === 'bottom') frame.y = bounds.bottom - frame.height;
      frame.x = round(frame.x);
      frame.y = round(frame.y);
    }
    this.touch();
    this.emitChange();
  }

  /**
   * 复制一个组件。
   *
   * 新组件会继承原组件的全部配置，但使用调用方提供的新 id，并按 offset 偏移位置。
   * id 由调用方传入，是为了让宿主系统可以接入自己的 uuid、雪花 id 或后端 id 策略。
   *
   * @param sourceId 被复制的组件 id。
   * @param newId 新组件 id。
   * @param offset 新组件相对原组件的偏移量，默认向右下方偏移 12。
   * @returns 新组件副本；当源组件不存在时返回 `null`。
   */
  duplicateComponent(
    sourceId: string,
    newId: string,
    offset: { x: number; y: number } = { x: 12, y: 12 }
  ): OpenPressComponent | null {
    const found = this.findComponent(sourceId);
    if (!found) return null;
    const duplicated = cloneJson(found.component);
    duplicated.id = newId;
    duplicated.frame = {
      ...duplicated.frame,
      x: duplicated.frame.x + offset.x,
      y: duplicated.frame.y + offset.y
    };
    found.page.components.splice(found.index + 1, 0, duplicated);
    this.select([newId]);
    this.touch();
    this.emitChange();
    return cloneJson(duplicated);
  }

  /**
   * 调整组件在当前页面内的层级顺序。
   *
   * OpenPress 第一阶段用页面组件数组的顺序表达层级，数组越靠后越晚渲染，也就越靠上。
   * 后续如果引入显式 zIndex，也应在这里集中处理兼容逻辑。
   *
   * @param id 组件 id。
   * @param direction 层级移动方向。
   */
  reorderComponent(id: string, direction: 'forward' | 'backward' | 'front' | 'back'): void {
    const found = this.findComponent(id);
    if (!found) return;
    const components = found.page.components;
    const [component] = components.splice(found.index, 1);
    if (direction === 'front') {
      components.push(component);
    } else if (direction === 'back') {
      components.unshift(component);
    } else if (direction === 'forward') {
      components.splice(Math.min(found.index + 1, components.length), 0, component);
    } else {
      components.splice(Math.max(found.index - 1, 0), 0, component);
    }
    this.touch();
    this.emitChange();
  }

  /**
   * 按 id 删除组件。
   *
   * 删除后会同步从当前选区移除该组件，避免属性面板继续展示已经不存在的组件。
   *
   * @param id 组件 id。
   */
  removeComponent(id: string): void {
    const found = this.findComponent(id);
    if (!found) return;
    found.page.components.splice(found.index, 1);
    this.selectedIds = this.selectedIds.filter((selectedId) => selectedId !== id);
    this.touch();
    this.emitChange();
  }

  /**
   * 替换当前选区。
   *
   * 多选用有序 id 列表表示。选区变化不会触发 `change`，因为它不修改模板 JSON；
   * 只会触发 `select`，供属性面板、选中框和快捷键逻辑更新状态。
   *
   * @param ids 当前选中的组件 id 列表。
   */
  select(ids: string[]): void {
    this.selectedIds = [...ids];
    this.emitter.emit('select', [...this.selectedIds]);
  }

  /**
   * 切换单个组件在当前选区中的状态。
   *
   * 这个方法主要给 Shift/Cmd 多选交互使用。它只改变选区，不修改模板 JSON。
   *
   * @param id 要切换选中状态的组件 id。
   */
  toggleSelection(id: string): void {
    this.selectedIds = this.selectedIds.includes(id)
      ? this.selectedIds.filter((selectedId) => selectedId !== id)
      : [...this.selectedIds, id];
    this.emitter.emit('select', [...this.selectedIds]);
  }

  /**
   * 清空当前选区。
   */
  clearSelection(): void {
    this.select([]);
  }

  /**
   * 在所有页面中查找组件，并返回组件及其所在页面信息。
   *
   * @param id 组件 id。
   * @returns 组件所在位置；未找到时返回 `null`。
   */
  private findComponent(id: string) {
    for (const page of this.template.pages) {
      const index = page.components.findIndex((component) => component.id === id);
      if (index >= 0) {
        return { page, index, component: page.components[index] };
      }
    }
    return null;
  }

  /**
   * 确保页面数组中存在指定索引的页面。
   *
   * @param pageIndex 必须存在的页面索引，从 0 开始。
   */
  private ensurePage(pageIndex: number): void {
    while (!this.template.pages[pageIndex]) this.template.pages.push({ components: [] });
  }

  /**
   * 刷新模板更新时间。
   */
  private touch(): void {
    this.template.updatedAt = new Date().toISOString();
  }

  /**
   * 在模板变更后发布深拷贝快照。
   */
  private emitChange(): void {
    this.emitter.emit('change', this.getSnapshot());
  }
}

/**
 * 创建无头设计器的工厂函数。
 *
 * @param options 可选的已有模板或初始模板数据。
 * @returns 新的 OpenPress 无头设计器实例。
 */
export function createOpenPressDesigner(options: CreateDesignerOptions = {}): OpenPressDesigner {
  return new OpenPressDesigner(options);
}

/**
 * 深拷贝任意 JSON 数据。
 *
 * 设计器内部只处理可序列化模板数据，因此这里沿用 JSON 拷贝，避免引入额外依赖。
 *
 * @param value 待拷贝的 JSON 数据。
 * @returns 拷贝后的数据。
 */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 计算一组组件的外接矩形。
 *
 * 多选对齐、后续分布、组合和框选都会依赖这个基础几何计算。这里故意只读取 frame，
 * 不处理旋转后的包围盒，避免第一阶段对齐结果与用户在属性面板看到的坐标不一致。
 *
 * @param components 要计算外接矩形的组件列表。
 * @returns 选区外接矩形。
 */
function getComponentsBounds(components: OpenPressComponent[]) {
  const left = Math.min(...components.map((component) => component.frame.x));
  const top = Math.min(...components.map((component) => component.frame.y));
  const right = Math.max(...components.map((component) => component.frame.x + component.frame.width));
  const bottom = Math.max(...components.map((component) => component.frame.y + component.frame.height));
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}

/**
 * 保留一位小数，避免对齐计算产生冗长浮点数。
 *
 * @param value 原始数值。
 * @returns 规整后的数值。
 */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}
