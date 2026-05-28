'use client';
import { useState } from 'react';

interface MapObjectLike {
  id?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface AiGuideModalProps {
  open: boolean;
  onClose: () => void;
  /** AI 가 준 JSON 을 파싱해 받은 오브젝트 배열을 씬에 적용 */
  onImport: (objects: MapObjectLike[], mode: 'add' | 'replace') => void;
}

// AI 에 전달할 시스템 프롬프트 — 스키마 + API + 규칙
const AI_PROMPT_TEMPLATE = `당신은 ALP 가상 월드 빌더 도우미입니다.
사용자 요청에 따라 3D 씬 오브젝트를 JSON 으로 생성하세요.

# 출력 형식
\`\`\`json
{
  "objects": [
    {
      "kind": "cube",          // cube | sphere | cylinder | plane | pointlight | spotlight | dirlight
      "label": "이름(선택)",
      "position": [0, 0.5, 0], // 미터, y=0 이 지면
      "rotation": [0, 0, 0],   // 라디안
      "scale":    [1, 1, 1],
      "color":    "#888888",   // hex
      "physics":  "fixed",     // none | fixed | dynamic (기본 fixed)

      // 조명일 때:
      "lightColor":     "#ffffff",
      "lightIntensity": 1,
      "lightDistance":  0,     // 0 = 무한
      "lightAngle":     45,    // spot 만, degree

      // 스크립트 (선택):
      "script": "function onUpdate(dt) { self.setRotation(0, world.time, 0); }"
    }
  ]
}
\`\`\`

# 좌표 / 단위
- 위 = +Y, y=0 이 지면
- dynamic (떨어지는) 오브젝트는 y >= 1 부터 시작
- 캐릭터 키 약 1.8m

# 스크립트 API (자체 JS subset)
self.setPosition(x,y,z) / setRotation(rx,ry,rz) / applyImpulse(x,y,z)
self.setVisible(b) / setColor(hex) / setIntensity(n) / destroy()
world.time / getPlayers() / find(idOrLabel) / spawn(opts) / isHost() / runtimeCount()
net.sendAll(event, data) / sendTo(playerId, event, data)
Math.sin / cos / abs / floor / round / random / PI

# 스크립트 이벤트 함수
function onStart() {}      // 호스트가 결정된 후 1회
function onUpdate(dt) {}   // 매 프레임
function onNetEvent(event, data, fromId) {}

# 중요 규칙
1. 출력은 JSON 만 (코드 블록 감싸도 OK), 설명 텍스트 최소화
2. 색상은 hex (#rrggbb)
3. script 안 코드는 ES5 수준 단순 JS (화살표 함수 X, async X, class X)
4. 호스트만 spawn 하려면: if (world.isHost() && world.runtimeCount() === 0) { ... }

# 예시
사용자: "낚시터 4개를 정사각형으로 배치, 가운데 빨간 큐브 회전"
출력:
\`\`\`json
{
  "objects": [
    { "kind":"plane", "position":[-10,0.1,-10], "rotation":[-1.5708,0,0], "scale":[8,8,1], "color":"#60a5fa", "label":"낚시터1" },
    { "kind":"plane", "position":[ 10,0.1,-10], "rotation":[-1.5708,0,0], "scale":[8,8,1], "color":"#60a5fa", "label":"낚시터2" },
    { "kind":"plane", "position":[-10,0.1, 10], "rotation":[-1.5708,0,0], "scale":[8,8,1], "color":"#60a5fa", "label":"낚시터3" },
    { "kind":"plane", "position":[ 10,0.1, 10], "rotation":[-1.5708,0,0], "scale":[8,8,1], "color":"#60a5fa", "label":"낚시터4" },
    { "kind":"cube",  "position":[0,1,0], "scale":[1,1,1], "color":"#ef4444",
      "script":"function onUpdate(dt){ self.setRotation(0, world.time, 0); }" }
  ]
}
\`\`\`

# 사용자 요청
여기에 만들고 싶은 씬을 한국어 또는 영어로 자유롭게 적어주세요. 예:
- "어두운 던전. 횃불 4개, 입구에 보물상자"
- "물리 큐브 10개를 위에서 떨어뜨려"
- "원형 무대. 중앙 스폿라이트, 색이 변하는 큐브"
`;

export default function AiGuideModal({ open, onClose, onImport }: AiGuideModalProps) {
  const [jsonText, setJsonText] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT_TEMPLATE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('클립보드 복사 실패. 직접 선택해서 복사하세요.');
    }
  };

  const handleImport = (mode: 'add' | 'replace') => {
    setError(null);
    try {
      // 마크다운 코드 블록 제거
      const cleaned = jsonText
        .replace(/^```(?:json)?\s*/im, '')
        .replace(/```\s*$/m, '')
        .trim();
      if (!cleaned) {
        setError('붙여넣을 JSON 이 비어 있습니다.');
        return;
      }
      const data = JSON.parse(cleaned);
      const arr: MapObjectLike[] = Array.isArray(data) ? data : (data.objects || []);
      if (!Array.isArray(arr)) {
        setError('JSON 에 objects 배열이 없습니다.');
        return;
      }
      if (arr.length === 0) {
        setError('오브젝트 배열이 비어 있습니다.');
        return;
      }
      // 기본 필드 보강 (AI 가 누락한 경우)
      const normalized = arr.map(o => ({
        kind: o.kind || 'cube',
        position: Array.isArray(o.position) && o.position.length === 3 ? o.position : [0, 1, 0],
        rotation: Array.isArray(o.rotation) && o.rotation.length === 3 ? o.rotation : [0, 0, 0],
        scale:    Array.isArray(o.scale)    && o.scale.length    === 3 ? o.scale    : [1, 1, 1],
        color:    o.color || '#888888',
        ...o,
      }));
      onImport(normalized, mode);
      setJsonText('');
      onClose();
    } catch (e) {
      setError('JSON 파싱 실패: ' + (e as Error).message);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(3,7,18,0.78)', backdropFilter: 'blur(8px)',
        zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(820px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          borderRadius: 14, border: '1px solid rgba(255,255,255,0.16)',
          background: 'linear-gradient(180deg, rgba(14,23,46,0.97), rgba(8,14,30,0.97))',
          color: '#fff', overflow: 'hidden',
        }}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>🤖 AI 로 맵 만들기</div>
          <button onClick={onClose} style={{ border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.06)', color: '#fff', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontWeight: 700 }}>닫기</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {/* 안내 */}
          <div style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, padding: '10px 12px', fontSize: 12, lineHeight: 1.55, marginBottom: 16 }}>
            AI 비용은 본인 계정에서 발생합니다. ChatGPT, Claude, Gemini 등 원하는 AI 도구를 사용해서 JSON 을 받아 붙여넣으세요.
          </div>

          {/* Step 1 */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: '#6366f1', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>1</span>
              아래 프롬프트를 AI 에 복사해서 붙여넣기
            </div>
            <button
              onClick={handleCopyPrompt}
              style={{
                background: copied ? '#10b981' : '#4f46e5', color: '#fff', border: 'none',
                borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', marginBottom: 8,
              }}
            >
              {copied ? '✓ 복사됨' : '📋 프롬프트 복사'}
            </button>
            <textarea
              readOnly
              value={AI_PROMPT_TEMPLATE}
              style={{
                width: '100%', height: 180, background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
                color: 'rgba(255,255,255,0.85)', fontFamily: 'ui-monospace, Menlo, monospace',
                fontSize: 11, padding: 10, resize: 'vertical', outline: 'none',
              }}
            />
          </div>

          {/* Step 2 */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: '#6366f1', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>2</span>
              외부 AI 도구로 가서 사용
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href="https://chat.openai.com" target="_blank" rel="noopener noreferrer"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600 }}>
                ChatGPT
              </a>
              <a href="https://claude.ai" target="_blank" rel="noopener noreferrer"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600 }}>
                Claude
              </a>
              <a href="https://gemini.google.com" target="_blank" rel="noopener noreferrer"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600 }}>
                Gemini
              </a>
            </div>
            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>
              프롬프트 끝의 &quot;사용자 요청&quot; 부분에 만들고 싶은 씬을 자유롭게 적으세요.
            </div>
          </div>

          {/* Step 3 */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: '#6366f1', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>3</span>
              AI 응답 (JSON) 을 여기에 붙여넣고 씬에 적용
            </div>
            <textarea
              value={jsonText}
              onChange={e => { setJsonText(e.target.value); setError(null); }}
              placeholder='{"objects":[{"kind":"cube","position":[0,1,0],...}]}'
              style={{
                width: '100%', height: 160, background: 'rgba(0,0,0,0.4)',
                border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 8, color: '#fff', fontFamily: 'ui-monospace, Menlo, monospace',
                fontSize: 11, padding: 10, resize: 'vertical', outline: 'none',
              }}
            />
            {error && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#fca5a5', background: 'rgba(239,68,68,0.12)', padding: '6px 10px', borderRadius: 6 }}>
                ⚠ {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                onClick={() => handleImport('add')}
                disabled={!jsonText.trim()}
                style={{
                  background: jsonText.trim() ? '#10b981' : 'rgba(255,255,255,0.08)',
                  color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px',
                  fontSize: 12, fontWeight: 700, cursor: jsonText.trim() ? 'pointer' : 'default',
                  opacity: jsonText.trim() ? 1 : 0.5,
                }}
              >
                ⊕ 현재 씬에 추가
              </button>
              <button
                onClick={() => handleImport('replace')}
                disabled={!jsonText.trim()}
                style={{
                  background: jsonText.trim() ? '#ef4444' : 'rgba(255,255,255,0.08)',
                  color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px',
                  fontSize: 12, fontWeight: 700, cursor: jsonText.trim() ? 'pointer' : 'default',
                  opacity: jsonText.trim() ? 1 : 0.5,
                }}
              >
                ↻ 씬 전체 교체
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
