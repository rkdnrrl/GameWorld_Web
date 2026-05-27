'use client';
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
 *   net.sendAll(event, data) / net.sendTo(playerId, event, data)
 *   print(...) / console.log(...)
 *   Math.sin / cos / abs / floor / ceil / round / random / PI / min / max / sqrt / pow / atan2
 *
 * 이벤트 함수 (사용자가 정의하면 자동 호출):
 *   function onStart()
 *   function onUpdate(dt)
 *   function onNetEvent(event, data, fromId)
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
      throw new Error(`[line ${line}] 알 수 없는 문자: ${c}`);
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

  init(source: string, obj: JsObjectAPI, worldApi: JsWorldAPI, netApi: JsNetAPI): void {
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

      const MathLib = {
        sin: Math.sin, cos: Math.cos, tan: Math.tan, atan: Math.atan, atan2: Math.atan2,
        abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
        random: Math.random, sqrt: Math.sqrt, pow: Math.pow,
        min: Math.min, max: Math.max,
        PI: Math.PI, E: Math.E,
      };

      const console_ = { log: print };

      this.interp = new Interpreter({
        self, world, net,
        Math: MathLib,
        console: console_,
        print,
      });

      // 파싱 + 모듈 코드 실행 (변수 init, 함수 선언 등)
      // ⚠️ onStart 는 여기서 호출 X — callStart() 로 분리됨.
      // 멀티에서 hostId 알기 전에 onStart 가 돌면 world.isHost() 가 false 로 잘못 반환됨.
      const tokens = tokenize(source);
      const parser = new Parser(tokens);
      const program = parser.parseProgram();
      this.interp.run(program);
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
      if (!this.errors.includes(msg)) this.errors.push(msg);
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

  destroy(): void {
    this.interp = null;
    this.ready = false;
  }
}
