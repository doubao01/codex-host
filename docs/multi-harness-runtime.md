# Multi-Harness Runtime Architecture

## Invariant

The desktop renderer is injected exactly once. CDP owns target discovery,
script installation, validation and recovery. Harness adapters never own an
injection lifecycle.

## Layers

1. Desktop control / CDP: one injection lifecycle.
2. Renderer core: host bridge, thread ownership and UI capability projection.
3. Host runtime: adapter composition and session ownership.
4. Harness registry: manifests and capabilities.
5. Model gateway: provider registry and routing, independent from harnesses.

## Thread ownership

Each external thread is associated with a harness id and a harness-owned session.
Renderer reloads may recreate bindings but must not recreate sessions.

## Migration rules

- Preserve upstream CDP control as the injection authority.
- Port Model Gateway as an independent host subsystem.
- Replace harness-specific renderer injection with registry selection.
- Add harnesses by adapter + manifest, not by adding another injector.
