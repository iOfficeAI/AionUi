---
name: nuonuo-invoice
description: |
  Integrate Nuonuo/JSS invoice APIs for issuing invoices, querying invoice status,
  and re-delivering invoices.
  Use when: (1) User asks to build or maintain 诺诺/诺税通/JSS 发票接口,
  (2) Implementing direct invoice issuance via nuonuo.OpeMplatform.requestBillingNew,
  (3) Implementing legacy scan-to-invoice via nuonuo.ElectronInvoice.saveScanTemp,
  (4) Querying invoice results, invoice lists, or re-delivery flows.
---

# Nuonuo Invoice Skill

Build or maintain Nuonuo invoice integrations using the public JSS API documentation.

**Announce at start:** "I'm using nuonuo-invoice skill to work with Nuonuo/JSS invoice APIs."

## Choose The Right Route First

Default to the **诺税通 SaaS** route unless the user explicitly says they are using
极速开票 / 扫码开票 / 老诺诺发票流程.

### Preferred route: direct invoice issuance

- API: `nuonuo.OpeMplatform.requestBillingNew`
- API id: `100607`
- Doc: `https://jss.com.cn/open/#/api-doc/common-api?id=100607`

Use this when the system needs to submit invoice payloads directly and receive an
`invoiceSerialNum` for follow-up reconciliation.

### Legacy route: scan-to-invoice

- API: `nuonuo.ElectronInvoice.saveScanTemp`
- API id: `100489`
- Doc: `https://jss.com.cn/open/#/api-doc/common-api?id=100489`

Use this only when the business flow is "push order data first, then let the consumer
scan and issue an invoice later".

## Common Transport Rules

Read [api-overview.md](references/api-overview.md) before implementing.

All invoice APIs in this doc set share the same transport shape:

- URL:
  - Prod: `https://sdk.nuonuo.com/open/v1/services`
  - Sandbox: `https://sandbox.nuonuocs.cn/open/v1/services`
- Required headers:
  - `Content-type`
  - `X-Nuonuo-Sign`
  - `accessToken`
  - `method`
- Conditionally required header:
  - `userTax`
- Required envelope fields in body:
  - `senid`
  - `nonce`
  - `timestamp`
  - `appkey`

Prefer the official SDK or an existing verified wrapper for request signing and envelope
assembly. Do not hand-roll `X-Nuonuo-Sign` unless the repo already contains a tested
implementation.

## Implementation Workflow

### Step 1: Confirm the product mode

Decide between:

- **SaaS direct issuance**: `100607`
- **Legacy scan flow**: `100489`

If the user only says "开发票", assume `100607`.

### Step 2: Reuse any existing Nuonuo client

Search the repo for:

- `nuonuo`
- `invoiceSerialNum`
- `X-Nuonuo-Sign`
- `accessToken`
- `requestBillingNew`
- `saveScanTemp`

If an existing client or SDK wrapper exists, extend it instead of creating a parallel client.

### Step 3: Model the payload as typed DTOs

At minimum, validate:

- seller tax number
- buyer identity fields
- invoice type / invoice line
- unique `orderNo`
- invoice detail lines
- delivery mode fields (`buyerPhone`, `email`, etc.)

For `100607`, persist both:

- your business `orderNo`
- Nuonuo `invoiceSerialNum`

This is the key join for later reconciliation.

### Step 4: Make the flow idempotent

Use `orderNo` as the business idempotency key.

Before re-sending:

- check local state first
- if needed, query Nuonuo to see whether the order already produced an invoice

### Step 5: Reconcile after submission

After `100607`, do not assume the invoice is immediately final.

Use:

- `100595` for SaaS invoice list reconciliation
- `100188` for legacy result query

Treat these statuses as final:

- `2`: invoice completed
- `22`: invoice failed
- `24`: sign failed
- `3`: voided

Do not keep polling forever after `22` or `24`.

### Step 6: Support re-delivery

If the business needs SMS/email redelivery, use:

- `nuonuo.OpeMplatform.deliveryInvoice`
- API id `100696`

### Step 7: Keep credentials out of code

Never hardcode:

- `appKey`
- `appSecret`
- `accessToken`
- seller tax numbers used as secrets or environment config

Load them from environment variables, secret stores, or an existing config system.

## Practical Guardrails

- Sandbox and production tax numbers are not interchangeable.
- For `100607`, the sandbox note in the docs says both body `salerTaxNum` and header
  `userTax` should use `339902999999789113`.
- `100595` only allows a time range up to 10 days.
- `100188` allows querying by `serialNos` or `orderNos`; if both are present, serial number wins.
- `100489` is not the same as direct issuance. It creates a scan-based invoicing request.
- The `100607` request schema is large and has many scenario-specific branches. Only send the
  scenario objects you actually need.

## Read The Reference File When

- you need the core API list and docs URLs
- you need the shared header/body envelope
- you need the minimal fields for `100607`
- you need the legacy flow for `100489`
- you need query or re-delivery endpoints

