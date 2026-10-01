"""Build a captioned demo from screenshots captured during real UI interactions.

Requires Pillow and an FFmpeg executable. No financial data or AI output is
synthesized here. The resulting video is an edited walkthrough, not raw footage.
"""

from __future__ import annotations

import argparse
import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


SCENES = [
    ("01_analysis.png", "01 / 正常研究任务", "构造样例 · 事实、推断、未知分层", "用户：个人投资者 / 初级研究员"),
    ("02_evidence.png", "02 / 证据可回溯", "原文、发布时间、时点、单位与口径", "点击 [E1] 查看原字段"),
    ("03_missing.png", "03 / 原文缺失", "事实卡暂停发布，任务标为部分完成", "缺一手来源时不补造事实"),
    ("04_conflict.png", "04 / 数据冲突", "保留冲突记录，等待核对同口径数据", "冲突不静默通过"),
    ("05_failure.png", "05 / 接口失败", "保留已获证据，撤回依赖失败接口的结论", "失败阶段可在轨迹中定位"),
    ("06_stale.png", "06 / 数据过期", "过期行情不能支撑当前市场判断", "时效校验是发布门禁"),
    ("07_tracking_before.png", "07 / 待核查动作", "默认不执行，由用户决定是否跟踪", "研究任务延伸到后续验证"),
    ("08_tracking_after.png", "08 / 人工确认", "确认数 0 → 1；仅浏览器本地保存", "不自动交易、不自动推送"),
    ("09_custom_boundary.png", "09 / 合规拦截", "拒绝确定性涨跌与直接买入价", "转向事实、条件和风险研究"),
    ("10_custom_needs_evidence.png", "10 / 自定义事件", "无授权来源时进入等待证据状态", "不虚构真实公司事实"),
    ("01_analysis.png", "11 / 当前边界与下一步", "本版未接入 LLM 或实时金融数据", "以可信任务完成率验证下一版"),
]
SCENE_SECONDS = [10, 12, 10, 10, 11, 9, 9, 9, 10, 10, 11]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc")
    return ImageFont.truetype(str(path), size)


def wrap(draw: ImageDraw.ImageDraw, value: str, max_width: int, use_font: ImageFont.FreeTypeFont) -> list[str]:
    lines: list[str] = []
    current = ""
    for char in value:
        candidate = current + char
        if current and draw.textlength(candidate, font=use_font) > max_width:
            lines.append(current)
            current = char
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def make_slide(image_path: Path, title: str, message: str, note: str, index: int, output: Path) -> None:
    width, height = 1920, 1080
    slide = Image.new("RGB", (width, height), "#071724")
    source = Image.open(image_path).convert("RGB")
    scale = min(1208 / source.width, 1030 / source.height)
    size = (math.floor(source.width * scale), math.floor(source.height * scale))
    source = source.resize(size, Image.Resampling.LANCZOS)
    slide.paste(source, (34, (height - size[1]) // 2))
    draw = ImageDraw.Draw(slide)
    draw.rounded_rectangle((1272, 30, 1884, 1050), radius=30, fill="#102b3a", outline="#24516a", width=2)
    draw.text((1320, 84), "EVENTLENS  /  AIME TAKE-HOME", font=font(23, True), fill="#4ee0d2")
    draw.line((1320, 132, 1836, 132), fill="#2d5967", width=2)
    y = 184
    for line in wrap(draw, title, 510, font(40, True)):
        draw.text((1320, y), line, font=font(40, True), fill="#f5fbff")
        y += 65
    y += 40
    for line in wrap(draw, message, 500, font(32)):
        draw.text((1320, y), line, font=font(32), fill="#d9edf5")
        y += 54
    y += 38
    for line in wrap(draw, note, 500, font(26)):
        draw.text((1320, y), line, font=font(26), fill="#65ddd0")
        y += 46
    draw.line((1320, 897, 1836, 897), fill="#2d5967", width=2)
    draw.text((1320, 925), "真实产品操作状态截图 · 剪辑演示", font=font(23), fill="#9fb8c7")
    draw.text((1320, 968), "构造数据 / 非实时 / 不构成投资建议", font=font(21), fill="#d7ad62")
    draw.rounded_rectangle((1320, 1010, 1836, 1018), radius=4, fill="#21434d")
    draw.rounded_rectangle((1320, 1010, 1320 + round(516 * (index + 1) / len(SCENES)), 1018), radius=4, fill="#4ee0d2")
    slide.save(output, optimize=True)


def build(args: argparse.Namespace) -> None:
    frames_dir = Path(args.frames)
    work = Path(args.work)
    work.mkdir(parents=True, exist_ok=True)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    concat_lines: list[str] = []
    for i, ((name, title, message, note), seconds) in enumerate(zip(SCENES, SCENE_SECONDS), start=1):
        slide = work / f"slide_{i:02}.png"
        make_slide(frames_dir / name, title, message, note, i - 1, slide)
        concat_lines.extend((f"file '{slide.as_posix()}'", f"duration {seconds}"))
    concat_lines.append(f"file '{slide.as_posix()}'")
    concat_file = work / "slides.txt"
    concat_file.write_text("\n".join(concat_lines) + "\n", encoding="utf-8")
    total = sum(SCENE_SECONDS)
    if not 60 <= total <= 180:
        raise ValueError(f"Video duration {total:.1f}s is outside the required 60–180s")
    cmd = [str(args.ffmpeg), "-y", "-f", "concat", "-safe", "0", "-i", str(concat_file), "-f", "lavfi", "-t", str(total), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100", "-r", "24", "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k", "-shortest", "-movflags", "+faststart", str(output)]
    subprocess.run(cmd, check=True)
    print(f"OUTPUT={output}")
    print(f"SLIDE_DURATION_TARGET_SECONDS={total:.2f}")
    print("Inspect the encoded MP4 separately for its exact playback duration.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--frames", required=True)
    parser.add_argument("--work", required=True)
    parser.add_argument("--ffmpeg", required=True)
    parser.add_argument("--output", required=True)
    build(parser.parse_args())

