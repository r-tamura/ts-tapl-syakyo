import { expect } from "@std/expect";
import { describe, test } from "@std/testing/bdd";
import { parseSub } from "tiny-ts-parser";
import { boolean, fn, number, object, param, subtype, Type, typecheck } from "./sub.ts";

function run(code: string): Type {
    return typecheck(parseSub(code), {});
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

describe("object", () => {
    test("オブジェクトの型チェックをすることができる", () =>
        strictOk("({ a: 42, b: true })", object([{ name: "a", type: number() }, { name: "b", type: boolean() }])));
    test("関数の引数の型がオブジェクトで定義され、完全一致する型が渡された場合、型チェックに成功する", () =>
        strictOk(
            `
            const func = (obj: { a: number, b: boolean }) => obj;
            func({ a: 42, b: true });
            `,
            object([
                { name: "a", type: number() },
                { name: "b", type: boolean() },
            ]),
        ));
    test("オブジェクトのプロパティの型が一致しない場合、型エラーが発生する", () =>
        ng(
            `
            const func = (obj: { a: number, b: boolean }) => obj;
            func({ a: 42, b: 42 });
            `,
            /argument type mismatch/,
        ));
    test("関数の引数の型がオブジェクトで定義され、そのサブタイプが渡された場合、型エラーが発生する", () =>
        ng(
            `
            const func = (obj: { a: number, b: boolean }) => obj;
            func({ a: 42 , b: true, c: 42 });
            `,
            /argument type mismatch/,
        ));
    test("オブジェクトのプロパティが存在するとき、そのプロパティの型チェックに成功する", () =>
        strictOk(
            `
            const obj = { a: 42, b: true };
            obj.a;
            `,
            number(),
        ));
    test("オブジェクトでない変数のプロパティを参照した場合、型エラーが発生する", () =>
        ng("const obj = 42; obj.a", /object expected/));
    test("オブジェクトのプロパティが存在しない場合、型エラーが発生する", () =>
        ng(
            `
            const obj = { a: 42, b: true };
            obj.c;
            `,
            /Unknown property: c/,
        ));
    test("オブジェクトのプロパティがオブジェクトである場合、型チェックに成功する", () =>
        strictOk(
            "({ a: 42, b: { c: true } })",
            object([{ name: "a", type: number() }, { name: "b", type: object([{ name: "c", type: boolean() }]) }]),
        ));
});

describe("sub", () => {
    describe("subtype function", () => {
        test("subobj", () => {
            const actual = subtype(
                object([
                    { name: "foo", type: number() },
                    { name: "bar", type: number() },
                ]),
                object([
                    { name: "foo", type: number() },
                ]),
            );
            expect(actual).toBe(true);
        });
    });

    test("実引数が仮引数の部分型の場合、型チェックに成功する", () => {
        strictOk(
            `
        const f = (x: { foo: number }) => x.foo;
        const x = { foo: 1, bar: true };
        f(x);
        `,
            number(),
        );
    });

    test("(関数引数: 共変) 型Aが型Bの部分型のとき、型`() => A`は型`() => B`の部分型", () =>
        strictOk(
            `
            const f = (x: () => { foo: number, bar: boolean }) => x();
            const g = () => ({ foo: 42, bar: true, baz: true });
            f(g)
        `,
            object([
                { name: "foo", type: number() },
                { name: "bar", type: boolean() },
            ]),
        ));
    test("(関数引数: 反変) 型Aが型Bの部分型のとき、型`(x: B) => any`は型`(x: A) => any`の部分型", () =>
        strictOk(
            `
            const f = (x: (x: { foo: number, bar: boolean }) => number) => x({ foo: 1, bar: true });
            const g = (x: { foo: number; }) => x.foo;
            f(g)
            `,
            number(),
        ));

    test("(関数引数: 反変) 型Aが型Bの部分型でないとき、型`(x: B) => any`は型`(x: A) => any)`は部分型ではない", () =>
        ng(
            `
            const f = (x: (x: { foo: number }) => number) => x({ foo: 1  });
            const g = (x: { foo: number; bar: boolean }) => x.foo;
            f(g)
        `,
            /argument type mismatch/,
        ));
});
