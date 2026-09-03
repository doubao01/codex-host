import {
  parseRuntimeProviderContext,
  type RuntimeProviderContext,
} from "@codexhost/shared-contracts";

export interface RuntimeGatewayCredentials {
  endpoint: string;
  token: string;
}

/** Convert host-owned Gateway credentials into the narrow process-boundary contract. */
export function createRuntimeProviderContext(
  gateway: RuntimeGatewayCredentials,
): RuntimeProviderContext {
  return parseRuntimeProviderContext({
    endpoint: gateway.endpoint,
    token: gateway.token,
  });
}
