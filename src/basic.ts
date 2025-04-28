/**
 * 第3章 関数型
 */
import { parseBasic } from "tiny-ts-parser";

export type Type =
    | { tag: "Boolean" }
    | { tag: "Number" }
    | { tag: "Func"; params: Param[]; retType: Type };

export function boolean(): Type {
    return { tag: "Boolean" };
}

export function number(): Type {
    return { tag: "Number" };
}

export function param(name: string, type: Type): Param {
    return { name, type };
}

export function fn(
    params: Param[],
    retType: Type,
): Type {
    return { tag: "Func", params, retType };
}

class UnknownVariableError extends Error {
    static {
        this.prototype.name = "UnknownVariableError";
    }
}

/*
 * Note: TypeScript以外の言語では引数名はないのが一般的だが、TypeScriptでは引数名を省略できないので、引数名を持たせる
 */
export type Param = { name: string; type: Type };

type Term =
    | { tag: "true" }
    | { tag: "false" }
    | { tag: "if"; cond: Term; thn: Term; els: Term }
    | { tag: "number"; n: number }
    | { tag: "add"; left: Term; right: Term }
    | { tag: "var"; name: string }
    | { tag: "func"; params: Param[]; body: Term }
    | { tag: "call"; func: Term; args: Term[] }
    /*
        例: `1; 2; 3;`の場合
        ```
       {
         tag: "seq",
         body: { tag: "number", n: 1 },
         rest: {
            tag: "seq",
            body: { tag: "number", n: 2 },
            rest: { tag: "number", n: 3 }
        }
       }
        ```
    */
    | { tag: "seq"; body: Term; rest: Term }
    // 例: `const x = 1; x;`の場合
    // > { tag: "const"; name: "x"; init: { tag: "number", n: 1 }; rest: { tag: "number", n: 1 } };
    | { tag: "const"; name: string; init: Term; rest: Term };

function typeEq(type1: Type, type2: Type): boolean {
    switch (type2.tag) {
        case "Boolean":
        case "Number":
            return type1.tag === type2.tag;
        case "Func": {
            /*
                2の関数型が等価であるためには、次の3つを満たす必要がある
                    - 仮引数の数が同じ
                    - 仮引数の型がすべて一致する
                    - 返り値の型一致する
            */
            if (type1.tag !== "Func") {
                return false;
            }
            if (type1.params.length !== type2.params.length) {
                return false;
            }
            for (let i = 0; i < type2.params.length; i++) {
                if (!typeEq(type1.params[i].type, type2.params[i].type)) {
                    return false;
                }
            }
            if (!typeEq(type1.retType, type2.retType)) {
                return false;
            }
            return true;
        }
        default: {
            throw new Error(`Invalid term type: ${type2 satisfies never}`);
        }
    }
}

/** 型環境 変数名と型の対応表 */
type TypeEnv = Record<string, Type>;

const TypeEnv = {
    /**
     * 型環境のコピーを作成します
     * @returns
     */
    clone(typeEnv: TypeEnv): TypeEnv {
        return { ...typeEnv };
    },

    /**
     * 変数を定義した新しい型環境を返します
     * @returns
     */
    define(typeEnv: TypeEnv, name: string, type: Type): TypeEnv {
        const newTypeEnv = this.clone(typeEnv);
        newTypeEnv[name] = type;
        return newTypeEnv;
    },
};

/**
 * 項(型を判定します
 * @param t 項
 * @returns 判定された型
 *
 * @example 型チェックに成功したとき
 * ```ts
 * const t = { tag: "if", cond: { tag: "true" }, thn: { tag: "number", n: 42 }, els: { tag: "number", n: 0 } } as const;
 * const type = typecheck(t, {});
 * // { tag: "Number" }
 * ```
 *
 * @example 型チェックに失敗したとき
 * ```ts
 * const t = { tag: "if", cond: { tag: "true" }, thn: { tag: "number", n: 42 }, els: { tag: "number", n: 0 } } as const;
 * const type = typecheck(t, {});
 * // TypeError: branches must have the same type
 * ```
 *
 * @throws {TypeError} 型が不正な場合
 */
export function typecheck(t: Term, typeEnv: TypeEnv): Type {
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
            const left = typecheck(t.left, typeEnv);
            if (left.tag !== "Number") {
                throw new TypeError("number expected");
            }
            const right = typecheck(t.right, typeEnv);
            if (right.tag !== "Number") {
                throw new TypeError("number expected");
            }
            return { tag: "Number" };
        }
        case "if": {
            // 第2章 演習問題
            // if文の条件式には任意の型が利用できるが、型チェックは行われる
            // if (1 + true) のような場合は型エラーを発生させる
            const _cond = typecheck(t.cond, typeEnv);
            const then = typecheck(t.thn, typeEnv);
            const elseTerm = typecheck(t.els, typeEnv);
            if (then.tag !== elseTerm.tag) {
                throw new TypeError("branches must have the same type");
            }
            return then;
        }
        case "var": {
            if (!(t.name in typeEnv)) {
                throw new UnknownVariableError(`Unknown variable: ${t.name}`);
            }
            return typeEnv[t.name];
        }
        case "func": {
            const newTypeEnv = { ...typeEnv };
            for (const param of t.params) {
                newTypeEnv[param.name] = param.type;
            }
            const retType = typecheck(t.body, newTypeEnv);
            return { tag: "Func", params: t.params, retType };
        }
        case "call": {
            const funcType = typecheck(t.func, typeEnv);
            if (funcType.tag !== "Func") {
                throw new TypeError("function expected");
            }
            if (t.args.length !== funcType.params.length) {
                throw new TypeError("wrong number of arguments");
            }
            for (let i = 0; i < t.args.length; i++) {
                const argType = typecheck(t.args[i], typeEnv);
                if (!typeEq(argType, funcType.params[i].type)) {
                    throw new TypeError("argument type mismatch");
                }
            }
            return funcType.retType;
        }
        case "seq": {
            typecheck(t.body, typeEnv);
            return typecheck(t.rest, typeEnv);
        }
        case "const": {
            const initType = typecheck(t.init, typeEnv);
            const newTypeEnv = TypeEnv.define(typeEnv, t.name, initType);
            return typecheck(t.rest, newTypeEnv);
        }
        default:
            throw new Error(`Invalid term type: ${t satisfies never}`);
    }
}

if (import.meta.main) {
    typecheck(parseBasic("42 + 1"), {});
}
