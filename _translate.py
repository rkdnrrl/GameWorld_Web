#!/usr/bin/env python3
import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

T = {
  'ko': { 'Graphics': {
    'shadowFilter': '그림자 필터',
    'shadowFilterBasic': '하드',
    'shadowFilterPCF': '소프트',
    'shadowFilterPCFSoft': '매우 소프트',
    'shadowSoftness': '그림자 부드러움',
  } },
  'en': { 'Graphics': {
    'shadowFilter': 'Shadow Filter',
    'shadowFilterBasic': 'Hard',
    'shadowFilterPCF': 'Soft',
    'shadowFilterPCFSoft': 'Very Soft',
    'shadowSoftness': 'Shadow Softness',
  } },
  'ja': { 'Graphics': {
    'shadowFilter': '影フィルター',
    'shadowFilterBasic': 'ハード',
    'shadowFilterPCF': 'ソフト',
    'shadowFilterPCFSoft': '非常にソフト',
    'shadowSoftness': '影の柔らかさ',
  } },
  'zh': { 'Graphics': {
    'shadowFilter': '阴影过滤',
    'shadowFilterBasic': '硬',
    'shadowFilterPCF': '柔和',
    'shadowFilterPCFSoft': '非常柔和',
    'shadowSoftness': '阴影柔和度',
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
