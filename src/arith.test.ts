import { expect } from "@std/expect";
import { describe, test } from "@std/testing/bdd";
import { parseArith } from "tiny-ts-parser";
import { Type, typecheck } from "./arith.ts";

function run(code: string): Type {
    return typecheck(parseArith(code));
}

function ok(code: string, expected: string) {
    const t = run(code);
    expect(t.tag).toEqual(expected);
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
