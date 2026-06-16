"""
快照解析模块 — 零硬编码元素发现。

解析 playwright-cli 输出的 YAML 格式 accessibility snapshot，
通过元素的文本标签（而非 ref 编号）动态发现和定位页面元素。

支持中英文等多语言标签匹配。
"""
import re
from typing import Any, Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Constants — 多语言元素标签模式
# ---------------------------------------------------------------------------

# 邮箱/用户名输入框的标签模式
EMAIL_LABELS = [
    "邮箱或电话号码",       # 中文 Google 登录页
    "电子邮件地址",
    "email",
    "work email",           # portal 登录页
    "username",
    "identifier",
    "name@company.com",     # portal 邮箱输入框 placeholder
]

# 密码输入框的标签模式
PASSWORD_LABELS = [
    "输入密码",              # 中文 Google 密码页
    "password",
    "••••",                  # 密码框掩码字符
    "••••••••",
]

# 登录/提交按钮的标签模式
SUBMIT_LABELS = [
    "enter unitpulse",      # portal 登录按钮
    "下一步",                # 中文 Google 下一步
    "next",
    "登录",                  # 中文 Google 登录
    "sign in",
    "continue",
    "submit",
    "log in",
    "sign in with google",
]

# Google SSO 按钮标签
GOOGLE_SSO_LABELS = [
    "continue with google",
    "使用 google 继续",
    "sign in with google",
]

# OAuth 同意/授权按钮
CONSENT_LABELS = [
    "allow",
    "允许",
    "continue",
    "继续",
]


# ---------------------------------------------------------------------------
# Regex patterns for parsing YAML snapshots
# ---------------------------------------------------------------------------

# 匹配 "[ref=e28]" 或 "[ref=e28] [cursor=pointer]"
_REF_PATTERN = re.compile(r"\[ref=([^\]]+)\]")

# 匹配元素行：  - type "label" [ref=...]
#   type 可以是: button, textbox, link, combobox, checkbox, heading, generic, img 等
_ELEMENT_LINE = re.compile(
    r'^\s*-\s+(button|textbox|link|combobox|checkbox|heading|img|generic)\s+"([^"]*)"'
)

# 匹配纯文本行：  - text: xxx
_TEXT_LINE = re.compile(r"^\s*-\s*text:\s*(.+)")


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

class Element:
    """A parsed snapshot element."""

    __slots__ = ("type", "label", "ref", "line")

    def __init__(self, element_type: str, label: str, ref: str, line: str = ""):
        self.type = element_type
        self.label = label
        self.ref = ref
        self.line = line

    def __repr__(self) -> str:
        return f"Element(type={self.type!r}, label={self.label!r}, ref={self.ref!r})"

    def to_dict(self) -> Dict[str, str]:
        return {"type": self.type, "label": self.label, "ref": self.ref}


class Snapshot:
    """Parsed page snapshot containing all discoverable elements."""

    def __init__(self, raw_text: str, elements: List[Element]):
        self.raw_text = raw_text
        self.elements = elements
        self._label_index: Dict[str, Element] = {}
        for el in elements:
            key = el.label.lower()
            # If duplicate label, keep the first one (it's usually higher in the tree)
            if key not in self._label_index:
                self._label_index[key] = el

    def __len__(self) -> int:
        return len(self.elements)

    def __repr__(self) -> str:
        return f"Snapshot({len(self.elements)} elements)"

    # -- Finder methods -------------------------------------------------------

    def find_by_label(
        self,
        patterns: List[str],
        element_type: Optional[str] = None,
    ) -> Optional[Element]:
        """根据标签模式列表查找元素。

        Args:
            patterns: 标签模式列表（大小写不敏感，子串匹配）。
            element_type: 可选，限定元素类型（如 'textbox', 'button'）。

        Returns:
            第一个匹配的 Element，找不到返回 None。
        """
        for pattern in patterns:
            pat_lower = pattern.lower()
            for el in self.elements:
                if element_type and el.type != element_type:
                    continue
                if pat_lower in el.label.lower():
                    return el
        return None

    def find_textbox(self, patterns: List[str]) -> Optional[Element]:
        """查找 textbox 元素。"""
        return self.find_by_label(patterns, element_type="textbox")

    def find_button(self, patterns: List[str]) -> Optional[Element]:
        """查找 button 元素。"""
        return self.find_by_label(patterns, element_type="button")

    def find_link(self, patterns: List[str]) -> Optional[Element]:
        """查找 link 元素。"""
        return self.find_by_label(patterns, element_type="link")

    def contains_text(self, text: str) -> bool:
        """检查快照原始文本中是否包含指定文本。"""
        return text.lower() in self.raw_text.lower()

    def contains_url(self, domain: str) -> bool:
        """检查快照中是否包含指定域名。"""
        return domain in self.raw_text


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

def parse_snapshot(raw_text: str) -> Snapshot:
    """Parse a playwright-cli YAML snapshot into a Snapshot object.

    Extracts all elements with refs, indexed by label for fast lookup.
    """
    elements: List[Element] = []

    for line in raw_text.split("\n"):
        m = _ELEMENT_LINE.search(line)
        if not m:
            continue

        element_type = m.group(1)
        label = m.group(2)

        ref_match = _REF_PATTERN.search(line)
        ref = ref_match.group(1) if ref_match else ""

        elements.append(Element(
            element_type=element_type,
            label=label,
            ref=ref,
            line=line.strip(),
        ))

    return Snapshot(raw_text, elements)


def parse_snapshot_from_cli_output(cli_output: str) -> Snapshot:
    """Parse a snapshot from the full playwright-cli output (which may include
    page URL, title, and other metadata before the YAML snapshot).

    Strips leading metadata lines that start with '- Page URL:' or '- Page Title:'.
    """
    lines = cli_output.split("\n")
    snapshot_lines: List[str] = []
    in_snapshot = False

    for line in lines:
        if line.startswith("- ") and not line.startswith("- Page "):
            in_snapshot = True
        if in_snapshot:
            snapshot_lines.append(line)

    return parse_snapshot("\n".join(snapshot_lines))
