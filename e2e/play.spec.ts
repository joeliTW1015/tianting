import { expect, test, type Page } from '@playwright/test';

async function closeEvents(page: Page, shot?: string) {
  for (let k = 0; k < 20; k++) {
    const modal = page.getByTestId('event-modal');
    if (!(await modal.isVisible().catch(() => false))) return;
    if (shot && k === 0) await page.screenshot({ path: shot });
    const choice = page.locator('.event-modal .decision .choice').first();
    if (await choice.isVisible().catch(() => false)) await choice.click();
    await page.getByTestId('event-next').click();
  }
}

test('完整玩一局：序章、擬旨、朝局、兵棋、內廷、外交、戰報、結局幻燈片、史書', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('.seed-row input').fill('測試三');
  await page.locator('[data-diff="hard"]').click();
  await page.screenshot({ path: 'e2e/shots/01-start.png' });
  await page.locator('.perk[data-perk]').first().click();
  await page.getByTestId('ascend').click();

  // 序章幻燈片：看兩張，然後略過
  await expect(page.getByTestId('slideshow')).toBeVisible();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: 'e2e/shots/02-intro-1.png' });
  await page.getByTestId('slideshow').click();
  await page.getByTestId('slideshow').click();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: 'e2e/shots/03-intro-3.png' });
  await page.getByTestId('skip').click();
  await page.getByTestId('transition').click({ force: true }).catch(() => {});
  await expect(page.locator('.topbar')).toBeVisible();
  await page.screenshot({ path: 'e2e/shots/04-desk.png' });
  await page.getByTestId('doc-close').click();
  await page.screenshot({ path: 'e2e/shots/05-map.png' });

  // 擬旨：徵兵
  await page.locator('[data-bar="mil"]').click();
  await page.locator('[data-edict="recruit"]').click();
  await page.getByTestId('edict-target').selectOption('shandong');
  await page.locator('[data-param="5000"]').click();
  await page.screenshot({ path: 'e2e/shots/06-edict.png' });
  await page.getByTestId('issue-edict').click();
  await page.locator('.edict-modal .modal-head .btn').click();

  // 朝局：授權
  await page.getByTestId('open-court').click();
  await page.locator('[data-auth="hubu:ask"]').click();
  await page.screenshot({ path: 'e2e/shots/07-court.png' });
  await page.locator('.court-modal .modal-head .btn').click();

  // 兵棋：點官軍棋子、授方略
  await page.locator('.token').first().click({ force: true });
  await page.locator('[data-card="hold"]').click();
  await page.screenshot({ path: 'e2e/shots/08-army.png' });

  // 內廷：消遣
  await page.getByTestId('open-palace').click();
  await page.locator('[data-leisure="garden"]').click();
  await page.screenshot({ path: 'e2e/shots/09-palace.png' });
  await page.locator('.palace .btn.ghost').last().click();

  // 外交、後宮
  await page.getByTestId('open-foreign').click();
  await page.screenshot({ path: 'e2e/shots/10-foreign.png' });
  await page.locator('.foreign-modal .modal-head .btn').click();
  await page.getByTestId('open-harem').click();
  await page.screenshot({ path: 'e2e/shots/11-harem.png' });
  await page.locator('.harem-modal .modal-head .btn').click();

  // 推進，直到看到一場戰報並觀戰
  let watched = false;
  for (let t = 0; t < 200; t++) {
    if (await page.getByTestId('slideshow').isVisible().catch(() => false)) break;
    await page.getByTestId('end-turn').click();
    const tr = page.getByTestId('transition');
    if (await tr.isVisible().catch(() => false)) await tr.click({ force: true }).catch(() => {});
    if (t === 2) await page.screenshot({ path: 'e2e/shots/12-event.png' });
    if (!watched && (await page.getByTestId('event-battle').isVisible().catch(() => false))) {
      await page.getByTestId('event-battle').click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'e2e/shots/13-battle.png' });
      await page.waitForTimeout(6000);
      await page.screenshot({ path: 'e2e/shots/14-battle-result.png' });
      await page.getByTestId('battle-close').click();
      watched = true;
    }
    if (await page.getByTestId('slideshow').isVisible().catch(() => false)) break;
    await closeEvents(page);
    if (t === 8) {
      await page.getByTestId('map-troops').click();
      await page.screenshot({ path: 'e2e/shots/15-troops.png' });
    }
  }

  // 結局幻燈片 → 史書
  await expect(page.getByTestId('slideshow')).toBeVisible();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: 'e2e/shots/16-ending.png' });
  await page.getByTestId('skip').click();
  await expect(page.getByTestId('menu')).toBeVisible();
  await page.screenshot({ path: 'e2e/shots/17-chronicle.png', fullPage: false });
  expect(errors).toEqual([]);
});
