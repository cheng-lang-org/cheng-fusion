function normalize(value) {
    if (Array.isArray(value))
        return value.map(normalize);
    if (!value || typeof value !== "object")
        return value;
    const input = value;
    const output = {};
    for (const key of Object.keys(input).sort()) {
        const item = input[key];
        if (item !== undefined)
            output[key] = normalize(item);
    }
    return output;
}
// Mirrors src/core/csg_core/json_canonical.cheng csgJsonCanonicalNumber:
// the strict CLI compares each input line byte-for-byte against its own
// canonical re-emission, so numbers must use the same shortest-of-
// {plain, scientific} decimal form (tie -> plain; |scale| > 4096 ->
// scientific; exponent sign only when negative).
export function canonicalNumberText(input) {
    const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(input);
    if (!match)
        throw new Error(`non-finite or unparsable number: ${input}`);
    const negative = match[1] === "-";
    const integerDigits = match[2];
    const fractionDigits = match[3] ?? "";
    const exponent = match[4] ? parseInt(match[4], 10) : 0;
    let coefficientRaw = integerDigits + fractionDigits;
    let first = 0;
    while (first < coefficientRaw.length && coefficientRaw[first] === "0") {
        first += 1;
    }
    if (first === coefficientRaw.length)
        return "0";
    let finish = coefficientRaw.length;
    while (finish > first && coefficientRaw[finish - 1] === "0") {
        finish -= 1;
    }
    const trailingZeros = coefficientRaw.length - finish;
    const fractionLength = fractionDigits.length;
    coefficientRaw = coefficientRaw.slice(first, finish);
    const scaleDelta = trailingZeros - fractionLength;
    const scale = exponent + scaleDelta;
    if (Math.abs(scale) > 4096) {
        // Matches the CsgJsonMaxPlainScale overflow branch.
        return finishScientific(negative, coefficientRaw, scale + coefficientRaw.length - 1);
    }
    const scientificExponent = scale + coefficientRaw.length - 1;
    let scientific = (negative ? "-" : "") + coefficientRaw[0];
    if (coefficientRaw.length > 1) {
        scientific += "." + coefficientRaw.slice(1);
    }
    if (scientificExponent !== 0) {
        scientific += "e" + String(scientificExponent);
    }
    let plainLength;
    if (scale >= 0) {
        plainLength = coefficientRaw.length + scale;
    }
    else {
        const point = coefficientRaw.length + scale;
        plainLength =
            point > 0
                ? coefficientRaw.length + 1
                : 2 - point + coefficientRaw.length;
    }
    const scientificLength = scientific.length - (negative ? 1 : 0);
    if (plainLength > scientificLength)
        return scientific;
    let plain = negative ? "-" : "";
    if (scale >= 0) {
        plain += coefficientRaw + "0".repeat(scale);
        return plain;
    }
    const point = coefficientRaw.length + scale;
    if (point > 0) {
        plain +=
            coefficientRaw.slice(0, point) + "." + coefficientRaw.slice(point);
        return plain;
    }
    plain += "0." + "0".repeat(-point) + coefficientRaw;
    return plain;
}
function finishScientific(negative, coefficient, exponent) {
    let out = (negative ? "-" : "") + coefficient[0];
    if (coefficient.length > 1)
        out += "." + coefficient.slice(1);
    if (exponent !== 0)
        out += "e" + String(exponent);
    return out;
}
function emit(value) {
    if (value === null || value === undefined)
        return "null";
    const kind = typeof value;
    if (kind === "string")
        return JSON.stringify(value);
    if (kind === "boolean")
        return value ? "true" : "false";
    if (kind === "number")
        return canonicalNumberText(String(value));
    if (Array.isArray(value)) {
        return "[" + value.map(emit).join(",") + "]";
    }
    const record = value;
    // Canonical JSON requires byte-lexicographic key order. Object.keys
    // alone is wrong here: integer-like keys ("3", "10", "520") are returned
    // in ascending numeric order by JS objects, which breaks the contract.
    const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
    return "{" + keys.map((key) => JSON.stringify(key) + ":" + emit(record[key])).join(",") + "}";
}
export function stableJson(value, pretty = false) {
    if (pretty)
        return JSON.stringify(normalize(value), null, 2);
    return emit(normalize(value));
}
