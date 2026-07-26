import {canonicalJson} from "./cheng_semantic_matrix_m9023.ts";

const FORBIDDEN_COMPATIBILITY_KEY =
  /(?:compatibility|legacy|v1|v2)/i;

class UniqueCurrentJsonParser {
  private index = 0;

  constructor(
    private readonly source: string,
    private readonly label: string,
  ) {}

  parse(): unknown {
    this.skipWhitespace();
    this.parseValue();
    this.skipWhitespace();
    if (this.index !== this.source.length) this.fail("trailing_bytes");
    return JSON.parse(this.source) as unknown;
  }

  private fail(reason: string): never {
    throw new Error(`${this.label}_${reason}`);
  }

  private skipWhitespace(): void {
    while (this.index < this.source.length &&
           /[\u0009\u000a\u000d\u0020]/.test(this.source[this.index]!)) {
      this.index += 1;
    }
  }

  private parseValue(): void {
    this.skipWhitespace();
    const ch = this.source[this.index];
    if (ch === "{") {
      this.parseObject();
    } else if (ch === "[") {
      this.parseArray();
    } else if (ch === "\"") {
      this.parseString();
    } else if (ch === "t") {
      this.consumeLiteral("true");
    } else if (ch === "f") {
      this.consumeLiteral("false");
    } else if (ch === "n") {
      this.consumeLiteral("null");
    } else {
      this.parseNumber();
    }
  }

  private parseObject(): void {
    this.index += 1;
    this.skipWhitespace();
    const keys = new Set<string>();
    if (this.source[this.index] === "}") {
      this.index += 1;
      return;
    }
    while (true) {
      if (this.source[this.index] !== "\"") this.fail("object_key_invalid");
      const key = this.parseString();
      if (keys.has(key)) this.fail(`duplicate_key:${key}`);
      if (FORBIDDEN_COMPATIBILITY_KEY.test(key)) {
        this.fail(`forbidden_compatibility_key:${key}`);
      }
      keys.add(key);
      this.skipWhitespace();
      if (this.source[this.index] !== ":") this.fail("object_colon_missing");
      this.index += 1;
      this.parseValue();
      this.skipWhitespace();
      const separator = this.source[this.index];
      if (separator === "}") {
        this.index += 1;
        return;
      }
      if (separator !== ",") this.fail("object_separator_invalid");
      this.index += 1;
      this.skipWhitespace();
    }
  }

  private parseArray(): void {
    this.index += 1;
    this.skipWhitespace();
    if (this.source[this.index] === "]") {
      this.index += 1;
      return;
    }
    while (true) {
      this.parseValue();
      this.skipWhitespace();
      const separator = this.source[this.index];
      if (separator === "]") {
        this.index += 1;
        return;
      }
      if (separator !== ",") this.fail("array_separator_invalid");
      this.index += 1;
      this.skipWhitespace();
    }
  }

  private parseString(): string {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const ch = this.source[this.index]!;
      if (ch === "\"") {
        this.index += 1;
        try {
          const value = JSON.parse(this.source.slice(start, this.index));
          if (typeof value !== "string") this.fail("string_invalid");
          return value;
        } catch {
          this.fail("string_invalid");
        }
      }
      if (ch === "\\") {
        this.index += 1;
        const escape = this.source[this.index];
        if (escape === "u") {
          const hex = this.source.slice(this.index + 1, this.index + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail("string_escape_invalid");
          this.index += 5;
          continue;
        }
        if (escape === undefined || !/["\\/bfnrt]/.test(escape)) {
          this.fail("string_escape_invalid");
        }
      } else if (ch.charCodeAt(0) <= 0x1f) {
        this.fail("string_control_invalid");
      }
      this.index += 1;
    }
    this.fail("string_unterminated");
  }

  private consumeLiteral(literal: string): void {
    if (this.source.slice(this.index, this.index + literal.length) !== literal) {
      this.fail("literal_invalid");
    }
    this.index += literal.length;
  }

  private parseNumber(): void {
    const match =
      /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/
        .exec(this.source.slice(this.index));
    if (match === null) this.fail("value_invalid");
    this.index += match[0].length;
  }
}

export function parseUniqueCurrentJson(
  source: string,
  label: string,
): unknown {
  return new UniqueCurrentJsonParser(source, label).parse();
}

export function assertNoCurrentSchemaCompatibilityKeys(
  value: unknown,
  label: string,
): void {
  const seen = new WeakSet<object>();
  const visit = (entry: unknown): void => {
    if (entry === null || typeof entry !== "object") return;
    if (seen.has(entry)) throw new Error(`${label}_cyclic_object_invalid`);
    seen.add(entry);
    if (Array.isArray(entry)) {
      for (const item of entry) visit(item);
      return;
    }
    for (const [key, child] of Object.entries(entry)) {
      if (FORBIDDEN_COMPATIBILITY_KEY.test(key)) {
        throw new Error(`${label}_forbidden_compatibility_key:${key}`);
      }
      visit(child);
    }
  };
  visit(value);
}

export function assertExactCurrentObjectKeys(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, any> {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      canonicalJson(Object.keys(value).sort()) !==
        canonicalJson([...keys].sort())) {
    throw new Error(`${label}_keys_invalid`);
  }
  assertNoCurrentSchemaCompatibilityKeys(value, label);
}
