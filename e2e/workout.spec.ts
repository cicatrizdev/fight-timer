import { expect, test, type Page } from '@playwright/test'

// Two short blocks: 1×4s round with 2s/2s hard-easy cycling, rest 2s, then
// 1×3s round. Warmup 2s. Total ≈ 11s.
const CONFIG = {
  state: {
    warmupSec: 2,
    roundWarnSec: 2,
    restWarnSec: 0,
    countdownBeeps: false,
    tts: false,
    ttsVoice: null,
    vibrate: false,
    blocks: [
      { id: 'b1', rounds: 1, roundSec: 4, restSec: 2, cycleEnabled: true, workSec: 2, easeSec: 2 },
      { id: 'b2', rounds: 1, roundSec: 3, restSec: 2, cycleEnabled: false, workSec: 30, easeSec: 15 },
    ],
    userPresets: [],
  },
  version: 4,
}

async function openWithConfig(page: Page) {
  await page.goto('/')
  await page.evaluate((cfg) => {
    localStorage.clear()
    localStorage.setItem('fight-timer-config', JSON.stringify(cfg))
    localStorage.setItem('i18nextLng', 'pt-BR')
  }, CONFIG)
  await page.reload()
}

const startButton = (page: Page) => page.getByRole('button', { name: 'COMEÇAR' })

test('full workout cycle: warmup → rounds/blocks → finished', async ({ page }) => {
  await openWithConfig(page)

  await expect(page.locator('.settings__summary')).toContainText('2 rounds')

  await startButton(page).click()
  await expect(page.locator('.timer--warmup')).toBeVisible()
  await expect(page.locator('.timer__phase')).toHaveText('AQUECIMENTO')

  // Block 1 round with hard/easy badge.
  await expect(page.locator('.timer--round')).toBeVisible({ timeout: 5000 })
  await expect(page.locator('.timer__phase')).toHaveText('ROUND 1/2')
  await expect(page.locator('.timer__cycle')).toBeVisible()

  await expect(page.locator('.timer--rest')).toBeVisible({ timeout: 7000 })

  // Block 2 round has no cycling badge.
  await expect(page.locator('.timer--round')).toBeVisible({ timeout: 5000 })
  await expect(page.locator('.timer__phase')).toHaveText('ROUND 2/2')
  await expect(page.locator('.timer__cycle')).toHaveCount(0)

  await expect(page.locator('.timer__finished h1')).toBeVisible({ timeout: 6000 })
  await expect(page.locator('.timer__stats')).toContainText('2')
})

test('exit asks for confirmation while running', async ({ page }) => {
  await openWithConfig(page)
  await startButton(page).click()
  await expect(page.locator('.timer--warmup')).toBeVisible()

  // Dismiss → stays in the workout.
  page.once('dialog', (d) => d.dismiss())
  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page.locator('.timer')).toBeVisible()

  // Accept → back to settings.
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(startButton(page)).toBeVisible()
})

test('running workout survives a page reload', async ({ page }) => {
  await openWithConfig(page)
  await startButton(page).click()
  await expect(page.locator('.timer--warmup')).toBeVisible()

  await page.reload()

  // Still in the workout (whatever phase time has reached), not settings.
  await expect(page.locator('.timer')).toBeVisible()
  await expect(startButton(page)).toHaveCount(0)

  // And it keeps progressing to the end without another interaction.
  await expect(page.locator('.timer__finished h1')).toBeVisible({ timeout: 15_000 })
})

test('pause survives a page reload', async ({ page }) => {
  await openWithConfig(page)
  await startButton(page).click()
  await expect(page.locator('.timer--warmup')).toBeVisible()
  await page.locator('.timer__main').click()
  await expect(page.locator('.timer__hint')).toContainText('PAUSADO')

  await page.reload()
  await expect(page.locator('.timer__hint')).toContainText('PAUSADO')
})
