#!/usr/bin/env python3
import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

T = {
  'ko': { 'Graphics': {
    'title': '⚙️ 그래픽 설정',
    'preset': '프리셋',
    'presetLow': '낮음', 'presetMedium': '중간', 'presetHigh': '높음', 'presetUltra': '최상',
    'shadow': '그림자', 'shadowSize': '그림자 품질',
    'antialias': '안티앨리어싱',
    'pixelRatio': '렌더 해상도',
    'farClip': '시야 거리',
    'on': '켬', 'off': '끔',
    'shadowOff': '끔', 'shadowLow': '저', 'shadowMid': '중', 'shadowHigh': '고', 'shadowUltra': '최고',
    'reset': '기본값',
  } },
  'en': { 'Graphics': {
    'title': '⚙️ Graphics',
    'preset': 'Preset',
    'presetLow': 'Low', 'presetMedium': 'Medium', 'presetHigh': 'High', 'presetUltra': 'Ultra',
    'shadow': 'Shadow', 'shadowSize': 'Shadow Quality',
    'antialias': 'Antialiasing',
    'pixelRatio': 'Render Resolution',
    'farClip': 'View Distance',
    'on': 'On', 'off': 'Off',
    'shadowOff': 'Off', 'shadowLow': 'Low', 'shadowMid': 'Mid', 'shadowHigh': 'High', 'shadowUltra': 'Ultra',
    'reset': 'Reset',
  } },
  'ja': { 'Graphics': {
    'title': '⚙️ グラフィック設定',
    'preset': 'プリセット',
    'presetLow': '低', 'presetMedium': '中', 'presetHigh': '高', 'presetUltra': '最高',
    'shadow': '影', 'shadowSize': '影の品質',
    'antialias': 'アンチエイリアス',
    'pixelRatio': 'レンダー解像度',
    'farClip': '視野距離',
    'on': 'オン', 'off': 'オフ',
    'shadowOff': 'オフ', 'shadowLow': '低', 'shadowMid': '中', 'shadowHigh': '高', 'shadowUltra': '最高',
    'reset': 'リセット',
  } },
  'zh': { 'Graphics': {
    'title': '⚙️ 图形设置',
    'preset': '预设',
    'presetLow': '低', 'presetMedium': '中', 'presetHigh': '高', 'presetUltra': '极高',
    'shadow': '阴影', 'shadowSize': '阴影质量',
    'antialias': '抗锯齿',
    'pixelRatio': '渲染分辨率',
    'farClip': '视野距离',
    'on': '开', 'off': '关',
    'shadowOff': '关', 'shadowLow': '低', 'shadowMid': '中', 'shadowHigh': '高', 'shadowUltra': '极高',
    'reset': '重置',
  } },
}
for lang, sections in T.items():
    path = f'messages/{lang}.json'
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    for section, keys in sections.items():
        data.setdefault(section, {}).update(keys)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'[OK] {path}')
