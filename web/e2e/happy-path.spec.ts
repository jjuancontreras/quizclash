import { test, expect, type Browser } from '@playwright/test';

async function joinAsNewPlayer(browser: Browser, name: string) {
  const context = await browser.newContext(); // separate session = separate player identity
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel(/name/i).fill(name);
  await page.getByRole('img').first().click();
  return { context, page };
}

test('two players can join, and the host reaches the lobby with both seated', async ({ browser }) => {
  const host = await joinAsNewPlayer(browser, 'Host');
  await host.page.getByRole('button', { name: /create lobby/i }).click();
  await expect(host.page.getByText(/[A-Z0-9]{4}/)).toBeVisible({ timeout: 10_000 });

  const lobbyCode = await host.page.getByText(/^[A-Z0-9]{4}$/).textContent();
  expect(lobbyCode).not.toBeNull();

  const guest = await joinAsNewPlayer(browser, 'Guest');
  await guest.page.getByLabel(/lobby code/i).fill(lobbyCode!);
  await guest.page.getByRole('button', { name: /^join$/i }).click();

  await expect(host.page.getByText('Guest')).toBeVisible({ timeout: 10_000 });
  await expect(guest.page.getByText('Host')).toBeVisible({ timeout: 10_000 });

  await host.context.close();
  await guest.context.close();
});
