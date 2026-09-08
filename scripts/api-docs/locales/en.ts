export default {
  pageTitle: 'AionUi API',
  title: 'AionUi client API reference · {{target}}',
  perspective: 'Static scan: client type expectations, not a complete server contract.',
  evidence: 'Client call evidence; server status codes, raw response envelope and permissions are unverified.',
  query: 'Present in a client expression; type and requiredness are unverified.',
  body: 'Client-constructed request body type; server constraints are unverified.',
  response: 'Client value after unwrapping: {{type}}. This is not the raw server response contract.',
  inventoryTitle: 'Client API inventory',
  scope:
    'Scope: {{scope}}; source files: {{files}}; candidate records: {{candidates}} (resolved: {{resolved}}, partial: {{partial}}, unknown: {{unknown}}); grouped endpoints: {{endpoints}}.',
  httpHeader:
    '| Target | Method | Path / expression | Query | Request body | Client response type | Status / reason | Source |',
  websocketTitle: 'WebSocket inventory',
  websocketHeader: '| Direction | Event / expression | Connection | Payload schema | Status / reason | Source |',
};
