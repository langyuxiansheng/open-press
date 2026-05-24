/**
 * 事件监听函数。
 *
 * @template T 事件载荷类型。
 */
export type Listener<T> = (payload: T) => void;

/**
 * 轻量级类型安全事件总线。
 *
 * `designer-core` 不能依赖 Vue、React 或任何具体状态库，因此用这个事件总线
 * 暴露状态变化。它只提供订阅和触发两个能力，生命周期清理由 `on` 返回的
 * 取消订阅函数完成。
 *
 * @template Events 事件名称到事件载荷的映射。
 */
export class Emitter<Events extends object> {
  private listeners = new Map<keyof Events, Set<Listener<any>>>();

  /**
   * 订阅指定事件。
   *
   * @param event 事件名称。
   * @param listener 事件触发时执行的监听函数。
   * @returns 取消订阅函数，适配层应在组件卸载时调用。
   */
  on<Key extends keyof Events>(event: Key, listener: Listener<Events[Key]>): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
    return () => set.delete(listener);
  }

  /**
   * 触发指定事件，并把载荷传给所有当前监听者。
   *
   * @param event 事件名称。
   * @param payload 事件载荷。
   */
  emit<Key extends keyof Events>(event: Key, payload: Events[Key]): void {
    this.listeners.get(event)?.forEach((listener) => listener(payload));
  }
}
