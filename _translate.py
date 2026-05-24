#!/usr/bin/env python3
import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

T = {
  'ko': {
    'Character': {
      'runAnimLabel':    '달릴 때 (Run)',
      'jumpAnimLabel':   '점프 (Jump)',
      'crouchAnimLabel': '앉기 (Crouch)',
      'proneAnimLabel':  '엎드리기 (Prone)',
      'previewLabel':    '미리보기',
    },
    'World': {
      'controlHint': '클릭하여 마우스 잠금 | WASD 이동 | Shift 달리기 | Space 점프 | C 앉기 | Z 엎드리기 | ESC 해제',
    },
  },
  'en': {
    'Character': {
      'runAnimLabel':    'When running (Run)',
      'jumpAnimLabel':   'Jump',
      'crouchAnimLabel': 'Crouch',
      'proneAnimLabel':  'Prone',
      'previewLabel':    'Preview',
    },
    'World': {
      'controlHint': 'Click to lock mouse | WASD move | Shift sprint | Space jump | C crouch | Z prone | ESC release',
    },
  },
  'ja': {
    'Character': {
      'runAnimLabel':    '走る時 (Run)',
      'jumpAnimLabel':   'ジャンプ (Jump)',
      'crouchAnimLabel': 'しゃがむ (Crouch)',
      'proneAnimLabel':  '伏せる (Prone)',
      'previewLabel':    'プレビュー',
    },
    'World': {
      'controlHint': 'クリックでマウスロック | WASD 移動 | Shift 走る | Space ジャンプ | C しゃがむ | Z 伏せる | ESC 解除',
    },
  },
  'zh': {
    'Character': {
      'runAnimLabel':    '奔跑时 (Run)',
      'jumpAnimLabel':   '跳跃 (Jump)',
      'crouchAnimLabel': '蹲下 (Crouch)',
      'proneAnimLabel':  '匍匐 (Prone)',
      'previewLabel':    '预览',
    },
    'World': {
      'controlHint': '点击锁定鼠标 | WASD 移动 | Shift 奔跑 | Space 跳跃 | C 蹲下 | Z 匍匐 | ESC 解除',
    },
  },
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
