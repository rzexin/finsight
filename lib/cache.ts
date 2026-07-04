// 进程内 stale-while-revalidate（SWR）缓存。
// 适用于聚合慢上游的只读接口：命中即时返回，数据过期后在后台刷新，
// 把单次响应从「秒级（等待上游）」降到「毫秒级（返回上次结果）」。
//
// 设计要点：
// - single-flight：同一 key 的刷新并发去重，避免轮询/多客户端打爆上游。
// - 后台刷新失败不影响调用方：继续返回上一次成功的旧值。
// - 仅冷启动（无任何缓存）时才 await 上游；此时若失败则抛出由调用方处理。
// - shouldCache：可拒绝写入「无效结果」（如空数组），从而保留上一次的好数据。

interface Entry<T> {
  data: T;
  ts: number;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export interface SwrOptions<T> {
  /** 数据新鲜期（毫秒）。超过后仍立即返回旧值，同时触发一次后台刷新。 */
  freshMs: number;
  /** 返回 false 时不写入缓存（保留上一次的旧值）。默认缓存一切结果。 */
  shouldCache?: (data: T) => boolean;
}

/** 只读取当前缓存值，不触发任何刷新；调用方用于「按字段合并新旧结果」等场景。 */
export function peekCache<T>(key: string): T | undefined {
  return (store.get(key) as Entry<T> | undefined)?.data;
}

export async function swrCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: SwrOptions<T>
): Promise<T> {
  const entry = store.get(key) as Entry<T> | undefined;

  const refresh = (): Promise<T> => {
    let p = inflight.get(key) as Promise<T> | undefined;
    if (!p) {
      p = fetcher()
        .then((data) => {
          if (!opts.shouldCache || opts.shouldCache(data)) {
            store.set(key, { data, ts: Date.now() });
          }
          return data;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    return p;
  };

  if (entry) {
    // 有缓存：过期则后台刷新（吞掉错误以保留旧值），始终立即返回旧值。
    if (Date.now() - entry.ts >= opts.freshMs) {
      refresh().catch(() => {});
    }
    return entry.data;
  }

  // 冷启动：无任何缓存，必须等待首个结果（失败则抛给调用方）。
  return refresh();
}
