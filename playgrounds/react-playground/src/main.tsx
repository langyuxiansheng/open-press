import { createRoot } from 'react-dom/client';
import { OpenPressDesigner } from '@open-press/react';
import { basicTemplate } from '../../../examples/basic-template';
import './style.css';

/**
 * React playground 根组件。
 *
 * 该页面用于验证 React 适配层和 Vue 适配层是否共享同一份模板、数据和渲染器。
 * 目前只提供工作台外壳，后续交互能力应优先沉淀到无框架核心包。
 */
function App() {
  /**
   * 组件面板中的临时展示项。
   *
   * 下一阶段会替换为真实组件注册表，包含组件类型、默认尺寸、默认样式和创建函数。
   */
  const componentItems = ['Text', 'Field', 'Rich text', 'Image', 'Table', 'QR code', 'Bar code'];
  /**
   * 当前模板声明的数据字段目录。
   */
  const fieldItems = basicTemplate.dataSchema?.fields ?? [];
  return (
    <main className="shell">
      <aside className="left-panel">
        <div className="brand">
          <div className="brand-mark">OP</div>
          <div>
            <h1>OpenPress</h1>
            <p>Print template designer</p>
          </div>
        </div>
        <section className="panel-section">
          <div className="section-title">Components</div>
          <div className="tool-list">
            {componentItems.map((item) => <button className="tool-button" key={item}>{item}</button>)}
          </div>
        </section>
        <section className="panel-section">
          <div className="section-title">Data fields</div>
          <div className="field-list">
            {fieldItems.map((field) => (
              <div className="field-pill" key={field.path}>
                <span>{field.label}</span>
                <code>{field.path}</code>
              </div>
            ))}
          </div>
        </section>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">React Playground</p>
            <h2>{basicTemplate.title}</h2>
          </div>
          <div className="actions">
            <button className="secondary">Save draft</button>
            <button className="primary" onClick={() => window.print()}>Print preview</button>
          </div>
        </header>
        <div className="canvas">
          <OpenPressDesigner template={basicTemplate} data={basicTemplate.sampleData} />
        </div>
      </section>
      <aside className="right-panel">
        <section className="panel-card">
          <div className="section-title">Template</div>
          <dl>
            <div><dt>Page</dt><dd>A4 portrait</dd></div>
            <div><dt>Components</dt><dd>{basicTemplate.pages[0].components.length}</dd></div>
            <div><dt>Output</dt><dd>HTML print</dd></div>
          </dl>
        </section>
        <section className="panel-card">
          <div className="section-title">Sample data</div>
          <pre>{JSON.stringify(basicTemplate.sampleData, null, 2)}</pre>
        </section>
      </aside>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
