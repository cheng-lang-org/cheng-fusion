import { writeFileSync } from "node:fs";

const runtimeCssDeclarationProperties = new Set([
  "align-content",
  "align-items",
  "align-self",
  "aspect-ratio",
  "background-image",
  "background-color",
  "border-radius",
  "border-color",
  "border-bottom-width",
  "border-left-width",
  "border-right-width",
  "border-top-width",
  "border-width",
  "bottom",
  "box-sizing",
  "box-shadow",
  "column-gap",
  "color",
  "display",
  "flex",
  "flex-direction",
  "flex-flow",
  "flex-shrink",
  "flex-wrap",
  "font-family",
  "font-size",
  "font-weight",
  "gap",
  "grid-area",
  "grid-column",
  "grid-row",
  "grid-template-columns",
  "grid-template-rows",
  "height",
  "justify-content",
  "left",
  "line-height",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "opacity",
  "order",
  "overflow",
  "overflow-x",
  "overflow-y",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "pointer-events",
  "position",
  "right",
  "row-gap",
  "text-align",
  "text-overflow",
  "top",
  "transform",
  "white-space",
  "width",
  "word-break",
  "z-index",
]);

const runtimeVariantConditionKinds = new Set([
  "aria",
  "data",
  "group",
  "media",
  "peer",
  "pseudo",
  "state",
  "arbitrary-selector",
]);

const runtimePseudoNames = new Set([
  "active",
  "disabled",
  "focus",
  "hover",
  "placeholder",
]);

const runtimeArbitrarySelectors = new Set([
  "&",
  "&>svg",
  "&_svg",
]);

const staticPaintRuntimeRequiredProperties = new Set([
  "animation-delay",
  "animation-direction",
  "animation-duration",
  "animation-fill-mode",
  "animation-iteration-count",
  "animation-name",
  "animation-play-state",
  "animation-timing-function",
  "text-shadow",
]);

const tailwindMediaMinWidths = new Map([
  ["sm", 640],
  ["md", 768],
  ["lg", 1024],
  ["xl", 1280],
  ["2xl", 1536],
]);

const markerClassTokens = new Set([
  "group",
  "peer",
]);

const disabledTailwindAnimatePluginUtilities = new Set([
  "animate-in",
  "animate-out",
  "fade-in",
  "fade-in-0",
  "fade-out",
  "fade-out-0",
  "zoom-in-90",
  "zoom-in-95",
  "zoom-out-95",
  "slide-in-from-bottom",
  "slide-in-from-bottom-2",
  "slide-in-from-left-52",
  "slide-in-from-right-2",
  "slide-in-from-right-52",
  "slide-in-from-top-2",
  "slide-out-to-bottom",
  "slide-out-to-left-52",
  "slide-out-to-right-52",
]);

const semanticClassPrefixes = [
  "app-",
  "csg-",
  "game-",
  "mahjong-",
  "node-",
  "safe-area-",
  "unimaker-",
];

export function analyzeSceneDomCssCoverage(sceneFacts, options = {}) {
  const facts = Array.isArray(sceneFacts) ? sceneFacts : [];
  const sampleLimit = Number.isInteger(options.sampleLimit) && options.sampleLimit > 0
    ? options.sampleLimit
    : 50;
  const viewportWidth = parseViewportWidth(options.viewportWidth ?? options.viewport);

  const cssUtilities = facts.filter((fact) => fact?.kind === "csg.web.scene.css_utility");
  const cssVariantRules = facts.filter((fact) => fact?.kind === "csg.web.scene.css_variant_rule");
  const nodeFacts = facts.filter((fact) => fact?.kind === "csg.web.scene.node");
  const styleFacts = facts.filter((fact) => fact?.kind === "csg.web.scene.style");
  const layoutFacts = facts.filter((fact) => fact?.kind === "csg.web.scene.layout");
  const paintFacts = facts.filter((fact) => fact?.kind === "csg.web.scene.paint");
  const propFacts = facts.filter((fact) => fact?.kind === "csg.web.scene.prop");
  const routeFacts = facts.filter((fact) => fact?.kind === "csg.web.scene.route");
  const routeInventory = analyzeRouteInventory(routeFacts, options.expectedRoutes);

  const classUtilitiesWithoutDeclarations = [];
  const semanticClassUtilitiesWithoutDeclarations = [];
  const compositeModifierClassUtilitiesWithoutDeclarations = [];
  const disabledPluginClassUtilitiesWithoutDeclarations = [];
  const variantRulesWithoutDeclarations = [];
  const runtimeUnsupportedVariantConditions = [];
  const runtimeUnsupportedDeclarations = [];
  const runtimeNoopDeclarations = [];
  const runtimeUnsupportedArbitrarySelectors = [];
  const runtimeUnsupportedStaticPaintDeclarations = [];
  const inactiveMediaVariantRules = [];
  const nonStaticStyleFacts = [];
  const nodeCountMismatches = [];
  const childCountByNode = countChildNodesByRouteParent(nodeFacts);
  const propCountByNode = countFactsByRouteNode(propFacts);
  const styleCountByNode = countFactsByRouteNode(styleFacts);
  const layoutCountByNode = countFactsByRouteNode(layoutFacts);
  const paintCountByNode = countFactsByRouteNode(paintFacts);

  for (const fact of cssUtilities) {
    const declarations = sceneCssDeclarations(fact);
    if (declarations.length > 0) continue;
    const className = String(fact.className ?? "");
    const baseUtility = String(fact.data?.baseUtility ?? className);
    const item = coverageItem(fact, {
      className,
      baseUtility,
      reason: "css utility has no declarations",
    });
    if (isDisabledPluginUtilityWithoutDeclarations(baseUtility)) {
      disabledPluginClassUtilitiesWithoutDeclarations.push(coverageItem(fact, {
        className,
        baseUtility,
        plugin: "tailwindcss-animate",
        reason: "utility belongs to a Tailwind plugin that is not enabled in the UniMaker React build",
      }));
    } else if (isCompositeModifierUtilityWithoutOwnDeclarations(fact, baseUtility)) {
      compositeModifierClassUtilitiesWithoutDeclarations.push(item);
    } else if (isTailwindUtilityRequiringDeclarations(baseUtility)) {
      classUtilitiesWithoutDeclarations.push(item);
    } else {
      semanticClassUtilitiesWithoutDeclarations.push(item);
    }
  }

  for (const rule of cssVariantRules) {
    const declarations = sceneCssDeclarations(rule);
    const conditions = sceneCssVariantConditions(rule);
    const inactiveMediaCondition = conditions.find((condition) => isInactiveMediaCondition(condition, viewportWidth));
    const inactiveAtViewport = inactiveMediaCondition !== undefined;
    if (inactiveAtViewport) {
      inactiveMediaVariantRules.push(coverageItem(rule, {
        className: String(rule.className ?? ""),
        kind: "media",
        name: String(inactiveMediaCondition.name ?? inactiveMediaCondition.raw ?? ""),
        viewportWidth,
        reason: "media variant is inactive at target viewport",
      }));
    }

    if (declarations.length === 0 && !inactiveAtViewport) {
      variantRulesWithoutDeclarations.push(coverageItem(rule, {
        className: String(rule.className ?? ""),
        reason: "css variant rule has no declarations",
      }));
    }

    for (const condition of conditions) {
      const kind = String(condition.kind ?? "");
      const name = String(condition.name ?? condition.raw ?? "");
      if (isInactiveMediaCondition(condition, viewportWidth)) continue;
      if (!runtimeVariantConditionKinds.has(kind)) {
        runtimeUnsupportedVariantConditions.push(coverageItem(rule, {
          className: String(rule.className ?? ""),
          kind,
          name,
          reason: "variant condition kind is not consumed by Cheng runtime",
        }));
        continue;
      }
      if (kind === "pseudo" && !runtimePseudoNames.has(name)) {
        runtimeUnsupportedVariantConditions.push(coverageItem(rule, {
          className: String(rule.className ?? ""),
          kind,
          name,
          reason: "pseudo variant is not consumed by Cheng runtime",
        }));
      }
      if (kind === "media" && !runtimeMediaConditionSupported(condition)) {
        runtimeUnsupportedVariantConditions.push(coverageItem(rule, {
          className: String(rule.className ?? ""),
          kind,
          name,
          reason: "media variant is not consumed by Cheng runtime",
        }));
      }
      if (kind === "arbitrary-selector") {
        const selector = String(condition.selector ?? name);
        if (!runtimeArbitrarySelectors.has(selector)) {
          runtimeUnsupportedArbitrarySelectors.push(coverageItem(rule, {
            className: String(rule.className ?? ""),
            selector,
            reason: "arbitrary selector is not consumed by Cheng runtime",
          }));
        }
      }
    }

    for (const declaration of declarations) {
      if (inactiveAtViewport) continue;
      const propertyName = String(declaration.propertyName ?? "");
      if (!runtimeCssDeclarationProperties.has(propertyName)) {
        if (isRuntimeNoopCssVariantDeclaration(declaration)) {
          runtimeNoopDeclarations.push(coverageItem(rule, {
            className: String(rule.className ?? ""),
            propertyName,
            propertyValue: String(declaration.propertyValue ?? ""),
            reason: "css declaration is an explicit no-op in the retained renderer",
          }));
          continue;
        }
        runtimeUnsupportedDeclarations.push(coverageItem(rule, {
          className: String(rule.className ?? ""),
          propertyName,
          propertyValue: String(declaration.propertyValue ?? ""),
          reason: "css declaration property is not consumed by Cheng runtime variants",
        }));
      } else if (!runtimeCssDeclarationValueSupported(propertyName, declaration.propertyValue)) {
        runtimeUnsupportedDeclarations.push(coverageItem(rule, {
          className: String(rule.className ?? ""),
          propertyName,
          propertyValue: String(declaration.propertyValue ?? ""),
          reason: "css declaration value is not consumed by Cheng runtime variants",
        }));
      }
    }
  }

  for (const fact of styleFacts) {
    const valueKind = String(fact.valueKind ?? "css");
    if (valueKind !== "css") {
      nonStaticStyleFacts.push(coverageItem(fact, {
        propName: String(fact.propName ?? ""),
        valueKind,
        reason: "scene style fact is not static css",
      }));
      continue;
    }
    const propName = String(fact.propName ?? "");
    if (isRuntimeNoopCssVariantDeclaration({ propertyName: propName, propertyValue: fact.propValue })) {
      runtimeNoopDeclarations.push(coverageItem(fact, {
        propName,
        propValue: String(fact.propValue ?? ""),
        reason: "css declaration is an explicit no-op in the retained renderer",
      }));
      continue;
    }
    if (staticPaintRuntimeRequiredProperties.has(propName)) {
      runtimeUnsupportedStaticPaintDeclarations.push(coverageItem(fact, {
        propName,
        propValue: String(fact.propValue ?? ""),
        reason: "static paint-affecting css property is not consumed by retained scene paint",
      }));
    } else if (runtimeCssDeclarationProperties.has(propName) && !runtimeCssDeclarationValueSupported(propName, fact.propValue)) {
      runtimeUnsupportedStaticPaintDeclarations.push(coverageItem(fact, {
        propName,
        propValue: String(fact.propValue ?? ""),
        reason: "static paint-affecting css value is not consumed by retained scene paint",
      }));
    }
  }

  for (const node of nodeFacts) {
    const routeIndex = Number(node.routeIndex);
    const nodeId = Number(node.nodeId);
    const nodeKey = `${routeIndex}:${nodeId}`;
    const actual = {
      childCount: childCountByNode.get(nodeKey) ?? 0,
      propCount: propCountByNode.get(nodeKey) ?? 0,
      styleCount: styleCountByNode.get(nodeKey) ?? 0,
      layoutCount: layoutCountByNode.get(nodeKey) ?? 0,
      paintCount: paintCountByNode.get(nodeKey) ?? 0,
    };
    const expected = {
      childCount: Number(node.childCount ?? 0),
      propCount: Number(node.propCount ?? 0),
      styleCount: Number(node.styleCount ?? 0),
      layoutCount: Number(node.layoutCount ?? 0),
      paintCount: Number(node.paintCount ?? 0),
    };
    for (const field of Object.keys(expected)) {
      if (expected[field] !== actual[field]) {
        nodeCountMismatches.push(coverageItem(node, {
          field,
          expected: expected[field],
          actual: actual[field],
          reason: "scene node count does not match associated facts",
        }));
      }
    }
  }

  const unsupported = {
    classUtilitiesWithoutDeclarations: summarizeCoverageItems(classUtilitiesWithoutDeclarations, sampleLimit, "className"),
    semanticClassUtilitiesWithoutDeclarations: summarizeCoverageItems(semanticClassUtilitiesWithoutDeclarations, sampleLimit, "className"),
    compositeModifierClassUtilitiesWithoutDeclarations: summarizeCoverageItems(compositeModifierClassUtilitiesWithoutDeclarations, sampleLimit, "className"),
    disabledPluginClassUtilitiesWithoutDeclarations: summarizeCoverageItems(disabledPluginClassUtilitiesWithoutDeclarations, sampleLimit, "className"),
    variantRulesWithoutDeclarations: summarizeCoverageItems(variantRulesWithoutDeclarations, sampleLimit, "className"),
    runtimeUnsupportedVariantConditions: summarizeCoverageItems(runtimeUnsupportedVariantConditions, sampleLimit, "className"),
    runtimeUnsupportedDeclarations: summarizeCoverageItems(runtimeUnsupportedDeclarations, sampleLimit, "propertyName"),
    runtimeNoopDeclarations: summarizeCoverageItems(runtimeNoopDeclarations, sampleLimit, "propertyName"),
    runtimeUnsupportedArbitrarySelectors: summarizeCoverageItems(runtimeUnsupportedArbitrarySelectors, sampleLimit, "selector"),
    runtimeUnsupportedStaticPaintDeclarations: summarizeCoverageItems(runtimeUnsupportedStaticPaintDeclarations, sampleLimit, "propName"),
    inactiveMediaVariantRules: summarizeCoverageItems(inactiveMediaVariantRules, sampleLimit, "className"),
    nonStaticStyleFacts: summarizeCoverageItems(nonStaticStyleFacts, sampleLimit, "propName"),
    nodeCountMismatches: summarizeCoverageItems(nodeCountMismatches, sampleLimit, "field"),
  };

  const hardFailures =
    classUtilitiesWithoutDeclarations.length +
    variantRulesWithoutDeclarations.length +
    runtimeUnsupportedVariantConditions.length +
    runtimeUnsupportedDeclarations.length +
    runtimeUnsupportedArbitrarySelectors.length +
    runtimeUnsupportedStaticPaintDeclarations.length +
    nonStaticStyleFacts.length +
    nodeCountMismatches.length;

  return {
    schema: "unimaker.dom_css_coverage.v1",
    source: "csg.web.scene",
    complete: hardFailures === 0,
    hardFailureCount: hardFailures,
    counts: {
      facts: facts.length,
      routes: routeFacts.length,
      nodes: nodeFacts.length,
      props: propFacts.length,
      classProps: propFacts.filter((fact) => fact.propName === "className" || fact.propName === "class").length,
      styleFacts: styleFacts.length,
      nonStaticStyleFacts: nonStaticStyleFacts.length,
      layoutFacts: layoutFacts.length,
      paintFacts: paintFacts.length,
      cssUtilities: cssUtilities.length,
      cssUtilitiesWithDeclarations: cssUtilities.filter((fact) => sceneCssDeclarations(fact).length > 0).length,
      cssUtilitiesWithoutDeclarations: classUtilitiesWithoutDeclarations.length,
      semanticCssUtilitiesWithoutDeclarations: semanticClassUtilitiesWithoutDeclarations.length,
      compositeModifierClassUtilitiesWithoutDeclarations: compositeModifierClassUtilitiesWithoutDeclarations.length,
      disabledPluginClassUtilitiesWithoutDeclarations: disabledPluginClassUtilitiesWithoutDeclarations.length,
      cssVariantRules: cssVariantRules.length,
      cssVariantRulesWithDeclarations: cssVariantRules.filter((fact) => sceneCssDeclarations(fact).length > 0).length,
      cssVariantRulesWithoutDeclarations: variantRulesWithoutDeclarations.length,
      runtimeUnsupportedVariantConditions: runtimeUnsupportedVariantConditions.length,
      runtimeUnsupportedDeclarations: runtimeUnsupportedDeclarations.length,
      runtimeNoopDeclarations: runtimeNoopDeclarations.length,
      runtimeUnsupportedArbitrarySelectors: runtimeUnsupportedArbitrarySelectors.length,
      runtimeUnsupportedStaticPaintDeclarations: runtimeUnsupportedStaticPaintDeclarations.length,
      inactiveMediaVariantRules: inactiveMediaVariantRules.length,
      nodeCountMismatches: nodeCountMismatches.length,
    },
    targetViewportWidth: viewportWidth,
    routeInventory,
    runtimeSupported: {
      cssVariantDeclarationProperties: Array.from(runtimeCssDeclarationProperties).sort(),
      cssValueGrammars: {
        boxShadow: "none | comma-separated [inset]? <length> <length> <length> [<length>] rgba(r,g,b,a) [inset]?",
        transform: "none | space-separated translateX(<number>px|<number>%) translateY(<number>px|<number>%) scale(<non-negative-number>) scaleX(<non-negative-number>) scaleY(<non-negative-number>) rotate(<90deg-multiple>)",
      },
      cssVariantNoopDeclarations: ["cursor:*", "outline:none"],
      disabledPluginUtilities: Array.from(disabledTailwindAnimatePluginUtilities).sort(),
      staticPaintRuntimeRequiredProperties: Array.from(staticPaintRuntimeRequiredProperties).sort(),
      variantConditionKinds: Array.from(runtimeVariantConditionKinds).sort(),
      pseudoNames: Array.from(runtimePseudoNames).sort(),
      arbitrarySelectors: Array.from(runtimeArbitrarySelectors).sort(),
    },
    unsupported,
  };
}

export function writeSceneDomCssCoverageReport(reportPath, report) {
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
}

export function sceneDomCssCoverageFailureMessages(report) {
  if (report?.complete) return [];
  const counts = report?.counts ?? {};
  return [
    `DOM/CSS coverage incomplete: hardFailureCount=${Number(report?.hardFailureCount ?? 0)}`,
    `cssUtilitiesWithoutDeclarations=${Number(counts.cssUtilitiesWithoutDeclarations ?? 0)}`,
    `compositeModifierClassUtilitiesWithoutDeclarations=${Number(counts.compositeModifierClassUtilitiesWithoutDeclarations ?? 0)}`,
    `disabledPluginClassUtilitiesWithoutDeclarations=${Number(counts.disabledPluginClassUtilitiesWithoutDeclarations ?? 0)}`,
    `cssVariantRulesWithoutDeclarations=${Number(counts.cssVariantRulesWithoutDeclarations ?? 0)}`,
    `runtimeUnsupportedVariantConditions=${Number(counts.runtimeUnsupportedVariantConditions ?? 0)}`,
    `runtimeUnsupportedDeclarations=${Number(counts.runtimeUnsupportedDeclarations ?? 0)}`,
    `runtimeNoopDeclarations=${Number(counts.runtimeNoopDeclarations ?? 0)}`,
    `runtimeUnsupportedArbitrarySelectors=${Number(counts.runtimeUnsupportedArbitrarySelectors ?? 0)}`,
    `runtimeUnsupportedStaticPaintDeclarations=${Number(counts.runtimeUnsupportedStaticPaintDeclarations ?? 0)}`,
    `inactiveMediaVariantRules=${Number(counts.inactiveMediaVariantRules ?? 0)}`,
    `nonStaticStyleFacts=${Number(counts.nonStaticStyleFacts ?? 0)}`,
    `nodeCountMismatches=${Number(counts.nodeCountMismatches ?? 0)}`,
  ];
}

function sceneCssDeclarations(fact) {
  const declarations = fact?.data?.declarations;
  return Array.isArray(declarations) ? declarations : [];
}

function sceneCssVariantConditions(fact) {
  const conditions = fact?.data?.variantChain;
  return Array.isArray(conditions) ? conditions : [];
}

function sceneNodeKey(fact) {
  return `${Number(fact?.routeIndex ?? -1)}:${Number(fact?.nodeId ?? -1)}`;
}

function countFactsByRouteNode(facts) {
  const counts = new Map();
  for (const fact of facts) {
    const key = sceneNodeKey(fact);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function countChildNodesByRouteParent(nodeFacts) {
  const counts = new Map();
  for (const fact of nodeFacts) {
    const parentNodeId = Number(fact?.parentNodeId ?? -1);
    if (!Number.isInteger(parentNodeId) || parentNodeId <= 0) continue;
    const key = `${Number(fact?.routeIndex ?? -1)}:${parentNodeId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function parseViewportWidth(value) {
  if (Number.isInteger(value) && value > 0) return value;
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+)x\d+$/i);
  if (!match) return null;
  const width = Number(match[1]);
  return Number.isInteger(width) && width > 0 ? width : null;
}

function analyzeRouteInventory(routeFacts, expectedRoutes) {
  const generatedRoutes = uniqueStrings(routeFacts.map((fact) => String(fact?.routeId ?? "")));
  const expectedRouteIds = uniqueStrings(Array.isArray(expectedRoutes) ? expectedRoutes : []);
  const generatedSet = new Set(generatedRoutes);
  const missingExpectedRoutes = expectedRouteIds.filter((routeId) => !generatedSet.has(routeId));
  return {
    schema: "unimaker.route_inventory.v1",
    required: expectedRouteIds.length > 0,
    complete: missingExpectedRoutes.length === 0,
    expectedRouteCount: expectedRouteIds.length,
    expectedRoutes: expectedRouteIds,
    generatedRouteCount: generatedRoutes.length,
    generatedRoutes,
    missingExpectedRoutes,
  };
}

function uniqueStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const item = String(value ?? "").trim();
    if (item.length === 0 || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function isInactiveMediaCondition(condition, viewportWidth) {
  if (!Number.isInteger(viewportWidth) || viewportWidth <= 0) return false;
  if (String(condition?.kind ?? "") !== "media") return false;
  const raw = String(condition.name ?? condition.raw ?? "");
  const minWidth = tailwindMediaMinWidths.get(raw);
  if (minWidth !== undefined) return viewportWidth < minWidth;
  const named = raw.match(/^(min|max)-(.+)$/);
  if (named) {
    const breakpoint = tailwindMediaMinWidths.get(named[2]);
    if (breakpoint !== undefined) {
      return named[1] === "min" ? viewportWidth < breakpoint : viewportWidth >= breakpoint;
    }
  }
  const arbitrary = raw.match(/^(min|max)-\[((?:\d+|\d+\.\d+|\.\d+)px)\]$/);
  if (arbitrary) {
    const width = Number(arbitrary[2].slice(0, -2));
    if (Number.isFinite(width)) {
      return arbitrary[1] === "min" ? viewportWidth < width : viewportWidth > width;
    }
  }
  return false;
}

function runtimeMediaConditionSupported(condition) {
  const raw = String(condition?.name ?? condition?.raw ?? "");
  if (tailwindMediaMinWidths.has(raw)) return true;
  const named = raw.match(/^(min|max)-(.+)$/);
  if (named && tailwindMediaMinWidths.has(named[2])) return true;
  return /^(?:min|max)-\[(?:\d+|\d+\.\d+|\.\d+)px\]$/.test(raw);
}

function isCompositeModifierUtilityWithoutOwnDeclarations(fact, baseUtility) {
  const value = String(baseUtility ?? "");
  if (!/^bg-opacity-\d{1,3}$/.test(value)) return false;
  const sourceClassName = String(fact?.data?.sourceClassName ?? "");
  return sourceClassName.split(/\s+/).some((token) =>
    token.startsWith("bg-") &&
    !token.startsWith("bg-opacity-") &&
    !token.startsWith("bg-gradient-")
  );
}

function isDisabledPluginUtilityWithoutDeclarations(baseUtility) {
  return disabledTailwindAnimatePluginUtilities.has(String(baseUtility ?? ""));
}

function isRuntimeNoopCssVariantDeclaration(declaration) {
  const propertyName = String(declaration?.propertyName ?? "");
  const propertyValue = String(declaration?.propertyValue ?? "").trim().toLowerCase();
  if (propertyName === "cursor") return true;
  if (propertyName.startsWith("animation-")) return true;
  return propertyName === "outline" && propertyValue === "none";
}

function runtimeCssDeclarationValueSupported(propertyName, propertyValue) {
  const name = String(propertyName ?? "");
  const value = String(propertyValue ?? "").trim();
  if (name === "box-shadow") return runtimeBoxShadowValueSupported(value);
  if (name === "transform") return runtimeTransformValueSupported(value);
  return true;
}

function runtimeBoxShadowValueSupported(value) {
  if (value === "none") return true;
  if (value.length === 0) return false;
  const segments = splitTopLevelComma(value);
  return segments.length > 0 && segments.every(runtimeBoxShadowSegmentSupported);
}

function runtimeBoxShadowSegmentSupported(segment) {
  const tokens = String(segment ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 4 || tokens.length > 6) return false;
  let insetCount = 0;
  if (tokens[0] === "inset") {
    insetCount += 1;
    tokens.shift();
  }
  if (tokens[tokens.length - 1] === "inset") {
    insetCount += 1;
    tokens.pop();
  }
  if (insetCount > 1) return false;
  if (tokens.length !== 4 && tokens.length !== 5) return false;
  if (!runtimeShadowLengthTokenSupported(tokens[0])) return false;
  if (!runtimeShadowLengthTokenSupported(tokens[1])) return false;
  if (!runtimeShadowLengthTokenSupported(tokens[2])) return false;
  if (tokens[2].startsWith("-")) return false;
  if (tokens.length === 5 && !runtimeShadowLengthTokenSupported(tokens[3])) return false;
  return /^rgba\((?:0|[1-9]\d?|1\d\d|2[0-4]\d|25[0-5]),(?:0|[1-9]\d?|1\d\d|2[0-4]\d|25[0-5]),(?:0|[1-9]\d?|1\d\d|2[0-4]\d|25[0-5]),(?:0|1|0?\.\d+)\)$/.test(tokens[tokens.length - 1]);
}

function runtimeShadowLengthTokenSupported(token) {
  return token === "0" || /^-?(?:\d+|\d+\.\d+|\.\d+)px$/.test(String(token ?? ""));
}

function runtimeTransformValueSupported(value) {
  if (value === "none") return true;
  if (value.length === 0) return false;
  let index = 0;
  while (index < value.length) {
    const nextIndex =
      runtimeConsumeTransformTranslate(value, index, "translateX(") ??
      runtimeConsumeTransformTranslate(value, index, "translateY(") ??
      runtimeConsumeTransformScale(value, index, "scale(") ??
      runtimeConsumeTransformScale(value, index, "scaleX(") ??
      runtimeConsumeTransformScale(value, index, "scaleY(") ??
      runtimeConsumeTransformRotate(value, index, "rotate(");
    if (nextIndex === undefined) return false;
    index = nextIndex;
    if (index < value.length) {
      if (value[index] !== " ") return false;
      while (index < value.length && value[index] === " ") index += 1;
    }
  }
  return true;
}

function runtimeConsumeTransformTranslate(value, index, prefix) {
  if (!value.startsWith(prefix, index)) return undefined;
  const end = value.indexOf(")", index + prefix.length);
  if (end <= index + prefix.length) return undefined;
  const raw = value.slice(index + prefix.length, end);
  if (runtimeTransformNumberSupported(raw.endsWith("px") ? raw.slice(0, -2) : "")) return end + 1;
  if (runtimeTransformNumberSupported(raw.endsWith("%") ? raw.slice(0, -1) : "")) return end + 1;
  return undefined;
}

function runtimeConsumeTransformScale(value, index, prefix) {
  if (!value.startsWith(prefix, index)) return undefined;
  const end = value.indexOf(")", index + prefix.length);
  if (end <= index + prefix.length) return undefined;
  const raw = value.slice(index + prefix.length, end);
  if (!runtimeTransformNumberSupported(raw)) return undefined;
  return raw.startsWith("-") ? undefined : end + 1;
}

function runtimeConsumeTransformRotate(value, index, prefix) {
  if (!value.startsWith(prefix, index)) return undefined;
  const end = value.indexOf(")", index + prefix.length);
  if (end <= index + prefix.length) return undefined;
  const raw = value.slice(index + prefix.length, end);
  if (!raw.endsWith("deg")) return undefined;
  const number = raw.slice(0, -3);
  if (!runtimeTransformNumberSupported(number)) return undefined;
  const degrees = Number(number);
  if (!Number.isFinite(degrees)) return undefined;
  const milli = degrees * 1000;
  if (!Number.isInteger(milli)) return undefined;
  return milli % 90000 === 0 ? end + 1 : undefined;
}

function runtimeTransformNumberSupported(value) {
  return /^-?\d+(?:\.\d+)?$/.test(String(value ?? ""));
}

function splitTopLevelComma(value) {
  const out = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const ch = value[index];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === "," && depth === 0) {
      out.push(value.slice(start, index).trim());
      start = index + 1;
    }
    if (depth < 0) return [];
  }
  if (depth !== 0) return [];
  out.push(value.slice(start).trim());
  return out.filter((item) => item.length > 0);
}

function coverageItem(fact, fields) {
  const out = { ...fields };
  if (fact?.id !== undefined) out.id = String(fact.id);
  if (fact?.routeId !== undefined) out.routeId = String(fact.routeId);
  if (fact?.routeIndex !== undefined) out.routeIndex = Number(fact.routeIndex);
  if (fact?.nodeId !== undefined) out.nodeId = Number(fact.nodeId);
  if (fact?.source !== undefined) out.source = String(fact.source);
  return out;
}

function summarizeCoverageItems(items, sampleLimit, keyField) {
  const counts = new Map();
  for (const item of items) {
    const key = String(item[keyField] ?? item.className ?? item.id ?? "");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const top = Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
    .slice(0, sampleLimit);
  return {
    count: items.length,
    top,
    samples: items.slice(0, sampleLimit),
  };
}

function isTailwindUtilityRequiringDeclarations(baseUtility) {
  const value = String(baseUtility ?? "");
  if (value.length === 0) return false;
  if (markerClassTokens.has(value)) return false;
  for (const prefix of semanticClassPrefixes) {
    if (value.startsWith(prefix)) return false;
  }
  if (/^[a-z]+-[a-z0-9/.[\]()%:_-]+$/i.test(value)) return true;
  if (/^-?(?:m|p)[trblxy]?-[a-z0-9/.[\]%-]+$/i.test(value)) return true;
  if (/^-?(?:top|right|bottom|left|inset|translate|rotate|scale)-/.test(value)) return true;
  return [
    "absolute", "block", "contents", "fixed", "flex", "grid", "hidden", "inline",
    "inline-block", "relative", "sr-only", "sticky", "table", "truncate",
    "visible", "invisible", "collapse", "underline", "italic",
  ].includes(value);
}
