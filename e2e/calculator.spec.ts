import { expect, test, type Page } from '@playwright/test';

async function fillValidForm(page: Page) {
  await page.getByTestId('field-cylinderConstant').fill('10');
  await page.getByTestId('field-currentPressure').fill('150');
  await page.getByTestId('field-reservePressure').fill('50');
  await page.getByTestId('field-flowRate').fill('5');
  await page.getByTestId('field-minimumMinutes').fill('120');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('输入合法参数后计算并放行，显示整数余量', async ({ page }) => {
  await fillValidForm(page);
  await page.getByTestId('calculate-button').click();

  // 10 × (150 − 50) ÷ 5 = 200 分钟，余量 200 − 120 = 80 分钟
  await expect(page.getByTestId('verdict-status')).toHaveText('放行');
  await expect(page.getByTestId('verdict-detail')).toContainText('可用 200 分钟');
  await expect(page.getByTestId('verdict-detail')).toContainText('余量 80 分钟');
});

test('可用分钟数向下取整，不足时不放行并显示整数短缺', async ({ page }) => {
  await page.getByTestId('field-cylinderConstant').fill('10');
  await page.getByTestId('field-currentPressure').fill('150');
  await page.getByTestId('field-reservePressure').fill('50');
  await page.getByTestId('field-flowRate').fill('3');
  await page.getByTestId('field-minimumMinutes').fill('334');
  await page.getByTestId('calculate-button').click();

  // 10 × 100 ÷ 3 = 333.33… → 333 分钟，短缺 1 分钟
  await expect(page.getByTestId('verdict-status')).toHaveText('不放行');
  await expect(page.getByTestId('verdict-detail')).toContainText('可用 333 分钟');
  await expect(page.getByTestId('verdict-detail')).toContainText('短缺 1 分钟');
});

test('生成结果后修改字段立即标记为待重新计算，旧结论不再展示', async ({ page }) => {
  await fillValidForm(page);
  await page.getByTestId('calculate-button').click();
  await expect(page.getByTestId('verdict-status')).toHaveText('放行');

  // 修改任意字段：旧结论必须立即隐藏，出现待重新计算提示
  await page.getByTestId('field-flowRate').fill('8');
  await expect(page.getByTestId('verdict')).toHaveCount(0);
  await expect(page.getByTestId('pending-hint')).toHaveText('参数已修改，待重新计算。');

  // 重新计算后展示与新参数对应的结论：10 × 100 ÷ 8 = 125 分钟，余量 5 分钟
  await page.getByTestId('calculate-button').click();
  await expect(page.getByTestId('verdict-status')).toHaveText('放行');
  await expect(page.getByTestId('verdict-detail')).toContainText('可用 125 分钟');
  await expect(page.getByTestId('verdict-detail')).toContainText('余量 5 分钟');
});

test('非法输入阻止计算并清除旧结论', async ({ page }) => {
  await fillValidForm(page);
  await page.getByTestId('calculate-button').click();
  await expect(page.getByTestId('verdict-status')).toHaveText('放行');

  // 保留压力高于当前压力：非法
  await page.getByTestId('field-reservePressure').fill('200');
  await expect(page.getByTestId('error-reservePressure')).toHaveText(
    '保留压力不得高于当前压力',
  );
  await expect(page.getByTestId('calculate-button')).toBeDisabled();
  await expect(page.getByTestId('verdict')).toHaveCount(0);

  // 修正后必须重新计算才会出现结论
  await page.getByTestId('field-reservePressure').fill('50');
  await expect(page.getByTestId('calculate-button')).toBeEnabled();
  await expect(page.getByTestId('verdict')).toHaveCount(0);
  await expect(page.getByTestId('pending-hint')).toBeVisible();

  await page.getByTestId('calculate-button').click();
  await expect(page.getByTestId('verdict-status')).toHaveText('放行');
});

const invalidCases: Array<[string, string, string]> = [
  ['cylinderConstant', '0', '瓶常数必须大于 0'],
  ['flowRate', '0', '流量必须大于 0'],
  ['currentPressure', '-1', '须为有限的非负数字'],
  ['minimumMinutes', 'abc', '须为有限的非负数字'],
];

for (const [name, value, message] of invalidCases) {
  test(`非法字段 ${name}=${value} 时显示错误且禁止计算`, async ({ page }) => {
    await fillValidForm(page);
    await page.getByTestId(`field-${name}`).fill(value);
    await page.getByTestId(`field-${name}`).blur();

    await expect(page.getByTestId(`error-${name}`)).toHaveText(message);
    await expect(page.getByTestId('calculate-button')).toBeDisabled();
    await expect(page.getByTestId('verdict')).toHaveCount(0);
  });
}
