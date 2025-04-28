import { expect } from "@std/expect";
import { describe, test } from "@std/testing/bdd";
import { parseRecFunc } from "tiny-ts-parser";
import { fn, number, param, Type, typecheck } from "./recFunc.ts";

function run(code: string): Type {
    return typecheck(parseRecFunc(code), {});
}

function ok(code: string, expected: string) {
    const t = run(code);
    expect(t.tag).toEqual(expected);
}

function strictOk(code: string, expected: Type) {
    expect(run(code)).toEqual(expected);
}

function ng(code: string, expected?: RegExp) {
    expect(() => run(code)).toThrow(expected);
}

test("trueはBoolean型と判定される", () => ok("true", "Boolean"));
test("falseはBoolean型と判定される", () => ok("false", "Boolean"));
test("Number型はNumber型と判定される", () => ok("42", "Number"));

describe("add", () => {
    test("Number型とNumber型のaddはNumber型と判定される", () => ok("42 + 42", "Number"));
    test("Number型とBoolean型のaddは型エラーが発生する", () => ng("42 + true", /number expected/));
});

describe("if", () => {
    // test("if文の条件がBooleanでないとき、型エラーが発生する", () =>
    //     ng("if (42) { 42 } else { 42 }", /boolean expected/));
    test("condは任意の型が利用できる", () => ok("if (42) { return 42 } else { return 42 }", "Number"));
    test("condの項の型チェックされる", () => ng("if (1+true) { return 42 } else { return 42 }", /number expected/));
    test("then/elseの型が同一のとき、その型がif文の型と判定される", () =>
        ok("if (true) { return 42 } else { return 42 }", "Number"));
    test("then/elseの型が異なる場合は例外を発生させる", () =>
        ng("if (true) { return 42 } else { return true }", /branches must have the same type/));
});

describe("funcion", () => {
    test("関数を引数として受け取る関数の場合、引数の型は関数として判定される", () =>
        strictOk(
            "((f: (x: number) => number) => f(1))",
            fn(
                [param("f", fn([param("x", number())], number()))],
                number(),
            ),
        ));
    test("定義された型と異なる型の引数が渡された場合、型エラーが発生する", () =>
        ng("((x: number) => 42)(true)", /argument type mismatch/));
    test("未定義引数を参照する場合、型エラーが発生する", () => ng("(x: number) => y", /Unknown variable: /));
    test("定義された関数と呼び出し時のパラメータの数が異なる場合、型エラーが発生する", () =>
        ng("((x: number) => 42)(1, 2, 3)", /wrong number of arguments/));

    test("(演習問題): 無名関数の返り値の型と実装の型が合わないとき、型エラーが発生する", () =>
        ng("(n: number): boolean => 42", /wrong return type/));
});

describe("seq/const", () => {
    test("定義された変数が参照された場合、定義された変数の型と判定される", () => strictOk("const x = 42; x", number()));
    test("同じ変数が定義された場合、後に定義された変数の型と判定される(TypeScriptとは異なる)", () =>
        strictOk("const x = 42; const x = true; x", { tag: "Boolean" }));
    test("定義された関数が参照された場合、定義された関数の型と判定される", () =>
        strictOk(
            `
            const add = (x: number, y: number) => x + y;
            const select = (b: boolean, x: number, y: number) => b ? x : y;

            const x = add(1, add(2, 3));
            const y = select(true, x, x);

            y;
        `,
            number(),
        ));
});

describe("recFunc", () => {
    test("関数の実装中に自信を呼び出す処理があるとき、型チェックに成功する", () => {
        strictOk(
            `
            function f(x: number): number { return f(x); }
            f
            `,
            fn(
                [param("x", number())],
                number(),
            ),
        );
    });
});
