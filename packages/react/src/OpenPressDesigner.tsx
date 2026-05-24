import { createOpenPressDesigner, type DesignerSnapshot } from '@open-press/designer-core';
import { renderTemplateToHtml } from '@open-press/renderer';
import type { OpenPressTemplate } from '@open-press/core';
import { useEffect, useMemo, useState } from 'react';

/**
 * React 设计器适配组件的属性。
 */
export interface OpenPressDesignerProps {
  /** 当前正在编辑和预览的模板 JSON。 */
  template: OpenPressTemplate;
  /** 用于预览字段绑定结果的运行时数据。 */
  data?: unknown;
  /** 无头设计器命令修改模板后触发的回调。 */
  onChange?: (snapshot: DesignerSnapshot) => void;
}

/**
 * OpenPress 的 React 设计器适配组件。
 *
 * 这个组件与 Vue 版本保持同样边界：React 只负责生命周期、props 同步和 iframe 预览；
 * 设计器状态和编辑命令来自 `@open-press/designer-core`，HTML 预览来自
 * `@open-press/renderer`。
 *
 * @param props React 适配组件属性。
 * @returns 包含预览 iframe 的 React 元素。
 */
export function OpenPressDesigner({ template, data = {}, onChange }: OpenPressDesignerProps) {
  /**
   * 设计器实例在组件生命周期内保持稳定。外部模板变化通过下面的 effect 同步，
   * 不通过重建实例处理，避免订阅关系和未来撤销栈被意外清空。
   */
  const designer = useMemo(() => createOpenPressDesigner({ template }), []);
  const [html, setHtml] = useState(() =>
    renderTemplateToHtml(template, data)
  );

  /**
   * 订阅无头设计器的模板变更，并转发给 React 调用方。
   */
  useEffect(() => {
    return designer.on('change', (snapshot) => {
      setHtml(renderTemplateToHtml(snapshot.template, data));
      onChange?.(snapshot);
    });
  }, [designer, data, onChange]);

  /**
   * 同步外部受控模板和运行时数据到预览层。
   */
  useEffect(() => {
    designer.setTemplate(template);
    setHtml(renderTemplateToHtml(template, data));
  }, [designer, template, data]);

  return (
    <div className="open-press-react-designer">
      <iframe className="open-press-preview" srcDoc={html} title="OpenPress preview" />
    </div>
  );
}
