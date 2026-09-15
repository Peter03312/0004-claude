import { describe, expect, it } from 'vitest';
import {
  calculate,
  calculateAvailableMinutes,
  formatRational,
  parseDecimal,
  validateFields,
  type ParsedValues,
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

function values(
  cylinderConstant: string,
  currentPressure: string,
  reservePressure: string,
  flowRate: string,
  minimumMinutes: string,
): ParsedValues {
  return {
    cylinderConstant: parseDecimal(cylinderConstant)!,
    currentPressure: parseDecimal(currentPressure)!,
    reservePressure: parseDecimal(reservePressure)!,
    flowRate: parseDecimal(flowRate)!,
    minimumMinutes: parseDecimal(minimumMinutes)!,
  };
}

describe('parseDecimal', () => {
  it('解析整数、小数与科学计数法为精确有理数', () => {
    expect(parseDecimal('10')).toEqual({ num: 10n, den: 1n });
    expect(parseDecimal('29.5')).toEqual({ num: 295n, den: 10n });
    expect(parseDecimal('0.03')).toEqual({ num: 3n, den: 100n });
    expect(parseDecimal('1e3')).toEqual({ num: 1000n, den: 1n });
    expect(parseDecimal('1.5e-2')).toEqual({ num: 15n, den: 1000n });
    expect(parseDecimal(' 12.5 ')).toEqual({ num: 125n, den: 10n });
  });

  it('拒绝空串、非数字与超出有限范围的字面量', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('   ')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('12a')).toBeNull();
    expect(parseDecimal('Infinity')).toBeNull();
    expect(parseDecimal('-Infinity')).toBeNull();
    expect(parseDecimal('NaN')).toBeNull();
    expect(parseDecimal('1e999')).toBeNull();
  });

  it('拒绝指数或小数位数极端的输入（防止构造天文数字 BigInt 卡死页面）', () => {
    // 值舍入为 0、能通过有限性检查，但精确表示需要 10^999999999 的分母
    expect(parseDecimal('1e-999999999')).toBeNull();
    expect(parseDecimal('1e-10001')).toBeNull();
    expect(parseDecimal('1e10001')).toBeNull();
    expect(parseDecimal(`0.${'0'.repeat(10_001)}1`)).toBeNull();
    expect(parseDecimal(`1.${'1'.repeat(10_001)}`)).toBeNull();
  });

  it('接受规模上限以内的输入', () => {
    expect(parseDecimal('1e308')).not.toBeNull();
    expect(parseDecimal('1e-308')).not.toBeNull();
    expect(parseDecimal('1e10000')).toBeNull(); // 值本身已超出双精度有限范围
    expect(parseDecimal('1e-10000')).not.toBeNull(); // 边界：指数恰为 -10000
    expect(parseDecimal(`0.${'0'.repeat(9_999)}1`)).not.toBeNull();
  });
});

describe('validateFields', () => {
  it('接受一组合法输入', () => {
    const result = validateFields(validFields);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.values?.cylinderConstant).toEqual({ num: 10n, den: 1n });
    expect(result.values?.minimumMinutes).toEqual({ num: 30n, den: 1n });
  });

  it('接受小数压力/流量与小数最低保障分钟数', () => {
    const result = validateFields(
      fieldsWith({
        cylinderConstant: ' 3.5 ',
        currentPressure: '99.5',
        reservePressure: '25.25',
        flowRate: '2.5',
        minimumMinutes: '29.5',
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.values?.minimumMinutes).toEqual({ num: 295n, den: 10n });
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

  it('极端指数输入被判定为超出可计算范围', () => {
    const result = validateFields(fieldsWith({ flowRate: '1e-999999999' }));
    expect(result.valid).toBe(false);
    expect(result.errors.flowRate).toBe('数值超出可精确计算的范围');
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

  it('保留压力与当前压力的比较不受浮点精度影响', () => {
    // 0.300000000000000000001 与 0.3 在双精度下相等，但精确比较前者更大
    const result = validateFields(
      fieldsWith({
        currentPressure: '0.3',
        reservePressure: '0.300000000000000000001',
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.reservePressure).toBeTruthy();
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
    expect(calculateAvailableMinutes(values('10', '150', '50', '3', '0'))).toBe(333n);
  });

  it('不足一分钟的部分被舍去', () => {
    // 1 × (10 − 0) ÷ 6 = 1.666… → 1
    expect(calculateAvailableMinutes(values('1', '10', '0', '6', '0'))).toBe(1n);
  });

  it('浮点下略小于整数的值被精确还原', () => {
    // 0.3 ÷ 0.1 在双精度下为 2.9999999999999996，精确值应为 3
    expect(calculateAvailableMinutes(values('0.3', '1', '0', '0.1', '0'))).toBe(3n);
  });

  it('回归：真实差 1 分钟时不得抬升为刚好够用', () => {
    // 200 ÷ 1.0000000000025 = 199.9999999995…，精确向下取整为 199
    expect(calculateAvailableMinutes(values('1', '200', '0', '1.0000000000025', '0'))).toBe(
      199n,
    );
  });

  it('超大有限数值精确计算，不会溢出为 Infinity', () => {
    // 1e308 × 1e308 ÷ 1 = 1e616（双精度下为 Infinity）
    expect(calculateAvailableMinutes(values('1e308', '1e308', '0', '1', '0'))).toBe(
      10n ** 616n,
    );
  });

  it('保留压力等于当前压力时可用 0 分钟', () => {
    expect(calculateAvailableMinutes(values('10', '80', '80', '5', '0'))).toBe(0n);
  });
});

describe('calculate（放行判定）', () => {
  // 可用 200 分钟
  const base = { cylinderConstant: '10', currentPressure: '150', reservePressure: '50', flowRate: '5' };
  const baseValues = (minimum: string) =>
    values(base.cylinderConstant, base.currentPressure, base.reservePressure, base.flowRate, minimum);

  it('可用分钟数大于最低保障时放行并给出整数余量', () => {
    const result = calculate(baseValues('120'));
    expect(result.availableMinutes).toBe(200n);
    expect(result.released).toBe(true);
    expect(result.marginMinutes).toBe(80n);
  });

  it('可用分钟数恰好等于最低保障时放行，余量为 0', () => {
    const result = calculate(baseValues('200'));
    expect(result.released).toBe(true);
    expect(result.marginMinutes).toBe(0n);
  });

  it('差 1 分钟时不放行并给出整数短缺', () => {
    const result = calculate(baseValues('201'));
    expect(result.released).toBe(false);
    expect(result.marginMinutes).toBe(-1n);
  });

  it('最低保障为 0 时总是放行', () => {
    const result = calculate(baseValues('0'));
    expect(result.released).toBe(true);
    expect(result.marginMinutes).toBe(200n);
  });

  it('可用 0 分钟且需要保障时不放行', () => {
    const result = calculate(values('10', '50', '50', '5', '1'));
    expect(result.availableMinutes).toBe(0n);
    expect(result.released).toBe(false);
    expect(result.marginMinutes).toBe(-1n);
  });

  it('小数保障时长：余量向下取整（保守，不报高）', () => {
    // 可用 30 分钟，保障 29.5 → 放行，真实余量 0.5 → 显示 0
    const result = calculate(values('3', '10', '0', '1', '29.5'));
    expect(result.availableMinutes).toBe(30n);
    expect(result.released).toBe(true);
    expect(result.marginMinutes).toBe(0n);
  });

  it('小数保障时长：短缺向上取整（保守，不报低）', () => {
    // 可用 29 分钟，保障 29.5 → 不放行，真实短缺 0.5 → 显示 1
    const result = calculate(values('2.9', '10', '0', '1', '29.5'));
    expect(result.availableMinutes).toBe(29n);
    expect(result.released).toBe(false);
    expect(result.marginMinutes).toBe(-1n);
  });

  it('超大有限数值：精确放行且余量为精确整数', () => {
    const result = calculate(values('1e308', '1e308', '0', '1', '1'));
    expect(result.availableMinutes).toBe(10n ** 616n);
    expect(result.released).toBe(true);
    expect(result.marginMinutes).toBe(10n ** 616n - 1n);
  });
});

describe('formatRational', () => {
  it('精确格式化并去除多余尾零', () => {
    expect(formatRational({ num: 200n, den: 1n })).toBe('200');
    expect(formatRational({ num: 295n, den: 10n })).toBe('29.5');
    expect(formatRational({ num: 50n, den: 100n })).toBe('0.5');
    expect(formatRational({ num: 1n, den: 100n })).toBe('0.01');
    expect(formatRational(parseDecimal('1e3')!)).toBe('1000');
    expect(formatRational(parseDecimal('29.50')!)).toBe('29.5');
  });
});
