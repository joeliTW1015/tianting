import { expect, test, type Page } from '@playwright/test';

let eventShots = 0;

async function endTurn(page: Page) {
  await page.getByTestId('end-turn').click();
  const t = page.getByTestId('transition');
  if (await t.isVisible().catch(() => false)) await t.click({ force: true }).catch(() => {});
  // 依序關閉事件彈窗（前幾則截圖存證）
  for (let k = 0; k < 12; k++) {
    const modal = page.getByTestId('event-modal');
    if (!(await modal.isVisible().catch(() => false))) break;
    if (eventShots < 4) {
      await page.waitForTimeout(400);
      await page.screenshot({ path: `e2e/shots/10-event-${++eventShots}.png` });
    }
    await page.getByTestId('event-next').click();
  }
}

test('完整玩一局：開局、政務、細讀、硃批、下旨、召見、心證、推進到史書', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('.seed-row input').fill('測試二');
  await page.screenshot({ path: 'e2e/shots/01-start.png' });

  await page.locator('.perk').first().click();
  await page.getByTestId('ascend').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'e2e/shots/02-transition.png' });
  await page.getByTestId('transition').click({ force: true });
  await expect(page.locator('.topbar')).toBeVisible();
  await page.screenshot({ path: 'e2e/shots/03-desk.png' });

  // 政務：定稅則
  await page.getByTestId('filter-todo').click();
  await page.locator('.item', { hasText: '稅則' }).first().click();
  await page.locator('[data-choice="normal"]').click();
  await page.getByTestId('confirm-choice').click();
  await page.screenshot({ path: 'e2e/shots/04-task.png' });

  // 遣番子密查京師；同一旬不能再下同一道旨
  await page.locator('[data-region="jingshi"]').click({ force: true });
  await page.locator('[data-order="spy"]').first().click();
  await page.getByTestId('confirm-order').click();
  await expect(page.locator('[data-order="spy"]').first()).toBeDisabled();
  await expect(page.locator('[data-order="spy"]').first()).toContainText('本旬已下旨');
  // 召山東巡撫入京（之後會有奉召抵京的彈窗）
  await page.locator('[data-region="shandong"]').click({ force: true });
  await page.locator('[data-order="recall"]').first().click();
  await page.getByTestId('confirm-order').click();

  // 行程：山東巡撫奉召赴京
  await page.getByRole('button', { name: '行程', exact: true }).click();
  await expect(page.locator('.agenda')).toContainText('奉召赴京');
  await page.screenshot({ path: 'e2e/shots/15-agenda.png' });

  // 內廷：消遣、營建
  await page.getByTestId('open-palace').click();
  await page.screenshot({ path: 'e2e/shots/16-palace.png' });
  await page.locator('[data-leisure="calligraphy"]').click();
  await page.locator('[data-tab="build"]').click();
  await page.locator('[data-start="clinic"]').click();
  await page.screenshot({ path: 'e2e/shots/17-build.png' });
  await page.getByRole('button', { name: '退出' }).click();

  // 召見戶部問天下大勢
  await page.getByRole('button', { name: '人物', exact: true }).click();
  await page.locator('[data-summon="hubu"]').click();
  await page.locator('[data-topic="state"]').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'e2e/shots/05-audience.png' });
  await page.getByRole('button', { name: '退下' }).click();

  // 推進；每旬細讀一份新文書、處理一件待辦奏請
  let heldShot = false;
  for (let i = 0; i < 80; i++) {
    if (await page.locator('.chronicle').isVisible()) break;
    await endTurn(page);
    if (await page.locator('.chronicle').isVisible()) break;
    const read = page.getByTestId('read');
    if (await read.isVisible().catch(() => false)) await read.click();
    const follow = page.getByTestId('follow-advice');
    if (i % 2 === 0 && (await follow.isVisible().catch(() => false))) await follow.click();
    const approve = page.getByTestId('approve');
    if (i % 3 === 0 && (await approve.isVisible().catch(() => false))) await approve.click();
    if (i === 14) {
      await page.screenshot({ path: 'e2e/shots/06-midgame.png' });
      await page.getByRole('button', { name: '心證', exact: true }).click();
      const opt = page.locator('[data-belief]').first();
      if (await opt.isVisible().catch(() => false)) await opt.click();
      await page.screenshot({ path: 'e2e/shots/07-beliefs.png' });
      await page.getByRole('button', { name: '地方', exact: true }).click();
    }
    if (i === 30) {
      await page.screenshot({ path: 'e2e/shots/08-later.png' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
    if (i === 18) {
      await page.getByTestId('open-foreign').click();
      await page.screenshot({ path: 'e2e/shots/18-foreign.png' });
      await page.locator('[data-faction="beilu:envoy"]').click();
      await page.getByTestId('foreign').getByRole('button', { name: '闔上' }).click();
    }
    if (i > 8 && !(await page.locator('.held').count().then((n) => n === 0)) && !heldShot) {
      heldShot = true;
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'e2e/shots/19-held.png' });
    }
    if (i === 24) {
      await page.getByTestId('open-finance').click();
      await page.waitForTimeout(200);
      const box = page.getByTestId('finance');
      // 滑過收支柱，顯示明細
      const bars = box.locator('.bar');
      if (await bars.count()) await bars.nth((await bars.count()) - 3).hover();
      await page.screenshot({ path: 'e2e/shots/11-finance-overview.png' });
      await box.locator('[data-tab="regions"]').click();
      await page.screenshot({ path: 'e2e/shots/12-finance-regions.png' });
      await box.locator('[data-tab="outlays"]').click();
      await page.screenshot({ path: 'e2e/shots/13-finance-outlays.png' });
      await box.locator('[data-tab="regions"]').click();
      await box.locator('[data-heat]').first().click();
      await page.getByTestId('map-tax').click();
      await page.waitForTimeout(700);
      await page.screenshot({ path: 'e2e/shots/14-map-tax.png' });
    }
  }
  await expect(page.locator('.chronicle')).toBeVisible();
  await page.screenshot({ path: 'e2e/shots/09-chronicle.png', fullPage: true });

  await page.getByTestId('menu').click();
  await expect(page.locator('.history')).toBeVisible();
  expect(errors).toEqual([]);
  // 版面不可橫向溢出
  await page.getByTestId('continue').isVisible().catch(() => false);
});
