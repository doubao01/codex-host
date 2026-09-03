import {
  parseRuntimeProviderContext,
  type RuntimeProviderContext,
} from "@codexhost/shared-contracts";

export interface RuntimeGatewayCredentials {
  endpoint: string;
  token: string;
}

/** Validate the host-owned gateway boundary before injecting it into a child runtime. */
export function createRuntimeProviderContext(
  gateway: RuntimeGatewayCredentials,
): RuntimeProviderContext {
  return parseRuntimeProviderContext(gateway);
}
