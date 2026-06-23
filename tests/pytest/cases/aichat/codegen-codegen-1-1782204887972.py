import re
from playwright.sync_api import Page, expect


def test_example(page: Page) -> None:
    page.goto("https://website-dev.unitpulse.ai/")
    page.get_by_test_id("composer-location").click()
    page.get_by_role("option", name="Arcadia").click()
    page.get_by_test_id("composer-beds").click()
    page.get_by_role("option", name="2 beds").click()
    page.get_by_test_id("composer-budget").click()
    page.get_by_role("option", name="$3,000 – $").click()
    page.get_by_test_id("composer-movein").click()
    page.get_by_role("option", name="–2 months").click()
    page.get_by_test_id("composer-search").click()
