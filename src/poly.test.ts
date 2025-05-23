import { expect } from "@std/expect";
import { describe, test } from "@std/testing/bdd";
import { parsePoly } from "tiny-ts-parser";
import { boolean, fn, number, param, substitute, Type, typeAbs, typecheck, typeEqRec, typeVar } from "./poly.ts";

function run(code: string): Type {
    return typecheck(parsePoly(code), {}, []);
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

describe("poly", () => {
    describe("substitute", () => {
        test("型変数に具体的な型が代入できる", () => {
            const actual = substitute(
                fn(
                    [param("x", typeVar("T"))],
                    typeVar("T"),
                ),
                "T",
                number(),
            );

            expect(actual).toEqual(fn(
                [param("x", number())],
                number(),
            ));
        });
    });

    describe("typeEqRec", () => {
        test("型抽象同士の型変数の定義が同じ場合、同じ型として判定される", () => {
            expect(typeEqRec(
                typeAbs(
                    ["A"],
                    fn(
                        [param("x", typeVar("A"))],
                        typeVar("A"),
                    ),
                ),
                typeAbs(
                    ["B"],
                    fn(
                        [param("x", typeVar("B"))],
                        typeVar("B"),
                    ),
                ),
                {},
            )).toBe(true);
        });

        test("型抽象の型変数の数が異なる場合、異なる型として判定される", () => {
            expect(typeEqRec(
                typeAbs(
                    ["A"],
                    fn(
                        [param("x", typeVar("A"))],
                        typeVar("A"),
                    ),
                ),
                typeAbs(
                    ["B", "C"],
                    fn(
                        [param("x", typeVar("B"))],
                        typeVar("B"),
                    ),
                ),
                {},
            )).toBe(false);
        });
    });

    describe("typecheck", () => {
        test("関数が型変数を持つ場合、型チェックに成功する", () =>
            strictOk(
                `
            const f = <T>(x: T) => x;
            f;
            `,
                typeAbs(["T"], fn([param("x", typeVar("T"))], typeVar("T"))),
            ));

        test("関数が型変数を持ち、型適用されたとき、型チェックに成功する", () =>
            strictOk(
                `
            const f = <T>(x: T) => x;
            f<number>;
            `,
                fn([param("x", number())], number()),
            ));

        describe("異なる型を適用", () => {
            test("number", () =>
                strictOk(
                    `
            const select = <T>(b: boolean, a: T, b: T) => b ? a : b;
            select<number>(true, 1, 2);
            `,
                    number(),
                ));
            test("boolean", () =>
                strictOk(
                    `
            const select = <T>(b: boolean, a: T, b: T) => b ? a : b;
            select<boolean>(true, true, false);
            `,
                    boolean(),
                ));
        });
    });

    describe("shadowing", () => {
        test("shadowing", () => {
            strictOk(
                `
        const foo = <T>(arg1: T, arg2: <T>(x: T) => boolean) => true;
        foo<number>
        `,
                fn(
                    [
                        param("arg1", number()),
                        param(
                            "arg2",
                            typeAbs(
                                ["T"],
                                fn([param("x", typeVar("T"))], boolean()),
                            ),
                        ),
                    ],
                    boolean(),
                ),
            );
        });
    });

    describe("変数捕獲", () => {
        test("外側の型変数を内側で利用できる", () => {
            const inner = typeAbs(
                ["U@1"],
                fn(
                    [param("x", typeVar("U")), param("y", typeVar("U@1"))],
                    boolean(),
                ),
            );
            strictOk(
                `
                const foo = <T>(arg1: T, arg2:<U>(x: T, y: U) => boolean) => true
                const bar = <U>() => foo<U>;
                bar;
                `,
                typeAbs(
                    ["U"],
                    fn(
                        [],
                        fn(
                            [param("arg1", typeVar("U")), param("arg2", inner)],
                            boolean(),
                        ),
                    ),
                ),
            );
        });
    });
});
