#!/usr/bin/env python3
import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

T = {
  'ko': { 'Graphics': { 'remoteShadows': '다른 플레이어 그림자' } },
  'en': { 'Graphics': { 'remoteShadows': 'Other Players Shadows' } },
  'ja': { 'Graphics': { 'remoteShadows': '他のプレイヤーの影' } },
  'zh': { 'Graphics': { 'remoteShadows': '其他玩家阴影' } },
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
