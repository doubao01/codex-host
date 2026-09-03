# Runtime Provider Injection (No TOML Mutation)

## Goal

CodexHost must not write or mutate the user's `~/.codex/config.toml` in order to
operate its Model Gateway.

## Ownership

- CodexHost owns provider configuration in `model-providers.json`.
- The Model Gateway owns provider selection, credentials and wire translation.
- Harness adapters own their native model/session configuration.
- Renderer owns presentation and selection UI only.

## Runtime rule

A Host Runtime creates exactly one Model Provider Registry and one local Model
Gateway. Remote sessions share that runtime-owned gateway.

## Injection boundary

Provider endpoint and credentials must be supplied through a supported runtime
boundary, in priority order:

1. explicit child-process environment/configuration;
2. harness-native launch configuration;
3. a host-owned model client/transport abstraction.

Persistent Codex configuration files are not a runtime dependency.

## Migration

The legacy `codex-config-writer.ts` remains only as an optional compatibility
utility and must not be called by `AppServerHost` or normal runtime startup.
