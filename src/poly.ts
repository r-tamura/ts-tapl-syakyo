/**
 * 第3章 関数型
 */
import { error, parsePoly } from "tiny-ts-parser";

export type Type =
    | { tag: "Boolean" }
    | { tag: "Number" }
    | { tag: "Func"; params: Param[]; retType: Type }
    | { tag: "TypeAbs"; typeParams: string[]; type: Type }
    | { tag: "TypeVar"; name: string };

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

export function typeAbs(
    typeParamNames: string[],
    type: Type,
): Type {
    return {
        tag: "TypeAbs",
        typeParams: typeParamNames,
        type,
    };
}

export function typeVar(name: string): Type {
    return { tag: "TypeVar", name };
}

/**
 * 型抽象の1つの型変数に型代入をした型を返す
 * @param targetType 型代入対象の型
 * @param typeVarName 型変数名
 * @param concreteType 代入される具体的な型
 * @returns 1つ型代入された型
 */
export function substitute(targetType: Type, typeVarName: string, concreteType: Type): Type {
    switch (targetType.tag) {
        case "Boolean":
        case "Number": {
            return targetType;
        }
        case "Func": {
            const params = targetType.params.map(({ name, type }) => ({
                name,
                type: substitute(type, typeVarName, concreteType),
            }));
            const retType = substitute(targetType.retType, typeVarName, concreteType);
            return fn(params, retType);
        }
        case "TypeAbs": {
            const substitutedType = substitute(targetType.type, typeVarName, concreteType);
            return typeAbs(targetType.typeParams, substitutedType);
        }
        case "TypeVar": {
            return targetType.name === typeVarName ? concreteType : targetType;
        }
        default: {
            throw new Error(`not supported type: ${targetType satisfies never}`);
        }
    }
}

type TypeVarMap = Record<string, string>;

export function typeEqRec(type1: Type, type2: Type, typeVarMap: TypeVarMap): boolean {
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
                if (!typeEqRec(type1.params[i].type, type2.params[i].type, typeVarMap)) {
                    return false;
                }
            }
            if (!typeEqRec(type1.retType, type2.retType, typeVarMap)) {
                return false;
            }
            return true;
        }
        case "TypeAbs": {
            if (type1.tag !== "TypeAbs") {
                return false;
            }
            if (type1.typeParams.length !== type2.typeParams.length) {
                return false;
            }
            // type1とtype2の型変数の対応表を作成
            const newTypeVarMap = { ...typeVarMap };
            for (let i = 0; i < type1.typeParams.length; i++) {
                newTypeVarMap[type1.typeParams[i]] = type2.typeParams[i];
            }
            return typeEqRec(type1.type, type2.type, newTypeVarMap);
        }
        case "TypeVar": {
            if (type1.tag !== "TypeVar") {
                return false;
            }
            if (typeVarMap[type1.name] === undefined) {
                throw new Error(`unknown type variable: ${type1.name}}`);
            }
            return true;
        }
        default: {
            throw new Error(`Invalid term type: ${type2 satisfies never}`);
        }
    }
}

function typeEq(type1: Type, type2: Type, typeVars: string[]): boolean {
    const typeVarMap = typeVars.reduce((typeVarMap, typeVar) => {
        typeVarMap[typeVar] = typeVar;
        return typeVarMap;
    }, {} as TypeVarMap);
    return typeEqRec(type1, type2, typeVarMap);
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
    | { tag: "const"; name: string; init: Term; rest: Term }
    // 型抽象
    // 例: <T>(x: T) => T
    // - "body"には"func"項のみ
    // - TAPLでは任意の項が置ける
    | { tag: "typeAbs"; typeParams: string[]; body: Term }
    // 型適用
    | { tag: "typeApp"; typeAbs: Term; typeArgs: Type[] };

/**
 * 項(型を判定します
 * @param t 項
 * @param typeEnv 型環境
 * @param typeVarNames 型変数のリスト
 * @returns 判定された型
 *
 * @example 型チェックに成功したとき
 * ```ts
 * const t = { tag: "if", cond: { tag: "true" }, thn: { tag: "number", n: 42 }, els: { tag: "number", n: 0 } } as const;
 * const type = typecheck(t, {}, []);
 * // { tag: "Number" }
 * ```
 *
 * @example 型チェックに失敗したとき
 * ```ts
 * const t = { tag: "if", cond: { tag: "true" }, thn: { tag: "number", n: 42 }, els: { tag: "number", n: 0 } } as const;
 * const type = typecheck(t, {}, []);
 * // TypeError: branches must have the same type
 * ```
 *
 * @throws {TypeError} 型が不正な場合
 */
export function typecheck(t: Term, typeEnv: TypeEnv, typeVarNames: string[]): Type {
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
            const left = typecheck(t.left, typeEnv, typeVarNames);
            if (left.tag !== "Number") {
                throw error("number expected", t.left);
            }
            const right = typecheck(t.right, typeEnv, typeVarNames);
            if (right.tag !== "Number") {
                throw error("number expected", t.right);
            }
            return { tag: "Number" };
        }
        case "if": {
            // 第2章 演習問題
            // if文の条件式には任意の型が利用できるが、型チェックは行われる
            // if (1 + true) のような場合は型エラーを発生させる
            const _cond = typecheck(t.cond, typeEnv, typeVarNames);
            const then = typecheck(t.thn, typeEnv, typeVarNames);
            const elseTerm = typecheck(t.els, typeEnv, typeVarNames);
            if (then.tag !== elseTerm.tag) {
                throw error("branches must have the same type", t);
            }
            return then;
        }
        case "var": {
            if (!(t.name in typeEnv)) {
                throw error(`Unknown variable: ${t.name}`, t);
            }
            return typeEnv[t.name];
        }
        case "func": {
            const newTypeEnv = { ...typeEnv };
            for (const param of t.params) {
                newTypeEnv[param.name] = param.type;
            }
            const retType = typecheck(t.body, newTypeEnv, typeVarNames);
            return { tag: "Func", params: t.params, retType };
        }
        case "call": {
            const funcType = typecheck(t.func, typeEnv, typeVarNames);
            if (funcType.tag !== "Func") {
                throw error("function expected", t.func);
            }
            if (t.args.length !== funcType.params.length) {
                throw error("wrong number of arguments", t);
            }
            for (let i = 0; i < t.args.length; i++) {
                const argType = typecheck(t.args[i], typeEnv, typeVarNames);
                if (!typeEq(argType, funcType.params[i].type, typeVarNames)) {
                    throw error("argument type mismatch", t.args[i]);
                }
            }
            return funcType.retType;
        }
        case "seq": {
            typecheck(t.body, typeEnv, typeVarNames);
            return typecheck(t.rest, typeEnv, typeVarNames);
        }
        case "const": {
            const initType = typecheck(t.init, typeEnv, typeVarNames);
            const newTypeEnv = TypeEnv.define(typeEnv, t.name, initType);
            return typecheck(t.rest, newTypeEnv, typeVarNames);
        }
        case "typeAbs": {
            const newTypeVarNames = [...typeVarNames, ...t.typeParams];
            const bodyType = typecheck(t.body, typeEnv, newTypeVarNames);
            return typeAbs(t.typeParams, bodyType);
        }
        case "typeApp": {
            const bodyType = typecheck(t.typeAbs, typeEnv, typeVarNames);
            if (bodyType.tag !== "TypeAbs") {
                error("type abstraction expected", t.typeAbs);
            }
            if (t.typeArgs.length !== bodyType.typeParams.length) {
                error("wrong number of type arguments", t);
            }
            return bodyType.typeParams.reduce(
                (substitutedType, _, i) => substitute(substitutedType, bodyType.typeParams[i], t.typeArgs[i]),
                bodyType.type,
            );
        }
        default:
            throw error(`Invalid term type: ${t satisfies never}`, t);
    }
}

if (import.meta.main) {
    typecheck(parsePoly("42 + 1"), {}, []);
}
