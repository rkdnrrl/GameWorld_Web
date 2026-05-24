#!/usr/bin/env python3
import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

T = {
  'ko': { 'Character': { 'trimStart': '시작', 'trimEnd': '끝', 'trimSec': '초', 'trimFull': '전체' } },
  'en': { 'Character': { 'trimStart': 'Start', 'trimEnd': 'End',  'trimSec': 's',  'trimFull': 'Full' } },
  'ja': { 'Character': { 'trimStart': '開始', 'trimEnd': '終了', 'trimSec': '秒', 'trimFull': '全体' } },
  'zh': { 'Character': { 'trimStart': '开始', 'trimEnd': '结束', 'trimSec': '秒', 'trimFull': '全部' } },
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
