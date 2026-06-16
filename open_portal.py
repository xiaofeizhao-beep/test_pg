#!/usr/bin/env python
"""
open_portal.py — portal_utils 运行入口。

用法:
  python open_portal.py                # 无头模式（默认）
  python open_portal.py --no-headless   # 有头模式（可见浏览器）
  python open_portal.py --url https://...  # 自定义目标 URL

环境变量:
  PORTAL_EMAIL       登录邮箱
  PORTAL_PASSWORD    登录密码
  PORTAL_URL         目标 URL（默认 portal-dev.unitpulse.ai）
  HEADLESS           true/false（默认 true）
"""
import os
import sys
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from portal_utils.login import login
from portal_utils.cli import log


def main():
    parser = argparse.ArgumentParser(
        description="打开 UnitPulse 门户并自动登录"
    )
    parser.add_argument(
        "--no-headless", action="store_true",
        help="禁用无头模式，显示浏览器窗口"
    )
    parser.add_argument(
        "--url",
        default=os.environ.get("PORTAL_URL", "https://portal-dev.unitpulse.ai/messages/prospects"),
        help="目标 URL"
    )
    parser.add_argument(
        "--screenshot", action="store_true",
        help="登录后截屏"
    )
    args = parser.parse_args()

    headless = not args.no_headless and os.environ.get("HEADLESS", "true").lower() not in ("false", "0", "no", "off")

    log(f"headless={headless}")
    log(f"url={args.url}")

    result = login(url=args.url, headless=headless)

    if result.success:
        print(f"\n✅ 登录成功: {result.url}")
    else:
        print(f"\n❌ 登录失败: {result.error}")
        sys.exit(1)

    if args.screenshot:
        from portal_utils.cli import screenshot
        path = screenshot()
        print(f"📸 截图: {path}")


if __name__ == "__main__":
    main()
