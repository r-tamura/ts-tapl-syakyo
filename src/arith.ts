export type Type =
    | { tag: "Boolean" }
    | { tag: "Number" };

type Term =
    | { tag: "true" }
    | { tag: "false" }
    | { tag: "if"; cond: Term; thn: Term; els: Term }
    | { tag: "number"; n: number }
    | { tag: "add"; left: Term; right: Term };

/**
 * 項(型を判定します
 * @param t 項
 * @returns 判定された型
 *
 * @example 型チェックに成功したとき
 * ```ts
 * const t = { tag: "if", cond: { tag: "true" }, thn: { tag: "number", n: 42 }, els: { tag: "number", n: 0 } } as const;
 * const type = typecheck(t);
 * // { tag: "Number" }
 * ```
 *
 * @example 型チェックに失敗したとき
 * ```ts
 * const t = { tag: "if", cond: { tag: "true" }, thn: { tag: "number", n: 42 }, els: { tag: "number", n: 0 } } as const;
 * const type = typecheck(t);
 * // TypeError: branches must have the same type
 * ```
 *
 * @throws {TypeError} 型が不正な場合
 */
export function typecheck(t: Term): Type {
    /*
    Note: 書籍中では文字列をthrowしているが、deno testのテストのマッチャーtoThrowはError型を想定しているのでTypeErrorをthrowするように変更
    */
    switch (t.tag) {
        case "true":
        case "false":
            return { tag: "Boolean" };
        case "number":
            return { tag: "Number" };
        case "add": {
            const left = typecheck(t.left);
            if (left.tag !== "Number") {
                throw new TypeError("number expected");
            }
            const right = typecheck(t.right);
            if (right.tag !== "Number") {
                throw new TypeError("number expected");
            }
            return { tag: "Number" };
        }
        case "if": {
            const cond = typecheck(t.cond);
            if (cond.tag !== "Boolean") {
                throw new TypeError("boolean expected");
            }
            const then = typecheck(t.thn);
            const elseTerm = typecheck(t.els);
            if (then.tag !== elseTerm.tag) {
                throw new TypeError("branches must have the same type");
            }
            return then;
        }
        default:
            throw new Error(`Invalid term type: ${t satisfies never}`);
    }
}
