/*
 * host_runtime_stubs.c is retired.
 *
 * Production linking must use explicit real provider objects. This file used
 * to export weak fallback symbols that could make missing provider coverage
 * look green. Keeping a compile-time error here prevents old scripts or
 * manual commands from silently reintroducing stub runtime behavior.
 */

#error "src/core/runtime/host_runtime_stubs.c is retired; use explicit real provider objects"
