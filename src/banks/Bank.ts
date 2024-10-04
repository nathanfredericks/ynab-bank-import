import { BrowserContext, Page } from "playwright";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { z } from "zod";
import { logger } from "../utils.js";
import { Account } from "./types.js";

export class Bank {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  protected date = new Date();
  private accounts: z.infer<typeof Account>[] = [];

  protected async launchBrowser(enableStealthMode = false) {
    if (enableStealthMode) {
      logger.debug("Launching browser in stealth mode");
      chromium.use(StealthPlugin());
    } else {
      logger.debug("Launching browser");
    }
    const browser = await chromium.launch({
      headless: process.env.NODE_ENV === "production",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
      ],
    });
    logger.debug("Creating new context");
    this.context = await browser.newContext();
    await this.startTracing();
    logger.debug("Creating new page");
    this.page = await this.context.newPage();
  }

  protected async closeBrowser(tracingFilePath?: string) {
    await this.stopTracing(tracingFilePath);
    logger.debug("Closing browser");
    await this.page?.context().browser()?.close();
    this.page = null;
  }

  protected async startTracing() {
    logger.debug("Starting tracing");
    await this.context?.tracing.start({ screenshots: true, snapshots: true });
  }

  protected async stopTracing(filePath?: string) {
    logger.debug("Stopping tracing");
    await this.context?.tracing.stop({ path: filePath });
  }

  protected async getPage() {
    if (!this.page) {
      throw new Error("Page is not initialized");
    }
    return this.page;
  }

  public getAccounts() {
    return this.accounts;
  }

  protected setAccounts(accounts: z.infer<typeof Account>[]) {
    this.accounts = accounts;
  }
}
