# ADR 0003: The gateway dials out

**Status:** accepted

## Context

The server must get work to a gateway running on someone's Mac.

## Decision

The gateway is a client. It long-polls `GET /api/gateway/lease`. The server never
initiates a connection to it.

## Rationale

- **NAT.** A laptop has no stable inbound address. Push would require port
  forwarding or a tunnel.
- **It is a production requirement, not just a convenience.** The server runs in
  AWS; the Mac does not. Outbound HTTPS is the only thing that reliably works
  across that boundary — no VPN, no inbound security-group rules.
- **Slots are not burned by an absent gateway.** Because claiming happens on
  request rather than on a timer, nothing leaves the queue when nobody is asking.
  An offline gateway costs nothing; a push design would have to decide what to do
  with undeliverable work.
- **It is trivially testable.** `curl` with a bearer token exercises the entire
  protocol.

## Consequences

- Liveness is inferred from heartbeats, not measured from a held connection.
- Dispatch latency is bounded by the poll interval — irrelevant at one per hour.
- The dashboard's view of gateway health lives at `/api/system/gateway`, outside
  the authenticated `/api/gateway/*` namespace, so the browser never needs the token.
