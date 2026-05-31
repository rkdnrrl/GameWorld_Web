'use client';
import type { JsGameAPI } from './gameRuntime';
/**
 * ALP 미니 JavaScript 인터프리터 — 외부 라이브러리 0개 (npm install 없음)
 *
 * 지원하는 JS 문법 (subset):
 *   - let / const / var 변수 선언
 *   - function 선언
 *   - if/else, for(;;), while, break, continue, return
 *   - 산술/비교/논리/대입 연산자 (+ - * / % < > <= >= == != === !== && || ! = += -= *= /= ++ --)
 *   - 객체/배열 리터럴, member/index 접근 (obj.prop, obj[idx])
 *   - 함수 호출, 삼항 연산자
 *   - 문자열, 숫자, true/false/null/undefined
 *   - 주석 (// ...) 및 (/* ... *\/)
 *
 * 노출하는 게임 API:
 *   self            — 현재 오브젝트 ({id, position, rotation, color, visible, ...})
 *   self.setPosition(x,y,z) / self.setRotation(rx,ry,rz) / self.setColor(hex) / self.setVisible(b)
 *   self.applyImpulse(x,y,z) / self.destroy()   (destroy는 런타임 spawn된 것만 동작)
 *   world.time      — 월드 경과 시간 (초)
 *   world.getPlayers() → [{id, username, x, y, z}]
 *   world.find(idOrLabel) → 다른 오브젝트 핸들 (self와 같은 인터페이스), 못 찾으면 null
 *   world.spawn({kind, position, color, physics, ...}) → 새 오브젝트 핸들
 *   world.isHost() → 본인이 호스트인지 (중복 spawn 방지에 사용)
 *   world.runtimeCount() → 현재 spawn 된 오브젝트 수 (멱등 spawn 가드)
 *   net.sendAll(event, data) / net.sendTo(playerId, event, data)
 *   world.playSound(url, {volume,loop})  — 오디오 재생
 *   world.teleport(x,y,z) / world.respawn() / world.setSpawn(x,y,z)  — 플레이어 이동·리스폰·체크포인트
 *   world.setSpeed(mult) / world.setJump(power)  — (로컬) 플레이어 이동속도·점프력
 *   world.isPlayer(id) / world.teleportPlayer(id,x,y,z) / world.respawnPlayer(id) / world.setSpawnFor(id,x,y,z)  — 특정 플레이어(트리거 other) 제어, 멀티 라우팅
 *   game.get(key, default?) / game.set(key, value) / game.add(key, n=1)  — 전역 게임 상태(점수·체력 등)
 *   ui.text(id, text, {x,y,size,color,bg,align}) / ui.bar(id, value, max, {x,y,color,bg})  — 화면 HUD
 *   ui.image(id, url, {x,y,w,h}) / ui.clear(id) / ui.clearAll()
 *   print(...) / console.log(...)
 *   Math.sin / cos / abs / floor / ceil / round / random / PI / min / max / sqrt / pow / atan2
 *
 * 이벤트 함수 (사용자가 정의하면 자동 호출):
 *   function onStart()
 *   function onUpdate(dt)
 *   function onNetEvent(event, data, fromId)
 *   function onGrab(grabberId)      — 누가 1인칭에서 이 오브젝트를 잡았을 때
 *   function onRelease(grabberId)   — 잡힌 상태에서 풀려났을 때
 *   function onTriggerEnter(otherId) / onTriggerExit(otherId)     — Collider(trigger=on)에 들어옴/나감. otherId='player' 또는 오브젝트 id
 *   function onCollisionEnter(otherId) / onCollisionExit(otherId) — Collider(trigger=off) 단단한 충돌 시작/끝
 *
 * 인스펙터 변수 (유니티 직렬화 필드처럼):
 *   top-level `let speed = 5;` 처럼 리터럴(숫자/문자열/불리언)로 선언하면 인스펙터에 자동 노출되어
 *   값을 조정할 수 있다. 코드의 값은 기본값, 인스펙터 값이 우선. (`_`로 시작하면 숨김)
 *
 * 안전 장치:
 *   - 무한 루프 방지 (반복문당 최대 10,000회)
 *   - 무한 재귀 방지 (스택 깊이 최대 100)
 *   - eval/Function/new/import/require 금지
 *   - window/document/process 등 호스트 접근 불가
 */

/* ─────────────────────────────────────────────
   Tokenizer
   ───────────────────────────────────────────── */

type TokenType =
  | 'NUM' | 'STR' | 'IDENT' | 'KW' | 'OP' | 'PUNCT'
  | 'EOF';

interface Token { type: TokenType; value: string; line: number; }

const KEYWORDS = new Set([
  'let', 'const', 'var', 'function', 'return',
  'if', 'else', 'for', 'while', 'break', 'continue',
  'true', 'false', 'null', 'undefined',
]);

const OPS = [
  '===', '!==', '==', '!=', '<=', '>=', '&&', '||',
  '+=', '-=', '*=', '/=', '%=', '++', '--',
  '+', '-', '*', '/', '%', '<', '>', '=', '!',
];

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0, line = 1;
  const n = source.length;

  while (i < n) {
    const c = source[i];

    // 공백
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '\n') { line++; i++; continue; }

    // 주석 한 줄 //
    if (c === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }
    // 주석 블록 /* ... */
    if (c === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') line++;
        i++;
      }
      i += 2;
      continue;
    }

    // 숫자
    if ((c >= '0' && c <= '9') || (c === '.' && source[i + 1] >= '0' && source[i + 1] <= '9')) {
      let j = i;
      while (j < n && ((source[j] >= '0' && source[j] <= '9') || source[j] === '.')) j++;
      tokens.push({ type: 'NUM', value: source.slice(i, j), line });
      i = j; continue;
    }

    // 문자열 "..." 또는 '...'
    if (c === '"' || c === '\'') {
      const quote = c;
      let j = i + 1;
      let str = '';
      while (j < n && source[j] !== quote) {
        if (source[j] === '\\' && j + 1 < n) {
          const nx = source[j + 1];
          if (nx === 'n') str += '\n';
          else if (nx === 't') str += '\t';
          else if (nx === 'r') str += '\r';
          else if (nx === '\\') str += '\\';
          else if (nx === quote) str += quote;
          else str += nx;
          j += 2;
        } else {
          if (source[j] === '\n') line++;
          str += source[j];
          j++;
        }
      }
      tokens.push({ type: 'STR', value: str, line });
      i = j + 1; continue;
    }

    // 식별자 / 키워드
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$') {
      let j = i;
      while (j < n && ((source[j] >= 'a' && source[j] <= 'z') ||
                       (source[j] >= 'A' && source[j] <= 'Z') ||
                       (source[j] >= '0' && source[j] <= '9') ||
                       source[j] === '_' || source[j] === '$')) j++;
      const word = source.slice(i, j);
      tokens.push({ type: KEYWORDS.has(word) ? 'KW' : 'IDENT', value: word, line });
      i = j; continue;
    }

    // 구두점
    if ('(){}[],;:.?'.includes(c)) {
      tokens.push({ type: 'PUNCT', value: c, line });
      i++; continue;
    }

    // 연산자 (긴 것부터 매칭)
    let matched = false;
    for (const op of OPS) {
      if (source.slice(i, i + op.length) === op) {
        tokens.push({ type: 'OP', value: op, line });
        i += op.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // 알 수 없는 문자 (한글, 이모지, 보이지 않는 유니코드 등) — 조용히 스킵.
      // 코드 본문에 있으면 의도치 않은 동작이 될 수 있지만, 주석/문자열 밖에
      // 유니코드가 들어가는 건 보통 의도가 아님 (복붙 사고).
      console.warn(`[JsScript] line ${line}: 알 수 없는 문자 무시 — '${c}' (U+${c.charCodeAt(0).toString(16).padStart(4, '0')})`);
      i++;
    }
  }

  tokens.push({ type: 'EOF', value: '', line });
  return tokens;
}

/* ─────────────────────────────────────────────
   Parser → AST
   ───────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

class Parser {
  pos = 0;
  constructor(public tokens: Token[]) {}
  peek(offset = 0) { return this.tokens[this.pos + offset]; }
  eat(type: TokenType, value?: string): Token {
    const t = this.tokens[this.pos];
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(`[line ${t.line}] 예상: ${value ?? type}, 실제: ${t.value || t.type}`);
    }
    this.pos++;
    return t;
  }
  match(type: TokenType, value?: string): boolean {
    const t = this.tokens[this.pos];
    if (t.type !== type) return false;
    if (value !== undefined && t.value !== value) return false;
    return true;
  }
  consume(type: TokenType, value?: string): boolean {
    if (this.match(type, value)) { this.pos++; return true; }
    return false;
  }

  parseProgram(): Node {
    const body: Node[] = [];
    while (!this.match('EOF')) {
      body.push(this.parseStatement());
    }
    return { type: 'Program', body };
  }

  parseStatement(): Node {
    const t = this.peek();
    if (t.type === 'KW') {
      if (t.value === 'function') return this.parseFunctionDecl();
      if (t.value === 'let' || t.value === 'const' || t.value === 'var') return this.parseVarDecl();
      if (t.value === 'if')       return this.parseIf();
      if (t.value === 'while')    return this.parseWhile();
      if (t.value === 'for')      return this.parseFor();
      if (t.value === 'return') {
        this.pos++;
        const val = this.match('PUNCT', ';') || this.match('PUNCT', '}') ? null : this.parseExpression();
        this.consume('PUNCT', ';');
        return { type: 'Return', value: val };
      }
      if (t.value === 'break')    { this.pos++; this.consume('PUNCT', ';'); return { type: 'Break' }; }
      if (t.value === 'continue') { this.pos++; this.consume('PUNCT', ';'); return { type: 'Continue' }; }
    }
    if (this.match('PUNCT', '{')) return this.parseBlock();
    if (this.match('PUNCT', ';')) { this.pos++; return { type: 'Empty' }; }

    const expr = this.parseExpression();
    this.consume('PUNCT', ';');
    return { type: 'ExprStmt', expr };
  }

  parseFunctionDecl(): Node {
    this.eat('KW', 'function');
    const name = this.eat('IDENT').value;
    this.eat('PUNCT', '(');
    const params: string[] = [];
    if (!this.match('PUNCT', ')')) {
      do {
        params.push(this.eat('IDENT').value);
      } while (this.consume('PUNCT', ','));
    }
    this.eat('PUNCT', ')');
    const body = this.parseBlock().body;
    return { type: 'FunctionDecl', name, params, body };
  }

  parseVarDecl(): Node {
    this.pos++; // let/const/var
    const name = this.eat('IDENT').value;
    let value = null;
    if (this.consume('OP', '=')) value = this.parseExpression();
    this.consume('PUNCT', ';');
    return { type: 'VarDecl', name, value };
  }

  parseIf(): Node {
    this.eat('KW', 'if');
    this.eat('PUNCT', '(');
    const cond = this.parseExpression();
    this.eat('PUNCT', ')');
    const then = this.parseStatementOrBlock();
    let els: Node[] | null = null;
    if (this.consume('KW', 'else')) {
      els = this.parseStatementOrBlock();
    }
    return { type: 'If', cond, then, else: els };
  }

  parseWhile(): Node {
    this.eat('KW', 'while');
    this.eat('PUNCT', '(');
    const cond = this.parseExpression();
    this.eat('PUNCT', ')');
    const body = this.parseStatementOrBlock();
    return { type: 'While', cond, body };
  }

  parseFor(): Node {
    this.eat('KW', 'for');
    this.eat('PUNCT', '(');
    let init: Node | null = null;
    if (!this.match('PUNCT', ';')) {
      if (this.match('KW', 'let') || this.match('KW', 'const') || this.match('KW', 'var')) {
        init = this.parseVarDecl();
      } else {
        init = { type: 'ExprStmt', expr: this.parseExpression() };
        this.consume('PUNCT', ';');
      }
    } else {
      this.pos++; // ;
    }
    const cond = this.match('PUNCT', ';') ? null : this.parseExpression();
    this.eat('PUNCT', ';');
    const update = this.match('PUNCT', ')') ? null : this.parseExpression();
    this.eat('PUNCT', ')');
    const body = this.parseStatementOrBlock();
    return { type: 'For', init, cond, update, body };
  }

  parseStatementOrBlock(): Node[] {
    if (this.match('PUNCT', '{')) return this.parseBlock().body;
    return [this.parseStatement()];
  }

  parseBlock(): Node {
    this.eat('PUNCT', '{');
    const body: Node[] = [];
    while (!this.match('PUNCT', '}') && !this.match('EOF')) {
      body.push(this.parseStatement());
    }
    this.eat('PUNCT', '}');
    return { type: 'Block', body };
  }

  parseExpression(): Node {
    return this.parseAssignment();
  }

  parseAssignment(): Node {
    const left = this.parseTernary();
    const t = this.peek();
    if (t.type === 'OP' && ['=', '+=', '-=', '*=', '/=', '%='].includes(t.value)) {
      const op = t.value; this.pos++;
      const right = this.parseAssignment();
      return { type: 'Assign', op, target: left, value: right };
    }
    return left;
  }

  parseTernary(): Node {
    const cond = this.parseLogicalOr();
    if (this.consume('PUNCT', '?')) {
      const then = this.parseAssignment();
      this.eat('PUNCT', ':');
      const els = this.parseAssignment();
      return { type: 'Ternary', cond, then, else: els };
    }
    return cond;
  }

  parseLogicalOr(): Node {
    let left = this.parseLogicalAnd();
    while (this.match('OP', '||')) {
      this.pos++;
      const right = this.parseLogicalAnd();
      left = { type: 'Logical', op: '||', left, right };
    }
    return left;
  }
  parseLogicalAnd(): Node {
    let left = this.parseEquality();
    while (this.match('OP', '&&')) {
      this.pos++;
      const right = this.parseEquality();
      left = { type: 'Logical', op: '&&', left, right };
    }
    return left;
  }
  parseEquality(): Node {
    let left = this.parseComparison();
    while (this.match('OP', '==') || this.match('OP', '!=') || this.match('OP', '===') || this.match('OP', '!==')) {
      const op = this.peek().value; this.pos++;
      const right = this.parseComparison();
      left = { type: 'BinOp', op, left, right };
    }
    return left;
  }
  parseComparison(): Node {
    let left = this.parseAddSub();
    while (this.match('OP', '<') || this.match('OP', '>') || this.match('OP', '<=') || this.match('OP', '>=')) {
      const op = this.peek().value; this.pos++;
      const right = this.parseAddSub();
      left = { type: 'BinOp', op, left, right };
    }
    return left;
  }
  parseAddSub(): Node {
    let left = this.parseMulDiv();
    while (this.match('OP', '+') || this.match('OP', '-')) {
      const op = this.peek().value; this.pos++;
      const right = this.parseMulDiv();
      left = { type: 'BinOp', op, left, right };
    }
    return left;
  }
  parseMulDiv(): Node {
    let left = this.parseUnary();
    while (this.match('OP', '*') || this.match('OP', '/') || this.match('OP', '%')) {
      const op = this.peek().value; this.pos++;
      const right = this.parseUnary();
      left = { type: 'BinOp', op, left, right };
    }
    return left;
  }
  parseUnary(): Node {
    if (this.match('OP', '-') || this.match('OP', '!') || this.match('OP', '+')) {
      const op = this.peek().value; this.pos++;
      const expr = this.parseUnary();
      return { type: 'UnaryOp', op, expr };
    }
    if (this.match('OP', '++') || this.match('OP', '--')) {
      const op = this.peek().value; this.pos++;
      const expr = this.parseUnary();
      return { type: 'UpdateOp', op, expr, prefix: true };
    }
    return this.parsePostfix();
  }
  parsePostfix(): Node {
    let node = this.parseCallOrMember();
    while (this.match('OP', '++') || this.match('OP', '--')) {
      const op = this.peek().value; this.pos++;
      node = { type: 'UpdateOp', op, expr: node, prefix: false };
    }
    return node;
  }
  parseCallOrMember(): Node {
    let node = this.parsePrimary();
    while (true) {
      if (this.consume('PUNCT', '.')) {
        const prop = this.eat('IDENT').value;
        node = { type: 'Member', obj: node, prop };
      } else if (this.consume('PUNCT', '[')) {
        const idx = this.parseExpression();
        this.eat('PUNCT', ']');
        node = { type: 'Index', obj: node, index: idx };
      } else if (this.consume('PUNCT', '(')) {
        const args: Node[] = [];
        if (!this.match('PUNCT', ')')) {
          do { args.push(this.parseExpression()); } while (this.consume('PUNCT', ','));
        }
        this.eat('PUNCT', ')');
        node = { type: 'Call', callee: node, args };
      } else break;
    }
    return node;
  }
  parsePrimary(): Node {
    const t = this.peek();
    if (t.type === 'NUM')   { this.pos++; return { type: 'Num',  value: Number(t.value) }; }
    if (t.type === 'STR')   { this.pos++; return { type: 'Str',  value: t.value }; }
    if (t.type === 'KW') {
      if (t.value === 'true')      { this.pos++; return { type: 'Bool', value: true }; }
      if (t.value === 'false')     { this.pos++; return { type: 'Bool', value: false }; }
      if (t.value === 'null')      { this.pos++; return { type: 'Null' }; }
      if (t.value === 'undefined') { this.pos++; return { type: 'Undef' }; }
    }
    if (t.type === 'IDENT') { this.pos++; return { type: 'Ident', name: t.value }; }
    if (this.consume('PUNCT', '(')) {
      const e = this.parseExpression();
      this.eat('PUNCT', ')');
      return e;
    }
    if (this.consume('PUNCT', '[')) {
      const elements: Node[] = [];
      if (!this.match('PUNCT', ']')) {
        do {
          if (this.match('PUNCT', ']')) break; // trailing comma 허용
          elements.push(this.parseExpression());
        } while (this.consume('PUNCT', ','));
      }
      this.eat('PUNCT', ']');
      return { type: 'Array', elements };
    }
    if (this.consume('PUNCT', '{')) {
      const props: { key: string; value: Node }[] = [];
      if (!this.match('PUNCT', '}')) {
        do {
          if (this.match('PUNCT', '}')) break; // trailing comma 허용
          const keyTok = this.peek();
          let key: string;
          if (keyTok.type === 'IDENT' || keyTok.type === 'KW') { key = keyTok.value; this.pos++; }
          else if (keyTok.type === 'STR') { key = keyTok.value; this.pos++; }
          else throw new Error(`[line ${keyTok.line}] 잘못된 객체 키`);
          this.eat('PUNCT', ':');
          props.push({ key, value: this.parseExpression() });
        } while (this.consume('PUNCT', ','));
      }
      this.eat('PUNCT', '}');
      return { type: 'Object', props };
    }
    throw new Error(`[line ${t.line}] 예상치 못한 토큰: ${t.value || t.type}`);
  }
}

/* ─────────────────────────────────────────────
   Interpreter (트리 워커)
   ───────────────────────────────────────────── */

class Environment {
  vars = new Map<string, unknown>();
  constructor(public parent: Environment | null = null) {}
  get(name: string): unknown {
    if (this.vars.has(name)) return this.vars.get(name);
    if (this.parent) return this.parent.get(name);
    throw new Error(`정의되지 않은 변수: ${name}`);
  }
  has(name: string): boolean {
    if (this.vars.has(name)) return true;
    return this.parent ? this.parent.has(name) : false;
  }
  set(name: string, value: unknown): void {
    // 가장 가까운 스코프에 있는 변수에 할당, 없으면 현재 스코프
    let env: Environment | null = this;
    while (env) {
      if (env.vars.has(name)) { env.vars.set(name, value); return; }
      env = env.parent;
    }
    this.vars.set(name, value);
  }
  declare(name: string, value: unknown): void {
    this.vars.set(name, value);
  }
}

class ReturnSignal { constructor(public value: unknown) {} }
class BreakSignal {}
class ContinueSignal {}

const MAX_LOOP_ITER  = 10000;
const MAX_STACK      = 100;

class Interpreter {
  globalEnv: Environment;
  stackDepth = 0;

  constructor(globals: Record<string, unknown>) {
    this.globalEnv = new Environment(null);
    for (const k of Object.keys(globals)) this.globalEnv.declare(k, globals[k]);
  }

  run(program: Node): void {
    // 함수 선언 먼저 등록 (호이스팅 흉내)
    for (const stmt of program.body) {
      if (stmt.type === 'FunctionDecl') this.exec(stmt, this.globalEnv);
    }
    for (const stmt of program.body) {
      if (stmt.type !== 'FunctionDecl') this.exec(stmt, this.globalEnv);
    }
  }

  callFunction(name: string, args: unknown[]): unknown {
    if (!this.globalEnv.has(name)) return undefined;
    const fn = this.globalEnv.get(name);
    if (typeof fn === 'function') return (fn as (...a: unknown[]) => unknown)(...args);
    // 사용자 정의 함수
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userFn = fn as any;
    if (userFn && userFn.__isUserFn) {
      return this.callUserFn(userFn, args);
    }
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callUserFn(fn: any, args: unknown[]): unknown {
    if (this.stackDepth >= MAX_STACK) throw new Error(`스택 깊이 초과 (재귀 너무 깊음)`);
    this.stackDepth++;
    try {
      const env = new Environment(fn.closure);
      for (let i = 0; i < fn.params.length; i++) {
        env.declare(fn.params[i], args[i]);
      }
      try {
        for (const s of fn.body) this.exec(s, env);
      } catch (e) {
        if (e instanceof ReturnSignal) return e.value;
        throw e;
      }
      return undefined;
    } finally {
      this.stackDepth--;
    }
  }

  exec(node: Node, env: Environment): unknown {
    switch (node.type) {
      case 'Empty': return undefined;
      case 'Block': {
        const inner = new Environment(env);
        for (const s of node.body) this.exec(s, inner);
        return undefined;
      }
      case 'ExprStmt': return this.eval(node.expr, env);
      case 'VarDecl': {
        env.declare(node.name, node.value ? this.eval(node.value, env) : undefined);
        return undefined;
      }
      case 'FunctionDecl': {
        const fn = {
          __isUserFn: true,
          name: node.name,
          params: node.params,
          body: node.body,
          closure: env,
        };
        env.declare(node.name, fn);
        return undefined;
      }
      case 'If': {
        if (this.truthy(this.eval(node.cond, env))) {
          const inner = new Environment(env);
          for (const s of node.then) this.exec(s, inner);
        } else if (node.else) {
          const inner = new Environment(env);
          for (const s of node.else) this.exec(s, inner);
        }
        return undefined;
      }
      case 'While': {
        let iter = 0;
        while (this.truthy(this.eval(node.cond, env))) {
          if (++iter > MAX_LOOP_ITER) throw new Error(`while 반복 한도 초과 (${MAX_LOOP_ITER})`);
          try {
            const inner = new Environment(env);
            for (const s of node.body) this.exec(s, inner);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
        }
        return undefined;
      }
      case 'For': {
        const forEnv = new Environment(env);
        if (node.init) this.exec(node.init, forEnv);
        let iter = 0;
        while (node.cond === null || this.truthy(this.eval(node.cond, forEnv))) {
          if (++iter > MAX_LOOP_ITER) throw new Error(`for 반복 한도 초과 (${MAX_LOOP_ITER})`);
          try {
            const inner = new Environment(forEnv);
            for (const s of node.body) this.exec(s, inner);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) { /* continue to update */ }
            else throw e;
          }
          if (node.update) this.eval(node.update, forEnv);
        }
        return undefined;
      }
      case 'Return': throw new ReturnSignal(node.value ? this.eval(node.value, env) : undefined);
      case 'Break':    throw new BreakSignal();
      case 'Continue': throw new ContinueSignal();
    }
    // expression as statement
    return this.eval(node, env);
  }

  eval(node: Node, env: Environment): unknown {
    switch (node.type) {
      case 'Num':   return node.value;
      case 'Str':   return node.value;
      case 'Bool':  return node.value;
      case 'Null':  return null;
      case 'Undef': return undefined;
      case 'Ident': return env.get(node.name);

      case 'Array':
        return node.elements.map((e: Node) => this.eval(e, env));

      case 'Object': {
        const o: Record<string, unknown> = {};
        for (const p of node.props) o[p.key] = this.eval(p.value, env);
        return o;
      }

      case 'Member': {
        const obj = this.eval(node.obj, env);
        if (obj === null || obj === undefined) throw new Error(`null/undefined 속성 접근: .${node.prop}`);
        return (obj as Record<string, unknown>)[node.prop];
      }

      case 'Index': {
        const obj = this.eval(node.obj, env);
        const idx = this.eval(node.index, env);
        if (obj === null || obj === undefined) throw new Error(`null/undefined 인덱스 접근`);
        return (obj as Record<string, unknown>)[String(idx)];
      }

      case 'Call': {
        const args = node.args.map((a: Node) => this.eval(a, env));
        // 메서드 호출 (obj.method() / obj[key]())
        if (node.callee.type === 'Member') {
          const obj = this.eval(node.callee.obj, env);
          if (obj === null || obj === undefined) throw new Error(`null/undefined 메서드 호출`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fn = (obj as any)[node.callee.prop];
          if (typeof fn !== 'function') throw new Error(`함수가 아님: ${node.callee.prop}`);
          return fn.apply(obj, args);
        }
        if (node.callee.type === 'Index') {
          const obj = this.eval(node.callee.obj, env);
          const key = this.eval(node.callee.index, env);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fn = (obj as any)[String(key)];
          if (typeof fn !== 'function') throw new Error(`함수가 아님`);
          return fn.apply(obj, args);
        }
        const fn = this.eval(node.callee, env);
        if (typeof fn === 'function') return (fn as (...a: unknown[]) => unknown)(...args);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (fn && (fn as any).__isUserFn) return this.callUserFn(fn, args);
        throw new Error(`호출할 수 없음`);
      }

      case 'BinOp': {
        const l = this.eval(node.left, env);
        const r = this.eval(node.right, env);
        switch (node.op) {
          case '+':   return (l as number) + (r as number);
          case '-':   return (l as number) - (r as number);
          case '*':   return (l as number) * (r as number);
          case '/':   return (l as number) / (r as number);
          case '%':   return (l as number) % (r as number);
          case '<':   return (l as number) <  (r as number);
          case '>':   return (l as number) >  (r as number);
          case '<=':  return (l as number) <= (r as number);
          case '>=':  return (l as number) >= (r as number);
          case '==':  return l == r;
          case '!=':  return l != r;
          case '===': return l === r;
          case '!==': return l !== r;
        }
        return undefined;
      }
      case 'UnaryOp': {
        const v = this.eval(node.expr, env);
        if (node.op === '-') return -(v as number);
        if (node.op === '+') return +(v as number);
        if (node.op === '!') return !this.truthy(v);
        return undefined;
      }
      case 'UpdateOp': {
        const cur = Number(this.eval(node.expr, env));
        const next = node.op === '++' ? cur + 1 : cur - 1;
        this.assign(node.expr, next, env);
        return node.prefix ? next : cur;
      }
      case 'Logical': {
        const l = this.eval(node.left, env);
        if (node.op === '&&') return this.truthy(l) ? this.eval(node.right, env) : l;
        if (node.op === '||') return this.truthy(l) ? l : this.eval(node.right, env);
        return undefined;
      }
      case 'Assign': {
        let value = this.eval(node.value, env);
        if (node.op !== '=') {
          const cur = this.eval(node.target, env) as number;
          const r = value as number;
          if (node.op === '+=') value = cur + r;
          if (node.op === '-=') value = cur - r;
          if (node.op === '*=') value = cur * r;
          if (node.op === '/=') value = cur / r;
          if (node.op === '%=') value = cur % r;
        }
        this.assign(node.target, value, env);
        return value;
      }
      case 'Ternary': {
        return this.truthy(this.eval(node.cond, env))
          ? this.eval(node.then, env)
          : this.eval(node.else, env);
      }
    }
    throw new Error(`알 수 없는 노드: ${node.type}`);
  }

  assign(target: Node, value: unknown, env: Environment): void {
    if (target.type === 'Ident') { env.set(target.name, value); return; }
    if (target.type === 'Member') {
      const obj = this.eval(target.obj, env);
      if (obj === null || obj === undefined) throw new Error(`null/undefined 속성 대입`);
      (obj as Record<string, unknown>)[target.prop] = value;
      return;
    }
    if (target.type === 'Index') {
      const obj = this.eval(target.obj, env);
      const key = this.eval(target.index, env);
      (obj as Record<string, unknown>)[String(key)] = value;
      return;
    }
    throw new Error(`대입할 수 없는 대상`);
  }

  truthy(v: unknown): boolean {
    if (v === false || v === null || v === undefined) return false;
    if (typeof v === 'number' && (v === 0 || Number.isNaN(v))) return false;
    if (typeof v === 'string' && v === '') return false;
    return true;
  }
}

/* ─────────────────────────────────────────────
   공개 API — JsScript 클래스
   ───────────────────────────────────────────── */

export interface JsObjectAPI {
  id: string;
  getPosition(): [number, number, number];
  setPosition(x: number, y: number, z: number): void;
  getRotation(): [number, number, number];
  setRotation(rx: number, ry: number, rz: number): void;
  applyImpulse(x: number, y: number, z: number): void;
  setVisible(b: boolean): void;
  /** 조명/메시 색상 변경. hex 문자열 (e.g. "#ff0000") */
  setColor?(hex: string): void;
  /** 조명 강도 변경 (조명 오브젝트만) */
  setIntensity?(value: number): void;
  /** 런타임 spawn된 오브젝트만 제거. 저장된 customObject는 무시. */
  destroy?(): void;
  /** 현재 누가 1인칭으로 잡고 있는지 — true/false. (로컬 클라 기준) */
  isGrabbed?(): boolean;
  /** 잡고 있는 플레이어 id — 안 잡혀있으면 null. (로컬 클라 기준) */
  grabber?(): string | null;
  /** Health 컴포넌트 있는 오브젝트의 HP 조회. 없으면 null. */
  getHp?(): number | null;
  /** Health 컴포넌트 있는 오브젝트의 HP 감소. amount 양수. invuln 무시 옵션. 반환=현재 HP. */
  damage?(amount: number, opts?: { ignoreInvuln?: boolean; attackerId?: string }): number;
  /** Health 컴포넌트 있는 오브젝트의 HP 회복. amount 양수. 반환=현재 HP. */
  heal?(amount: number): number;
}

/** world.spawn() 옵션 — UserMapObject 부분 집합 */
export interface JsSpawnOpts {
  kind?: 'cube' | 'sphere' | 'cylinder' | 'plane' | 'asset';
  assetUrl?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?:    [number, number, number];
  color?:    string;
  physics?:  'none' | 'fixed' | 'dynamic';
  material?: 'default' | 'wood' | 'metal' | 'stone' | 'glass' | 'plastic' | 'emissive';
  materialColor?: string;
}

export interface JsPlayerInfo {
  id: string;
  username: string;
  x: number; y: number; z: number;
}

export interface JsWorldAPI {
  getTime(): number;
  getPlayers(): JsPlayerInfo[];
  /** label 또는 id로 다른 오브젝트 찾기. 못 찾으면 null. */
  findObject?(nameOrId: string): JsObjectAPI | null;
  /** 런타임에 새 오브젝트 생성. 생성된 오브젝트 핸들 반환. */
  spawn?(opts: JsSpawnOpts): JsObjectAPI;
  /** 본인이 호스트(가장 일찍 입장한 활성 플레이어)인지. 스튜디오 시뮬에선 항상 true. */
  isHost?(): boolean;
  /** 현재 씬에 있는 런타임(spawn) 오브젝트 개수 — "이미 spawn 됐는지" 가드로 사용. */
  runtimeCount?(): number;
  /** 로컬 플레이어를 (x,y,z) 로 순간이동 (스튜디오 시뮬·솔로/호스트 기준). */
  teleportLocal?(x: number, y: number, z: number): void;
  /** 리스폰 지점(체크포인트) 설정 — 이후 respawn/낙사 시 여기로. */
  setSpawn?(x: number, y: number, z: number): void;
  /** 로컬 플레이어를 현재 리스폰 지점으로 보냄. */
  respawnLocal?(): void;
  /** 플레이어 이동 속도 배수 (1=기본, 2=2배). */
  setPlayerSpeed?(mult: number): void;
  /** 플레이어 점프력 (기본 7). */
  setPlayerJump?(power: number): void;
  /** id 가 플레이어인지 (트리거 other 가 플레이어인지 판별). */
  isPlayerId?(id: string): boolean;
  /** 특정 플레이어 제어 — 멀티에선 해당 클라로 라우팅. cmd: {t:'tp'|'respawn'|'setspawn', x?,y?,z?}. */
  controlPlayer?(id: string, cmd: Record<string, unknown>): void;
}

export interface JsNetAPI {
  sendAll(event: string, data: Record<string, unknown>): void;
  sendTo(playerId: string, event: string, data: Record<string, unknown>): void;
}

export class JsScript {
  private interp: Interpreter | null = null;
  private ready = false;
  private started = false;
  readonly logs: string[] = [];
  readonly errors: string[] = [];

  init(source: string, obj: JsObjectAPI, worldApi: JsWorldAPI, netApi: JsNetAPI, props?: Record<string, unknown>, vars?: Record<string, unknown>, gameApi?: JsGameAPI): void {
    try {
      const print = (...args: unknown[]) => {
        const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        this.logs.push(line);
        if (this.logs.length > 200) this.logs.shift();
        // eslint-disable-next-line no-console
        console.log(`[js:${obj.id.slice(0, 8)}]`, line);
      };

      // self는 위치/회전 같은 게 매번 바뀌므로 메서드 형태로 제공
      const self = {
        id: obj.id,
        getPosition: () => {
          const [x, y, z] = obj.getPosition();
          return { x, y, z };
        },
        setPosition: (x: number, y: number, z: number) =>
          obj.setPosition(Number(x), Number(y), Number(z)),
        getRotation: () => {
          const [x, y, z] = obj.getRotation();
          return { x, y, z };
        },
        setRotation: (rx: number, ry: number, rz: number) =>
          obj.setRotation(Number(rx), Number(ry), Number(rz)),
        applyImpulse: (x: number, y: number, z: number) =>
          obj.applyImpulse(Number(x), Number(y), Number(z)),
        setVisible: (b: boolean) => obj.setVisible(Boolean(b)),
        setColor: (hex: string) => obj.setColor?.(String(hex)),
        setIntensity: (v: number) => obj.setIntensity?.(Number(v)),
        destroy: () => obj.destroy?.(),
        // Health 컴포넌트 — 없으면 noop/0
        getHp:  () => obj.getHp?.() ?? 0,
        damage: (n: number, opts?: { ignoreInvuln?: boolean; attackerId?: string }) =>
          obj.damage?.(Number(n) || 0, opts) ?? 0,
        heal:   (n: number) => obj.heal?.(Number(n) || 0) ?? 0,
      };

      // 다른 오브젝트를 self와 동일한 인터페이스로 감싸는 헬퍼
      const wrapObjectAPI = (api: JsObjectAPI) => ({
        id: api.id,
        getPosition: () => {
          const [x, y, z] = api.getPosition();
          return { x, y, z };
        },
        setPosition: (x: number, y: number, z: number) =>
          api.setPosition(Number(x), Number(y), Number(z)),
        getRotation: () => {
          const [x, y, z] = api.getRotation();
          return { x, y, z };
        },
        setRotation: (rx: number, ry: number, rz: number) =>
          api.setRotation(Number(rx), Number(ry), Number(rz)),
        applyImpulse: (x: number, y: number, z: number) =>
          api.applyImpulse(Number(x), Number(y), Number(z)),
        setVisible: (b: boolean) => api.setVisible(Boolean(b)),
        setColor: (hex: string) => api.setColor?.(String(hex)),
        setIntensity: (v: number) => api.setIntensity?.(Number(v)),
        destroy: () => api.destroy?.(),
      });

      const world = {
        time: 0,
        getPlayers: () => worldApi.getPlayers(),
        // world.find("door1") — label 또는 id로 다른 오브젝트 참조 얻기
        find: (nameOrId: string) => {
          const found = worldApi.findObject?.(String(nameOrId));
          return found ? wrapObjectAPI(found) : null;
        },
        // world.spawn({ kind:"cube", position:[0,5,0], color:"#f00", physics:"dynamic" })
        spawn: (opts: JsSpawnOpts | undefined) => {
          const spawned = worldApi.spawn?.(opts ?? {});
          return spawned ? wrapObjectAPI(spawned) : null;
        },
        // 본인이 호스트인지 — 멀티에서 중복 spawn/sound 등 방지용
        // if (world.isHost()) { world.spawn(...); }
        isHost: () => worldApi.isHost ? worldApi.isHost() : true,
        // 현재 spawn 된 런타임 오브젝트 개수 — "이미 있나" 가드.
        // if (world.isHost() && world.runtimeCount() === 0) { ...spawn... }
        runtimeCount: () => worldApi.runtimeCount ? worldApi.runtimeCount() : 0,
        // world.playSound("https://.../boom.mp3", { volume:0.8, loop:false })
        playSound: (url: unknown, opts?: { volume?: number; loop?: boolean }) =>
          gameApi?.playSound(String(url), opts),
        // ── 플레이어 제어 ── (스튜디오 시뮬·솔로/호스트 기준)
        // world.teleport(0, 10, 0) — 플레이어를 그 위치로 순간이동
        teleport: (x: unknown, y: unknown, z: unknown) =>
          worldApi.teleportLocal?.(Number(x), Number(y), Number(z)),
        // world.setSpawn(x,y,z) — 체크포인트(리스폰 지점) 설정. 이후 respawn()·낙사 시 여기로.
        setSpawn: (x: unknown, y: unknown, z: unknown) =>
          worldApi.setSpawn?.(Number(x), Number(y), Number(z)),
        // world.respawn() — 현재 리스폰 지점으로 보냄
        respawn: () => worldApi.respawnLocal?.(),
        // world.setSpeed(2) — 이동 속도 2배 / world.setJump(12) — 점프력
        setSpeed: (m: unknown) => worldApi.setPlayerSpeed?.(Number(m)),
        setJump: (p: unknown) => worldApi.setPlayerJump?.(Number(p)),
        // ── 특정 플레이어 제어 (멀티 per-player) ── 트리거 other 가 플레이어 id 임.
        // world.isPlayer(other) — other 가 플레이어인지
        isPlayer: (id: unknown) => worldApi.isPlayerId ? worldApi.isPlayerId(String(id)) : true,
        // world.teleportPlayer(other, x,y,z) / world.respawnPlayer(other) / world.setSpawnFor(other, x,y,z)
        teleportPlayer: (id: unknown, x: unknown, y: unknown, z: unknown) =>
          worldApi.controlPlayer?.(String(id), { t: 'tp', x: Number(x), y: Number(y), z: Number(z) }),
        respawnPlayer: (id: unknown) => worldApi.controlPlayer?.(String(id), { t: 'respawn' }),
        setSpawnFor: (id: unknown, x: unknown, y: unknown, z: unknown) =>
          worldApi.controlPlayer?.(String(id), { t: 'setspawn', x: Number(x), y: Number(y), z: Number(z) }),
      };
      // world.time을 항상 최신 값으로 → getter처럼 동작
      Object.defineProperty(world, 'time', {
        get: () => worldApi.getTime(),
        enumerable: true,
      });

      const net = {
        sendAll: (event: string, data?: Record<string, unknown>) =>
          netApi.sendAll(String(event), data ?? {}),
        sendTo: (pid: string, event: string, data?: Record<string, unknown>) =>
          netApi.sendTo(String(pid), String(event), data ?? {}),
      };

      // ── 게임 로직 레이어 (샌드박스) — 전역 상태 + 화면 UI(HUD) ──
      const numOr = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
      // game.set("score", 0) / game.add("score", 10) / game.get("score", 0)
      const game = {
        get: (k: unknown, d?: unknown) => { const v = gameApi?.stateGet(String(k)); return v === undefined ? (d ?? null) : v; },
        set: (k: unknown, v: unknown) => { gameApi?.stateSet(String(k), v); },
        add: (k: unknown, n?: unknown) => gameApi?.stateAdd(String(k), numOr(n, 1)) ?? 0,
      };
      // ui.text("score", "점수: "+game.get("score",0), {x:0.5,y:0.06,size:28})
      // ui.bar("hp", game.get("hp",100), 100, {y:0.94,color:"#e44"})
      const ui = {
        text: (id: unknown, text: unknown, opts?: Record<string, unknown>) => {
          const o = (opts && typeof opts === 'object') ? opts : {};
          gameApi?.hudSet({ id: String(id), type: 'text', text: String(text),
            x: numOr(o.x, 0.5), y: numOr(o.y, 0.08),
            size: o.size != null ? Number(o.size) : undefined,
            color: o.color != null ? String(o.color) : undefined,
            bg: o.bg != null ? String(o.bg) : undefined,
            align: (o.align === 'left' || o.align === 'right') ? o.align : 'center' });
        },
        bar: (id: unknown, value: unknown, max?: unknown, opts?: Record<string, unknown>) => {
          const o = (opts && typeof opts === 'object') ? opts : {};
          gameApi?.hudSet({ id: String(id), type: 'bar', value: numOr(value, 0), max: numOr(max, 100),
            x: numOr(o.x, 0.5), y: numOr(o.y, 0.92),
            size: o.size != null ? Number(o.size) : undefined,
            color: o.color != null ? String(o.color) : undefined,
            bg: o.bg != null ? String(o.bg) : undefined });
        },
        // ui.image("logo", "https://.../icon.png", {x:0.5,y:0.5,w:128,h:128})
        image: (id: unknown, url: unknown, opts?: Record<string, unknown>) => {
          const o = (opts && typeof opts === 'object') ? opts : {};
          gameApi?.hudSet({ id: String(id), type: 'image', url: String(url),
            x: numOr(o.x, 0.5), y: numOr(o.y, 0.5),
            w: o.w != null ? Number(o.w) : undefined,
            h: o.h != null ? Number(o.h) : undefined });
        },
        clear: (id: unknown) => { gameApi?.hudClear(String(id)); },
        clearAll: () => { gameApi?.hudClearAll(); },
        // ── 신규 UI 시스템 (kind='ui' MapObject) 제어 — label 로 검색 ──
        // ui.set("내버튼", { text: "OK", color: "#f00" })
        set: (label: unknown, patch: unknown) => {
          if (patch && typeof patch === 'object') gameApi?.uiSet?.(String(label), patch as Record<string, unknown>);
        },
        show: (label: unknown) => { gameApi?.uiVisible?.(String(label), true); },
        hide: (label: unknown) => { gameApi?.uiVisible?.(String(label), false); },
      };

      // ── 맵 데이터 KV (영구 저장) ──
      // data.get/set/all — 메모리 캐시. 호스트가 백그라운드로 서버에 sync.
      // data.shared.* — 맵 전역 (모두 공유), 기본 data.* 는 플레이어 개인 (자기 자료만).
      const makeDataApi = (shared: boolean) => ({
        get: (k: unknown, d?: unknown) => { const v = gameApi?.dataGet?.(String(k), shared); return v === undefined ? (d ?? null) : v; },
        set: (k: unknown, v: unknown) => { gameApi?.dataSet?.(String(k), v, shared); },
        all: () => gameApi?.dataAll?.(shared) ?? {},
      });
      const data = { ...makeDataApi(false), shared: makeDataApi(true) };

      const MathLib = {
        sin: Math.sin, cos: Math.cos, tan: Math.tan, atan: Math.atan, atan2: Math.atan2,
        abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
        random: Math.random, sqrt: Math.sqrt, pow: Math.pow,
        min: Math.min, max: Math.max,
        PI: Math.PI, E: Math.E,
      };

      const console_ = { log: print };

      this.interp = new Interpreter({
        self, world, net, game, ui, data,
        Math: MathLib,
        console: console_,
        print,
        // 기본 전역 함수들 — 스크립트에서 자주 씀
        String: (v: unknown) => String(v),
        Number: (v: unknown) => Number(v),
        Boolean: (v: unknown) => Boolean(v),
        parseInt: (v: unknown, r?: number) => parseInt(String(v), r),
        parseFloat: (v: unknown) => parseFloat(String(v)),
        isNaN: (v: unknown) => isNaN(v as number),
        isFinite: (v: unknown) => isFinite(v as number),
        // JSON 기본 노출 (디버깅용 console.log(JSON.stringify(...)) 자주 씀)
        JSON: {
          stringify: (v: unknown, _r?: unknown, sp?: number) => JSON.stringify(v, null, sp),
          parse: (s: string) => { try { return JSON.parse(s); } catch { return null; } },
        },
        // 유저 정의 스크립트 컴포넌트가 부착될 때 받은 props
        // 스크립트에서 `props.speed` 같이 접근. 없으면 빈 객체.
        props: props ?? {},
      });

      // 파싱 + 모듈 코드 실행 (변수 init, 함수 선언 등)
      // ⚠️ onStart 는 여기서 호출 X — callStart() 로 분리됨.
      // 멀티에서 hostId 알기 전에 onStart 가 돌면 world.isHost() 가 false 로 잘못 반환됨.
      const tokens = tokenize(source);
      const parser = new Parser(tokens);
      const program = parser.parseProgram();
      this.interp.run(program);
      // 인스펙터에서 설정한 변수 오버라이드 — 스크립트가 선언한 top-level 변수 기본값 위에 덮어씀.
      // (유니티의 직렬화 필드처럼: 코드의 기본값 vs 인스펙터에서 조정한 값)
      // 오브젝트 참조 변수(let x = null)는 드롭한 오브젝트 id 를 핸들로 변환해 주입 → x.setVisible() 등 제어 가능.
      const objRefKeys = new Set<string>();
      for (const stmt of (program.body as Node[])) {
        if (stmt && stmt.type === 'VarDecl' && stmt.value && stmt.value.type === 'Null') objRefKeys.add(stmt.name);
      }
      if (vars) {
        for (const k of Object.keys(vars)) {
          if (!this.interp.globalEnv.has(k)) continue;
          try {
            if (objRefKeys.has(k)) {
              const id = typeof vars[k] === 'string' ? (vars[k] as string) : '';
              const found = id ? worldApi.findObject?.(id) : null;
              this.interp.globalEnv.set(k, found ? wrapObjectAPI(found) : null);
            } else {
              this.interp.globalEnv.set(k, vars[k]);
            }
          } catch { /* ignore */ }
        }
      }
      this.ready = true;
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      this.errors.push(msg);
      console.error('[JsScript] init error:', msg);
    }
  }

  /** onStart 명시적 호출. idempotent — 여러 번 불러도 한 번만 실행. */
  callStart(): void {
    if (!this.ready || !this.interp || this.started) return;
    this.started = true;
    try {
      this.interp.callFunction('onStart', []);
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      this.errors.push(msg);
      console.error('[JsScript] onStart error:', msg);
    }
  }

  callUpdate(dt: number): void {
    if (!this.ready || !this.interp) return;
    try {
      this.interp.callFunction('onUpdate', [dt]);
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (!this.errors.includes(msg)) {
        this.errors.push(msg);
        console.error('[JsScript] onUpdate error:', msg);
      }
    }
  }

  callNetEvent(event: string, data: unknown, fromId: string): void {
    if (!this.ready || !this.interp) return;
    try {
      this.interp.callFunction('onNetEvent', [event, data, fromId]);
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (!this.errors.includes(msg)) this.errors.push(msg);
    }
  }

  callGrab(grabberId: string): void {
    if (!this.ready || !this.interp) return;
    try {
      this.interp.callFunction('onGrab', [grabberId]);
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (!this.errors.includes(msg)) this.errors.push(msg);
    }
  }

  callRelease(grabberId: string): void {
    if (!this.ready || !this.interp) return;
    try {
      this.interp.callFunction('onRelease', [grabberId]);
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (!this.errors.includes(msg)) this.errors.push(msg);
    }
  }

  /** 트리거(센서) 콜라이더에 다른 것이 들어옴/나감 — 유니티 OnTriggerEnter/Exit */
  callTriggerEnter(otherId: string): void { this.dispatch('onTriggerEnter', [otherId]); }
  callTriggerExit(otherId: string): void { this.dispatch('onTriggerExit', [otherId]); }
  /** 단단한 콜라이더 충돌 시작/끝 — 유니티 OnCollisionEnter/Exit */
  callCollisionEnter(otherId: string): void { this.dispatch('onCollisionEnter', [otherId]); }
  callCollisionExit(otherId: string): void { this.dispatch('onCollisionExit', [otherId]); }
  /** 1인칭에서 이 오브젝트를 클릭(정조준 후 좌클릭) — onClick(clicker) */
  callClick(clickerId: string): void { this.dispatch('onClick', [clickerId]); }

  /** 사용자 정의 이벤트 함수가 있으면 호출 (없으면 무시). 에러는 중복 없이 누적. */
  private dispatch(fnName: string, args: unknown[]): void {
    if (!this.ready || !this.interp) return;
    try {
      this.interp.callFunction(fnName, args);
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (!this.errors.includes(msg)) this.errors.push(msg);
    }
  }

  destroy(): void {
    this.interp = null;
    this.ready = false;
  }
}

/* ─────────────────────────────────────────────
   인스펙터 변수 추출 — 스크립트의 top-level 변수(리터럴 초기값)를
   유니티의 직렬화 필드처럼 인스펙터에 노출하기 위한 메타데이터.
   예) `let speed = 5;`  → { key:'speed', type:'number', default:5 }
       `let name = "go";` → { key:'name',  type:'string', default:'go' }
       `let on = true;`    → { key:'on',    type:'boolean', default:true }
       `let target = null;`→ { key:'target', type:'object', default:null }  ← 오브젝트 참조 슬롯
   - 초기값이 리터럴(숫자/문자열/불리언) 또는 null(오브젝트 슬롯) 인 것만 노출 (계산식·함수는 제외).
   - `_` 로 시작하는 이름은 비공개로 간주해 제외.
   - type:'object' 는 인스펙터에서 씬 오브젝트를 드래그해 지정 → 런타임에 그 오브젝트 핸들로 주입됨.
   ───────────────────────────────────────────── */
export interface ScriptVarDef {
  key: string;
  type: 'number' | 'string' | 'boolean' | 'object';
  default: number | string | boolean | null;
}

export function extractScriptVars(source: string): ScriptVarDef[] {
  if (!source || !source.trim()) return [];
  try {
    const program = new Parser(tokenize(source)).parseProgram();
    const out: ScriptVarDef[] = [];
    const seen = new Set<string>();
    for (const stmt of (program.body as Node[])) {
      if (!stmt || stmt.type !== 'VarDecl') continue;
      const name: string = stmt.name;
      const v = stmt.value;
      if (!name || name.startsWith('_') || seen.has(name) || !v) continue;
      if (v.type === 'Num')       { out.push({ key: name, type: 'number',  default: Number(v.value) });   seen.add(name); }
      else if (v.type === 'Str')  { out.push({ key: name, type: 'string',  default: String(v.value) });   seen.add(name); }
      else if (v.type === 'Bool') { out.push({ key: name, type: 'boolean', default: Boolean(v.value) }); seen.add(name); }
      else if (v.type === 'Null') { out.push({ key: name, type: 'object',  default: null });             seen.add(name); }
    }
    return out;
  } catch {
    return [];
  }
}
