/**
 * 第3章 関数型
 * objとrecFuncの機能をマージし、オブジェクトとその再帰関数の両方をサポートする型システム
 */
import { error, parseRec } from "tiny-ts-parser";

type PropertyType = { name: string; type: Type };

type Rec = { tag: "Rec"; name: string; type: Type };

export type Type =
    | { tag: "Boolean" }
    | { tag: "Number" }
    | { tag: "Func"; params: Param[]; retType: Type }
    | { tag: "Object"; props: PropertyType[] }
    /*
     * // μX. { foo: X }
     * {
     *   tag: "Rec",
     *   name: "X",
     *   type: {
     *     tag: "Object",
     *     props: [
     *       { name: "foo", type: { tag: "TypeVar", name: "X" } },
     *     ]
     *   }
     * }
     */
    | Rec
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

export function object(props: PropertyType[]): Type {
    return { tag: "Object", props };
}

export function rec(name: string, recType: Type): Rec {
    return { tag: "Rec", name, type: recType };
}

export function prop(name: string, type: Type): PropertyType {
    return { name, type };
}

export function typeVar(name: string): Type {
    return { tag: "TypeVar", name };
}

function expandType(type: Type, typeVarName: string, repType: Type): Type {
    switch (type.tag) {
        case "Boolean":
        case "Number": {
            return type;
        }
        case "Func": {
            const params = type.params.map(({ name, type }) => ({
                name,
                type: expandType(type, typeVarName, repType),
            }));
            const retType = expandType(type.retType, typeVarName, repType);
            return fn(params, retType);
        }
        case "Object": {
            const props = type.props.map(({ name, type }) => ({
                name,
                type: expandType(type, typeVarName, repType),
            }));
            return object(props);
        }
        case "Rec": {
            const recType = type;
            if (recType.name === typeVarName) {
                // これ以上展開する必要はない
                return recType;
            }
            const expandedType = expandType(recType.type, typeVarName, repType);
            return rec(recType.name, expandedType);
        }
        case "TypeVar": {
            return type.name === typeVarName ? repType : type;
        }
        default: {
            throw new Error(`unsupported type ${type satisfies never}`);
        }
    }
}

function unwrapRecType(type: Type): Type {
    switch (type.tag) {
        case "Rec":
            return unwrapRecType(expandType(type.type, type.name, type));
        default:
            return type;
    }
}

type TypeVarNameMap = Record<string, string>;

function typeEqNaive(type1: Type, type2: Type, typeVarMap: TypeVarNameMap): boolean {
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
                if (!typeEqNaive(type1.params[i].type, type2.params[i].type, typeVarMap)) {
                    return false;
                }
            }
            if (!typeEqNaive(type1.retType, type2.retType, typeVarMap)) {
                return false;
            }
            return true;
        }
        case "Object": {
            if (type1.tag !== "Object") {
                return false;
            }
            if (type1.props.length !== type2.props.length) {
                return false;
            }
            for (const prop2 of type2.props) {
                const prop1 = type1.props.find((prop) => prop.name === prop2.name);
                if (!prop1) {
                    return false;
                }
                if (!typeEqNaive(prop1.type, prop2.type, typeVarMap)) {
                    return false;
                }
            }
            return true;
        }
        case "Rec": {
            if (type1.tag !== "Rec") {
                return false;
            }
            const newTypeVarMap = { ...typeVarMap, [type1.name]: type2.name };
            return typeEqNaive(type1.type, type2.type, newTypeVarMap);
        }
        case "TypeVar": {
            if (type1.tag !== "TypeVar") {
                return false;
            }
            if (typeVarMap[type1.name] === undefined) {
                throw new Error(`unknown type variable: ${type1.name}`);
            }
            return typeVarMap[type1.name] === type2.name;
        }
        default: {
            throw new Error(`Invalid term type: ${type2 satisfies never}`);
        }
    }
}

type SeenTypePair = [t1: Type, t2: Type];

function hasSeen(type1: Type, type2: Type, seen: SeenTypePair[]): boolean {
    for (const [seenType1, seenType2] of seen) {
        if (
            typeEqNaive(seenType1, type1, {}) &&
            typeEqNaive(seenType2, type2, {})
        ) {
            return true;
        }
    }
    return false;
}

function typeEqSub(type1: Type, type2: Type, seen: SeenTypePair[]): boolean {
    if (hasSeen(type1, type2, seen)) {
        return true;
    }

    if (type1.tag === "Rec") {
        return typeEqSub(unwrapRecType(type1), type2, [...seen, [type1, type2]]);
    }
    if (type2.tag === "Rec") {
        return typeEqSub(type1, unwrapRecType(type2), [...seen, [type1, type2]]);
    }

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
                if (!typeEqSub(type1.params[i].type, type2.params[i].type, seen)) {
                    return false;
                }
            }
            if (!typeEqSub(type1.retType, type2.retType, seen)) {
                return false;
            }
            return true;
        }
        case "Object": {
            if (type1.tag !== "Object") {
                return false;
            }
            if (type1.props.length !== type2.props.length) {
                return false;
            }
            for (const prop2 of type2.props) {
                const prop1 = type1.props.find((prop) => prop.name === prop2.name);
                if (!prop1) {
                    return false;
                }
                if (!typeEqSub(prop1.type, prop2.type, seen)) {
                    return false;
                }
            }
            return true;
        }
        case "TypeVar": {
            throw "unreachable";
        }
        default: {
            throw new Error(`Invalid term type: ${type2 satisfies never}`);
        }
    }
}

function typeEq(type1: Type, type2: Type): boolean {
    return typeEqSub(type1, type2, []);
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

type PropertyTerm = { name: string; term: Term };

type Term =
    | { tag: "true" }
    | { tag: "false" }
    | { tag: "if"; cond: Term; thn: Term; els: Term }
    | { tag: "number"; n: number }
    | { tag: "add"; left: Term; right: Term }
    | { tag: "var"; name: string }
    | { tag: "func"; params: Param[]; retType?: Type; body: Term }
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
    | { tag: "objectNew"; props: PropertyTerm[] }
    | { tag: "objectGet"; obj: Term; propName: string }
    | { tag: "recFunc"; funcName: string; params: Param[]; retType: Type; body: Term; rest: Term };

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
            if (unwrapRecType(left).tag !== "Number") {
                throw error("number expected", t.left);
            }
            const right = typecheck(t.right, typeEnv);
            if (unwrapRecType(right).tag !== "Number") {
                throw error("number expected", t.right);
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
            if (unwrapRecType(then).tag !== unwrapRecType(elseTerm).tag) {
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
            const retType = typecheck(t.body, newTypeEnv);
            if (t.retType && !typeEq(t.retType, retType)) {
                error("wrong return type", t);
            }
            return fn(t.params, retType);
        }
        case "call": {
            const funcType = unwrapRecType(typecheck(t.func, typeEnv));
            if (funcType.tag !== "Func") {
                throw error("function expected", t.func);
            }
            if (t.args.length !== funcType.params.length) {
                throw error("wrong number of arguments", t);
            }
            for (let i = 0; i < t.args.length; i++) {
                const argType = typecheck(t.args[i], typeEnv);
                if (!typeEq(argType, funcType.params[i].type)) {
                    throw error("argument type mismatch", t.args[i]);
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
        case "objectNew": {
            const props = t.props.map((prop) => ({
                name: prop.name,
                type: typecheck(prop.term, typeEnv),
            }));
            return object(props);
        }
        case "objectGet": {
            const objType = unwrapRecType(typecheck(t.obj, typeEnv));

            if (objType.tag !== "Object") {
                console.error(`got %o`, t);
                throw error("object expected", t.obj);
            }

            const prop = objType.props.find((prop) => prop.name === t.propName);
            if (!prop) {
                throw error(`Unknown property: ${t.propName}`, t);
            }

            return prop.type;
        }
        case "recFunc": {
            let newTypeEnvInnerFunc = TypeEnv.clone(typeEnv);
            let newTypeEnvOuterFunc = TypeEnv.clone(typeEnv);

            /* 関数内の型チェック用型環境
             * 関数名 + 関数の引数が参照できる
             */
            // 自身の関数を型環境に定義(funcと違うところ))
            newTypeEnvInnerFunc = TypeEnv.define(newTypeEnvInnerFunc, t.funcName, fn(t.params, t.retType));
            // 関数の引数を型環境に定義（funcと同じ)
            for (const param of t.params) {
                newTypeEnvInnerFunc = TypeEnv.define(newTypeEnvInnerFunc, param.name, param.type);
            }
            const retType = typecheck(t.body, newTypeEnvInnerFunc);
            // 自身の返り値とbodyの返り値が一致していない場合はエラー(funcと違うところ)
            if (!typeEq(t.retType, retType)) {
                error("wrong return type", t);
            }

            /* 関数外の型チェック用型環境
             * 関数名だけ参照できる
             */
            // 再帰呼び出しができるように関数の型を登録
            const recFunctionType = fn(t.params, t.retType);
            newTypeEnvOuterFunc = TypeEnv.define(newTypeEnvOuterFunc, t.funcName, recFunctionType);
            return typecheck(t.rest, newTypeEnvOuterFunc);
        }
        default:
            throw error(`Invalid term type: ${t satisfies never}`, t);
    }
}

if (import.meta.main) {
    const t = typecheck(
        parseRec(`
    type NumStream = { num: number; rest: () => NumStream };
    function numbers(n: number): NumStream {
        return { num: n, rest: () => numbers(n + 1) };
    }
    const ns1 = numbers(1);
    // const ns1 = { num: 42 };
    const ns2 = ns1.rest();
`),
        {},
    );

    console.dir(
        t,
        { depth: null },
    );
}
