/**
 * 키프레임 애니메이션 — 오브젝트의 위치/회전/스케일을 시간축 키프레임으로 보간.
 * 스튜디오 타임라인에서 제작, 월드/시뮬에서 재생.
 *
 * 각 키프레임은 "그 시점의 절대 로컬 TRS 스냅샷"(오브젝트 자신의 position/rotation/scale).
 * 키 사이는 선형 보간(위치·스케일) + 오일러 선형 보간(회전, 단순 케이스 충분).
 */
import * as THREE from 'three';

export type Vec3 = [number, number, number];

export interface KeyFrame {
  t: number;          // 시간(초)
  position: Vec3;
  rotation: Vec3;     // 오일러 라디안
  scale: Vec3;
}

export interface KeyframeAnim {
  duration: number;   // 전체 길이(초)
  loop: boolean;
  autoplay: boolean;  // 월드/시뮬 시작 시 자동 재생
  keys: KeyFrame[];   // t 오름차순
}

export interface SampledTRS { position: Vec3; rotation: Vec3; scale: Vec3; }

function lerp(a: number, b: number, k: number): number { return a + (b - a) * k; }
function lerp3(a: Vec3, b: Vec3, k: number): Vec3 {
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}

// 회전은 quaternion slerp — euler 선형보간의 짐벌락/뒤집힘 방지 (재사용 임시 객체).
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const _ea = new THREE.Euler(), _eb = new THREE.Euler(), _eo = new THREE.Euler();
function slerpEuler(a: Vec3, b: Vec3, k: number): Vec3 {
  _qa.setFromEuler(_ea.set(a[0], a[1], a[2], 'XYZ'));
  _qb.setFromEuler(_eb.set(b[0], b[1], b[2], 'XYZ'));
  _qa.slerp(_qb, k);
  _eo.setFromQuaternion(_qa, 'XYZ');
  return [_eo.x, _eo.y, _eo.z];
}

/** time(초) 위치의 보간된 TRS. keys 가 없으면 null. */
export function sampleKeyframeAnim(anim: KeyframeAnim | undefined, time: number): SampledTRS | null {
  if (!anim || !anim.keys || anim.keys.length === 0) return null;
  const keys = anim.keys;
  if (keys.length === 1) {
    const k = keys[0];
    return { position: k.position, rotation: k.rotation, scale: k.scale };
  }
  const dur = anim.duration > 0 ? anim.duration : (keys[keys.length - 1].t || 1);
  let t = time;
  if (anim.loop && dur > 0) t = ((t % dur) + dur) % dur;
  else t = Math.max(0, Math.min(dur, t));

  // 첫 키 이전 / 마지막 키 이후 클램프
  if (t <= keys[0].t) { const k = keys[0]; return { position: k.position, rotation: k.rotation, scale: k.scale }; }
  const last = keys[keys.length - 1];
  if (t >= last.t) { return { position: last.position, rotation: last.rotation, scale: last.scale }; }

  // 둘러싼 두 키 찾기
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      const k = span > 0 ? (t - a.t) / span : 0;
      return { position: lerp3(a.position, b.position, k), rotation: slerpEuler(a.rotation, b.rotation, k), scale: lerp3(a.scale, b.scale, k) };
    }
  }
  return { position: last.position, rotation: last.rotation, scale: last.scale };
}

/** 정상화 — keys 를 t 오름차순 정렬, duration 보정. */
export function normalizeKeyframeAnim(anim: KeyframeAnim): KeyframeAnim {
  const keys = [...anim.keys].sort((a, b) => a.t - b.t);
  const maxT = keys.length ? keys[keys.length - 1].t : 0;
  return { ...anim, keys, duration: Math.max(anim.duration || 0, maxT) };
}
