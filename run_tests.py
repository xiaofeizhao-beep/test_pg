#!/usr/bin/env python
"""
run_tests.py — pytest 运行入口。

用法:
  python run_tests.py                # 运行全部测试（无头模式）
  python run_tests.py --no-headless   # 有头模式
  python run_tests.py -m login        # 仅运行登录相关测试
  python run_tests.py -k test_login_success  # 运行指定测试
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import pytest
from portal_utils.cli import log


def main():
    # 解析简单参数
    headless = True
    pytest_args = []

    for arg in sys.argv[1:]:
        if arg == "--no-headless":
            headless = False
        else:
            pytest_args.append(arg)

    os.environ["HEADLESS"] = "false" if not headless else "true"

    log(f"Running tests: headless={headless}")

    exit_code = pytest.main(["-v", "tests"] + pytest_args)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
