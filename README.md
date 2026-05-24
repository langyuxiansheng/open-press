# OpenPress

OpenPress is an open-source data-driven print template designer and rendering engine.

It is designed around a framework-neutral core:

- `@open-press/core`: template schema, data binding, field-path helpers, formatting.
- `@open-press/renderer`: render OpenPress templates to printable HTML.
- `@open-press/designer-core`: framework-neutral designer state and editing commands.
- `@open-press/vue`: Vue adapter components.
- `@open-press/react`: React adapter components.

The main rule is simple: template data is plain JSON, and the rendering pipeline is independent of Vue or React.

## First Example

```ts
import { createTemplate } from '@open-press/core';
import { renderTemplateToHtml } from '@open-press/renderer';

const template = createTemplate({
  title: 'Sales Order',
  pages: [
    {
      components: [
        {
          id: 'title',
          type: 'text',
          text: 'Order {{orderNo}}',
          frame: { x: 24, y: 24, width: 300, height: 32 },
          style: { fontSize: 20, fontWeight: 700 }
        }
      ]
    }
  ]
});

const html = renderTemplateToHtml(template, { orderNo: 'SO-001' });
```

## Development

```bash
pnpm install
pnpm build
pnpm dev:vue
pnpm dev:react
```

## Design Direction

OpenPress separates four concerns:

1. Template JSON and data contracts.
2. Headless designer state.
3. Runtime rendering.
4. UI adapters for Vue, React, and future frameworks.
