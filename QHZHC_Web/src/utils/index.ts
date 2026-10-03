export function debounce<Arguments extends unknown[], Result>(
  func: (...args: Arguments) => Result,
  wait: number,
  immediate = false,
): (...args: Arguments) => Result | undefined {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let args: Arguments | null = null;
  let context: unknown;
  let timestamp = 0;
  let result: Result | undefined;
  const later = function () {
    // 据上一次触发时间间隔
    const last = +new Date() - timestamp;

    // 上次被包装函数被调用时间间隔 last 小于设定时间间隔 wait
    if (last < wait && last > 0) {
      timeout = setTimeout(later, wait - last);
    } else {
      timeout = null;
      // 如果设定为immediate===true，因为开始边界已经调用过了此处无需调用
      if (!immediate) {
        result = func.apply(context, args ?? ([] as unknown as Arguments));
        if (!timeout) {
          context = null;
          args = null;
        }
      }
    }
  };

  return function (this: unknown, ...nextArguments: Arguments) {
    args = nextArguments;
    context = this;
    timestamp = +new Date();
    const callNow = immediate && !timeout;
    // 如果延时不存在，重新设定延时
    if (!timeout) timeout = setTimeout(later, wait);
    if (callNow) {
      result = func.apply(context, args);
      context = null;
      args = null;
    }

    return result;
  };
}
