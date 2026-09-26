declare module 'node:test' {
  const test: (name: string, fn: (t?: any) => void | Promise<void>) => void;
  export default test;
}

declare module 'node:assert' {
  interface Assert {
    strictEqual(actual: any, expected: any, message?: string): void;
    ok(value: any, message?: string): void;
  }
  const assert: Assert;
  export default assert;
}
