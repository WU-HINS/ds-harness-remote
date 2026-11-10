# Protocol v1 Conformance Fixtures

These fixtures define stable protocol examples for all implementations.

## Provenance

Aligned with upstream `liguobao/ds-harness-remote` at commit
`14037e78f45e14f7a5ad56c2266944548def7e3d` (2026-11-10), whose
`@dsh-remote/protocol` is `0.5.21` — the same version this workspace consumes.
The manifest records the pin; `conformance-fixtures.test.ts` keeps this suite
executable, so a protocol change that breaks these examples fails the gate.

`manifest.json` lists each fixture suite. Consumers must reject unknown fixture format versions.

Each case has a unique name, an operation, an input, and an expected result.

An accepted case can include `value`. Consumers must compare that value after normalization.

A rejected case does not define an implementation-specific error message.

All identifiers, timestamps, keys, and tokens are synthetic. Do not add production data.

Fixture files must remain valid JSON. Do not use comments or language-specific numeric values.

## Operations

- `parseControlFrame` validates one Control frame.
- `selectProtocolVersion` selects the highest common protocol version.
- `selectCapabilities` selects supported capabilities in supported-list order.
- `acceptNegotiatedCapabilities` validates the Server capability selection.
- `parseDeviceRegistrationRequest` validates an account or owned-role registration request.
- `parseHostRegistrationCodeRequest` validates a Host registration-code request.
- `parseDeviceRefreshRequest` validates a device token refresh request.
- `parseDeviceTokenPair` validates device access and refresh credentials.
- `parseBrowserAuthorizationExchangeRequest` validates a Browser credential exchange request.
- `parseBrowserAuthorizationExchangeResponse` validates Browser device credentials and account data.
- `parseRpcErrorPayload` validates one Remote RPC error payload.
- `encodeControlFrameWithLimits` validates and encodes a Control frame with negotiated limits.
- `decodeControlFrameWithLimits` decodes a Control frame with negotiated limits.

`selected: null` represents no common protocol version.

An omitted `negotiated` field represents a legacy Server without a capability list.
