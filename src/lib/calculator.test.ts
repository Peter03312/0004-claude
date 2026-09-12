import { describe, expect, it } from 'vitest';
import {
  calculate,
  calculateAvailableMinutes,
  validateFields,
  type RawFields,
} from './calculator';

const validFields: RawFields = {
  cylinderConstant: '10',
  currentPressure: '150',
  reservePressure: '50',
  flowRate: '5',
  minimumMinutes: '30',
};

function fieldsWith(patch: Partial<RawFields>): RawFields {
  return { ...validFields, ...patch };
}

describe('validateFields', () => {
  it('接受一组合法输入', () => {
    const result = validateFields(validFields);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.values).toEqual({
      cylinderConstant: 10,
      currentPressure: 150,
      reservePressure: 50,
      flowRate: 5,
      minimumMinutes: 30,
    });
  });

  it('接受小数压力/流量与首尾空白', () => {
    const result = validateFields(
      fieldsWith({
        cylinderConstant: ' 3.5 ',
        currentPressure: '99.5',
        reservePressure: '25.25',
        flowRate: '2.5',
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.values?.cylinderConstant).toBe(3.5);
    expect(result.values?.reservePressure).toBe(25.25);
  });

  it.each([
    ['cylinderConstant', ''],
    ['currentPressure', '   '],
    ['reservePressure', 'abc'],
    ['flowRate', '12a'],
    ['minimumMinutes', '分钟'],
  ] as const)('拒绝无法解析的输入：%s = %j', (name, value) => {
    const result = validateFields(fieldsWith({ [name]: value }));
    expect(result.valid).toBe(false);
    expect(result.errors[name]).toBeTruthy();
    expect(result.values).toBeUndefined();
  });

  it.each([
    ['cylinderConstant', '-1'],
    ['currentPressure', '-0.5'],
    ['reservePressure', '-10'],
    ['flowRate', '-2'],
    ['minimumMinutes', '-30'],
  ] as const)('拒绝负数：%s = %j', (name, value) => {
    const result = validateFields(fieldsWith({ [name]: value }));
    expect(result.valid).toBe(false);
    expect(result.errors[name]).toBeTruthy();
  });

  it.each([
    ['cylinderConstant', 'Infinity'],
    ['currentPressure', '1e999'],
    ['reservePressure', '-Infinity'],
    ['flowRate', 'NaN'],
    ['minimumMinutes', 'Infinity'],
  ] as const)('拒绝非有限数值：%s = %j', (name, value) => {
    const result = validateFields(fieldsWith({ [name]: value }));
    expect(result.valid).toBe(false);
    expect(result.errors[name]).toBeTruthy();
  });

  it('瓶常数为 0 时拒绝', () => {
    const result = validateFields(fieldsWith({ cylinderConstant: '0' }));
    expect(result.valid).toBe(false);
    expect(result.errors.cylinderConstant).toBeTruthy();
  });

  it('流量为 0 时拒绝', () => {
    const result = validateFields(fieldsWith({ flowRate: '0' }));
    expect(result.valid).toBe(false);
    expect(result.errors.flowRate).toBeTruthy();
  });

  it('当前压力与最低保障分钟数允许为 0', () => {
    const result = validateFields(
      fieldsWith({ currentPressure: '0', reservePressure: '0', minimumMinutes: '0' }),
    );
    expect(result.valid).toBe(true);
  });

  it('保留压力等于当前压力时合法', () => {
    const result = validateFields(
      fieldsWith({ currentPressure: '80', reservePressure: '80' }),
    );
    expect(result.valid).toBe(true);
  });

  it('保留压力高于当前压力时拒绝', () => {
    const result = validateFields(
      fieldsWith({ currentPressure: '50', reservePressure: '50.01' }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.reservePressure).toBeTruthy();
  });

  it('最低保障分钟数须为整数', () => {
    const result = validateFields(fieldsWith({ minimumMinutes: '29.5' }));
    expect(result.valid).toBe(false);
    expect(result.errors.minimumMinutes).toBeTruthy();
  });

  it('多个字段同时非法时分别报错', () => {
    const result = validateFields({
      cylinderConstant: '0',
      currentPressure: '3',
      reservePressure: '5',
      flowRate: 'abc',
      minimumMinutes: '',
    });
    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual([
      'cylinderConstant',
      'flowRate',
      'minimumMinutes',
      'reservePressure',
    ]);
  });
});

describe('calculateAvailableMinutes', () => {
  it('按公式计算并向下取整', () => {
    // 10 × (150 − 50) ÷ 3 = 333.33… → 333
    expect(
      calculateAvailableMinutes({
        cylinderConstant: 10,
        currentPressure: 150,
        reservePressure: 50,
        flowRate: 3,
        minimumMinutes: 0,
      }),
    ).toBe(333);
  });

  it('不足一分钟的部分被舍去', () => {
    // 1 × (10 − 0) ÷ 6 = 1.666… → 1
    expect(
      calculateAvailableMinutes({
        cylinderConstant: 1,
        currentPressure: 10,
        reservePressure: 0,
        flowRate: 6,
        minimumMinutes: 0,
      }),
    ).toBe(1);
  });

  it('理论值为整数时不受浮点误差影响', () => {
    // 0.3 × 10 ÷ 3 在二进制浮点下略小于 1，仍应得 1
    expect(
      calculateAvailableMinutes({
        cylinderConstant: 0.3,
        currentPressure: 10,
        reservePressure: 0,
        flowRate: 3,
        minimumMinutes: 0,
      }),
    ).toBe(1);
  });

  it('保留压力等于当前压力时可用 0 分钟', () => {
    expect(
      calculateAvailableMinutes({
        cylinderConstant: 10,
        currentPressure: 80,
        reservePressure: 80,
        flowRate: 5,
        minimumMinutes: 0,
      }),
    ).toBe(0);
  });
});

describe('calculate（放行判定）', () => {
  const base = {
    cylinderConstant: 10,
    currentPressure: 150,
    reservePressure: 50,
    flowRate: 5,
  }; // 可用 200 分钟

  it('可用分钟数大于最低保障时放行并给出整数余量', () => {
    const result = calculate({ ...base, minimumMinutes: 120 });
    expect(result.availableMinutes).toBe(200);
    expect(result.released).toBe(true);
    expect(result.marginMinutes).toBe(80);
  });

  it('可用分钟数恰好等于最低保障时放行，余量为 0', () => {
    const result = calculate({ ...base, minimumMinutes: 200 });
    expect(result.released).toBe(true);
    expect(result.marginMinutes).toBe(0);
  });

  it('差 1 分钟时不放行并给出整数短缺', () => {
    const result = calculate({ ...base, minimumMinutes: 201 });
    expect(result.released).toBe(false);
    expect(result.marginMinutes).toBe(-1);
  });

  it('最低保障为 0 时总是放行', () => {
    const result = calculate({ ...base, minimumMinutes: 0 });
    expect(result.released).toBe(true);
    expect(result.marginMinutes).toBe(200);
  });

  it('可用 0 分钟且需要保障时不放行', () => {
    const result = calculate({
      cylinderConstant: 10,
      currentPressure: 50,
      reservePressure: 50,
      flowRate: 5,
      minimumMinutes: 1,
    });
    expect(result.availableMinutes).toBe(0);
    expect(result.released).toBe(false);
    expect(result.marginMinutes).toBe(-1);
  });
});
