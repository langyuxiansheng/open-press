import { createTemplate } from '@open-press/core';

/**
 * 基础销售订单模板示例。
 *
 * 该示例用于同时验证三件事：文本插值、字段绑定和明细表格渲染。playground 会直接
 * 复用这份模板，因此它也充当新功能开发时的最小回归样例。
 */
export const basicTemplate = createTemplate({
  title: '销售订单',
  dataSchema: {
    fields: [
      { path: 'orderNo', label: '订单号', type: 'string' },
      { path: 'customer.name', label: '客户', type: 'string' },
      {
        path: 'items',
        label: '明细',
        type: 'array',
        children: [
          { path: 'name', label: '商品名称', type: 'string' },
          { path: 'qty', label: '数量', type: 'number' },
          { path: 'price', label: '单价', type: 'number' }
        ]
      }
    ]
  },
  pages: [
    {
      components: [
        {
          id: 'title',
          type: 'text',
          text: '销售订单 {{orderNo}}',
          frame: { x: 24, y: 24, width: 360, height: 32 },
          style: { fontSize: 20, fontWeight: 700 }
        },
        {
          id: 'customer',
          type: 'field',
          label: '客户:',
          binding: { path: 'customer.name' },
          frame: { x: 24, y: 68, width: 360, height: 28 },
          style: { fontSize: 13 }
        },
        {
          id: 'items',
          type: 'table',
          dataPath: 'items',
          frame: { x: 24, y: 112, width: 520, height: 240 },
          headerVisible: true,
          columns: [
            { id: 'name', title: '商品', binding: { path: 'name' }, width: 260 },
            { id: 'qty', title: '数量', binding: { path: 'qty' }, width: 80, align: 'right' },
            {
              id: 'price',
              title: '单价',
              binding: { path: 'price' },
              width: 100,
              align: 'right',
              format: { type: 'currency', prefix: '$' }
            }
          ],
          summary: [{ columnId: 'price', type: 'sum', label: '$' }]
        }
      ]
    }
  ],
  sampleData: {
    orderNo: 'SO-001',
    customer: { name: '某知名科技企业' },
    items: Array.from({ length: 32 }, (_item, index) => {
      const products = [
        '无线蓝牙降噪耳机旗舰款带充电仓',
        '便携式高速移动固态硬盘 1TB',
        '人体工学办公椅升级款带腰托',
        '智能恒温电热水壶家用大容量',
        '轻薄笔记本电脑保护内胆包',
        '家用空气循环扇遥控静音款'
      ];
      return {
        name: `${products[index % products.length]}-${String(index + 1).padStart(2, '0')}`,
        qty: (index % 5) + 1,
        price: 80 + index * 7
      };
    })
  }
});
