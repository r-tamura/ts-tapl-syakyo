import { expect } from "@std/expect";
import { test } from "@std/testing/bdd";
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

test("Number型とNumber型のaddはNumber型と判定される", () => ok("42 + 42", "Number"));
test("Number型とBoolean型のaddは例外を発生させる", () => ng("42 + true", /number expected/));
